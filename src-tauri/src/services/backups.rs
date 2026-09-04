use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{Engine as _, engine::general_purpose::STANDARD_NO_PAD};
use ring::aead::{AES_256_GCM, Aad, LessSafeKey, Nonce, UnboundKey};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::domain::connections::{
    AuthenticationMethod, ConnectionDraft, ConnectionOrigin, ConnectionProfile,
};
use crate::domain::credentials::SecretString;
use crate::services::connections::{ConnectionService, ConnectionServiceError};

const BACKUP_FORMAT: &str = "connex-backup";
const BACKUP_VERSION: u32 = 1;
const BACKUP_AAD: &[u8] = b"connex-backup-v1";
const BACKUP_CIPHER: &str = "aes-256-gcm";
const BACKUP_KDF: &str = "argon2id";
const BACKUP_KEY_LENGTH: usize = 32;
const BACKUP_NONCE_LENGTH: usize = 12;
const BACKUP_SALT_LENGTH: usize = 16;
const KDF_MEMORY_KIB: u32 = 65_536;
const KDF_ITERATIONS: u32 = 3;
const KDF_PARALLELISM: u32 = 1;
const MIN_EXPORT_PASSWORD_CHARS: usize = 8;
const MAX_BACKUP_BYTES: u64 = 16 * 1024 * 1024;
const MAX_BACKUP_CONNECTIONS: usize = 10_000;

#[derive(Clone)]
pub struct ConnectionBackupService {
    connections: ConnectionService,
}

impl ConnectionBackupService {
    pub fn new(connections: ConnectionService) -> Self {
        Self { connections }
    }

    pub async fn export(
        &self,
        path: PathBuf,
        password: SecretString,
        include_credentials: bool,
    ) -> Result<BackupExportResult, BackupServiceError> {
        validate_export_password(&password)?;
        let profiles = self.connections.list().await?;
        let mut records = Vec::with_capacity(profiles.len());
        let mut credential_count = 0_u32;

        for profile in profiles {
            let credential = if include_credentials {
                self.connections
                    .credential_for_backup(&profile)
                    .await?
                    .map(BackupSecret)
            } else {
                None
            };
            if credential.is_some() {
                credential_count += 1;
            }
            records.push(BackupConnection::from_profile(profile, credential));
        }

        let connection_count =
            u32::try_from(records.len()).map_err(|_| BackupServiceError::InvalidBackup)?;
        let payload = BackupPayload {
            format: BACKUP_FORMAT.to_owned(),
            version: BACKUP_VERSION,
            created_at_unix_ms: unix_time_millis()?,
            includes_credentials: include_credentials,
            connections: records,
        };
        let plaintext = Zeroizing::new(
            serde_json::to_vec(&payload).map_err(|_| BackupServiceError::InvalidBackup)?,
        );
        drop(payload);

        let envelope = encrypt_backup(password, plaintext).await?;
        let output =
            serde_json::to_vec_pretty(&envelope).map_err(|_| BackupServiceError::InvalidBackup)?;
        write_backup_file(&path, &output).await?;

        Ok(BackupExportResult {
            connection_count,
            credential_count,
        })
    }

    pub async fn inspect(
        &self,
        path: PathBuf,
        password: SecretString,
    ) -> Result<BackupPreview, BackupServiceError> {
        validate_export_password(&password)?;
        let payload = read_and_decrypt_backup(&path, password).await?;
        let current_ids: HashSet<String> = self
            .connections
            .list()
            .await?
            .into_iter()
            .map(|profile| profile.id)
            .collect();
        let connection_count = as_u32(payload.connections.len())?;
        let credential_count = as_u32(
            payload
                .connections
                .iter()
                .filter(|connection| connection.credential.is_some())
                .count(),
        )?;
        let conflict_count = as_u32(
            payload
                .connections
                .iter()
                .filter(|connection| current_ids.contains(&connection.id))
                .count(),
        )?;

        Ok(BackupPreview {
            created_at_unix_ms: payload.created_at_unix_ms,
            connection_count,
            credential_count,
            conflict_count,
            includes_credentials: payload.includes_credentials,
        })
    }

    pub async fn import(
        &self,
        path: PathBuf,
        password: SecretString,
        conflict_strategy: BackupConflictStrategy,
    ) -> Result<BackupImportResult, BackupServiceError> {
        validate_export_password(&password)?;
        let payload = read_and_decrypt_backup(&path, password).await?;
        let mut current_ids: HashSet<String> = self
            .connections
            .list()
            .await?
            .into_iter()
            .map(|profile| profile.id)
            .collect();
        let mut prepared = Vec::with_capacity(payload.connections.len());

        for connection in payload.connections {
            let has_conflict = current_ids.contains(&connection.id);
            if has_conflict && conflict_strategy == BackupConflictStrategy::Skip {
                prepared.push(PreparedImport::Skipped);
                continue;
            }

            let target_id = if has_conflict && conflict_strategy == BackupConflictStrategy::KeepBoth
            {
                Uuid::new_v4().to_string()
            } else {
                connection.id.clone()
            };
            let is_overwrite =
                has_conflict && conflict_strategy == BackupConflictStrategy::Overwrite;
            let (draft, credential, origin) = connection.into_parts()?;
            current_ids.insert(target_id.clone());
            prepared.push(PreparedImport::Ready {
                target_id,
                draft,
                credential,
                origin,
                is_overwrite,
                is_duplicate: has_conflict && conflict_strategy == BackupConflictStrategy::KeepBoth,
            });
        }

        let mut result = BackupImportResult::default();
        for item in prepared {
            match item {
                PreparedImport::Skipped => result.skipped_count += 1,
                PreparedImport::Ready {
                    target_id,
                    draft,
                    credential,
                    origin,
                    is_overwrite,
                    is_duplicate,
                } => {
                    self.connections
                        .import_profile(target_id, draft, credential, is_overwrite, origin)
                        .await?;
                    result.imported_count += 1;
                    if is_overwrite {
                        result.overwritten_count += 1;
                    }
                    if is_duplicate {
                        result.duplicated_count += 1;
                    }
                }
            }
        }

        Ok(result)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BackupConflictStrategy {
    Overwrite,
    Skip,
    KeepBoth,
}

pub struct BackupExportResult {
    pub connection_count: u32,
    pub credential_count: u32,
}

pub struct BackupPreview {
    pub created_at_unix_ms: u64,
    pub connection_count: u32,
    pub credential_count: u32,
    pub conflict_count: u32,
    pub includes_credentials: bool,
}

#[derive(Default)]
pub struct BackupImportResult {
    pub imported_count: u32,
    pub overwritten_count: u32,
    pub skipped_count: u32,
    pub duplicated_count: u32,
}

enum PreparedImport {
    Skipped,
    Ready {
        target_id: String,
        draft: ConnectionDraft,
        credential: Option<SecretString>,
        origin: ConnectionOrigin,
        is_overwrite: bool,
        is_duplicate: bool,
    },
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupEnvelope {
    format: String,
    version: u32,
    kdf: BackupKdf,
    cipher: BackupCipher,
    ciphertext: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupKdf {
    algorithm: String,
    salt: String,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupCipher {
    algorithm: String,
    nonce: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupPayload {
    format: String,
    version: u32,
    created_at_unix_ms: u64,
    includes_credentials: bool,
    connections: Vec<BackupConnection>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupConnection {
    id: String,
    name: String,
    host: String,
    port: u16,
    username: String,
    authentication_method: BackupAuthenticationMethod,
    private_key_path: Option<String>,
    credential: Option<BackupSecret>,
    #[serde(default)]
    origin: BackupConnectionOrigin,
}

impl BackupConnection {
    fn from_profile(profile: ConnectionProfile, credential: Option<BackupSecret>) -> Self {
        Self {
            id: profile.id,
            name: profile.name,
            host: profile.host,
            port: profile.port,
            username: profile.username,
            authentication_method: profile.authentication_method.into(),
            private_key_path: profile.private_key_path,
            credential,
            origin: profile.origin.into(),
        }
    }

    fn into_parts(
        self,
    ) -> Result<(ConnectionDraft, Option<SecretString>, ConnectionOrigin), BackupServiceError> {
        let credential = self.credential.map(|secret| secret.0);
        let origin = self.origin.into();
        let draft = ConnectionDraft::new(
            self.name,
            self.host,
            u32::from(self.port),
            self.username,
            self.authentication_method.into(),
            self.private_key_path,
        )
        .map_err(|_| BackupServiceError::InvalidBackup)?;

        Ok((draft, credential, origin))
    }
}

#[derive(Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum BackupConnectionOrigin {
    #[default]
    Manual,
    SshConfig,
}

impl From<ConnectionOrigin> for BackupConnectionOrigin {
    fn from(origin: ConnectionOrigin) -> Self {
        match origin {
            ConnectionOrigin::Manual => Self::Manual,
            ConnectionOrigin::SshConfig => Self::SshConfig,
        }
    }
}

impl From<BackupConnectionOrigin> for ConnectionOrigin {
    fn from(origin: BackupConnectionOrigin) -> Self {
        match origin {
            BackupConnectionOrigin::Manual => Self::Manual,
            BackupConnectionOrigin::SshConfig => Self::SshConfig,
        }
    }
}

#[derive(Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum BackupAuthenticationMethod {
    Password,
    PrivateKey,
    Agent,
}

impl From<AuthenticationMethod> for BackupAuthenticationMethod {
    fn from(method: AuthenticationMethod) -> Self {
        match method {
            AuthenticationMethod::Password => Self::Password,
            AuthenticationMethod::PrivateKey => Self::PrivateKey,
            AuthenticationMethod::Agent => Self::Agent,
        }
    }
}

impl From<BackupAuthenticationMethod> for AuthenticationMethod {
    fn from(method: BackupAuthenticationMethod) -> Self {
        match method {
            BackupAuthenticationMethod::Password => Self::Password,
            BackupAuthenticationMethod::PrivateKey => Self::PrivateKey,
            BackupAuthenticationMethod::Agent => Self::Agent,
        }
    }
}

struct BackupSecret(SecretString);

impl Serialize for BackupSecret {
    fn serialize<SerializerType>(
        &self,
        serializer: SerializerType,
    ) -> Result<SerializerType::Ok, SerializerType::Error>
    where
        SerializerType: Serializer,
    {
        serializer.serialize_str(self.0.expose())
    }
}

impl<'de> Deserialize<'de> for BackupSecret {
    fn deserialize<DeserializerType>(
        deserializer: DeserializerType,
    ) -> Result<Self, DeserializerType::Error>
    where
        DeserializerType: Deserializer<'de>,
    {
        String::deserialize(deserializer)
            .map(SecretString::new)
            .map(Self)
    }
}

async fn encrypt_backup(
    password: SecretString,
    plaintext: Zeroizing<Vec<u8>>,
) -> Result<BackupEnvelope, BackupServiceError> {
    tokio::task::spawn_blocking(move || encrypt_backup_blocking(password, plaintext))
        .await
        .map_err(|_| BackupServiceError::Crypto)?
}

fn encrypt_backup_blocking(
    password: SecretString,
    mut plaintext: Zeroizing<Vec<u8>>,
) -> Result<BackupEnvelope, BackupServiceError> {
    let salt = random_bytes::<BACKUP_SALT_LENGTH>()?;
    let nonce = random_bytes::<BACKUP_NONCE_LENGTH>()?;
    let key = derive_backup_key(
        &password,
        &salt,
        KDF_MEMORY_KIB,
        KDF_ITERATIONS,
        KDF_PARALLELISM,
    )?;
    let cipher = build_backup_cipher(&key)?;
    cipher
        .seal_in_place_append_tag(
            Nonce::assume_unique_for_key(nonce),
            Aad::from(BACKUP_AAD),
            &mut *plaintext,
        )
        .map_err(|_| BackupServiceError::Crypto)?;

    Ok(BackupEnvelope {
        format: BACKUP_FORMAT.to_owned(),
        version: BACKUP_VERSION,
        kdf: BackupKdf {
            algorithm: BACKUP_KDF.to_owned(),
            salt: STANDARD_NO_PAD.encode(salt),
            memory_kib: KDF_MEMORY_KIB,
            iterations: KDF_ITERATIONS,
            parallelism: KDF_PARALLELISM,
        },
        cipher: BackupCipher {
            algorithm: BACKUP_CIPHER.to_owned(),
            nonce: STANDARD_NO_PAD.encode(nonce),
        },
        ciphertext: STANDARD_NO_PAD.encode(plaintext.as_slice()),
    })
}

async fn read_and_decrypt_backup(
    path: &Path,
    password: SecretString,
) -> Result<BackupPayload, BackupServiceError> {
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|_| BackupServiceError::File)?;
    if !metadata.is_file() || metadata.len() > MAX_BACKUP_BYTES {
        return Err(BackupServiceError::InvalidBackup);
    }

    let contents = tokio::fs::read(path)
        .await
        .map_err(|_| BackupServiceError::File)?;
    let envelope: BackupEnvelope =
        serde_json::from_slice(&contents).map_err(|_| BackupServiceError::InvalidBackup)?;
    validate_envelope(&envelope)?;

    let payload = tokio::task::spawn_blocking(move || decrypt_backup_blocking(envelope, password))
        .await
        .map_err(|_| BackupServiceError::Crypto)??;
    validate_payload(&payload)?;
    Ok(payload)
}

fn decrypt_backup_blocking(
    envelope: BackupEnvelope,
    password: SecretString,
) -> Result<BackupPayload, BackupServiceError> {
    let salt = STANDARD_NO_PAD
        .decode(envelope.kdf.salt)
        .map_err(|_| BackupServiceError::InvalidBackup)?;
    let nonce: [u8; BACKUP_NONCE_LENGTH] = STANDARD_NO_PAD
        .decode(envelope.cipher.nonce)
        .map_err(|_| BackupServiceError::InvalidBackup)?
        .try_into()
        .map_err(|_| BackupServiceError::InvalidBackup)?;
    let key = derive_backup_key(
        &password,
        &salt,
        envelope.kdf.memory_kib,
        envelope.kdf.iterations,
        envelope.kdf.parallelism,
    )?;
    let cipher = build_backup_cipher(&key)?;
    let mut ciphertext = Zeroizing::new(
        STANDARD_NO_PAD
            .decode(envelope.ciphertext)
            .map_err(|_| BackupServiceError::InvalidBackup)?,
    );
    let plaintext = cipher
        .open_in_place(
            Nonce::assume_unique_for_key(nonce),
            Aad::from(BACKUP_AAD),
            &mut ciphertext,
        )
        .map_err(|_| BackupServiceError::WrongPasswordOrDamaged)?;

    serde_json::from_slice(plaintext).map_err(|_| BackupServiceError::InvalidBackup)
}

fn derive_backup_key(
    password: &SecretString,
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> Result<Zeroizing<Vec<u8>>, BackupServiceError> {
    let params = Params::new(memory_kib, iterations, parallelism, Some(BACKUP_KEY_LENGTH))
        .map_err(|_| BackupServiceError::InvalidBackup)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new(vec![0_u8; BACKUP_KEY_LENGTH]);
    argon2
        .hash_password_into(password.expose().as_bytes(), salt, &mut key)
        .map_err(|_| BackupServiceError::Crypto)?;
    Ok(key)
}

fn build_backup_cipher(key: &[u8]) -> Result<LessSafeKey, BackupServiceError> {
    UnboundKey::new(&AES_256_GCM, key)
        .map(LessSafeKey::new)
        .map_err(|_| BackupServiceError::Crypto)
}

fn random_bytes<const LENGTH: usize>() -> Result<[u8; LENGTH], BackupServiceError> {
    let mut bytes = [0_u8; LENGTH];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| BackupServiceError::Crypto)?;
    Ok(bytes)
}

fn validate_envelope(envelope: &BackupEnvelope) -> Result<(), BackupServiceError> {
    if envelope.format != BACKUP_FORMAT
        || envelope.version != BACKUP_VERSION
        || envelope.kdf.algorithm != BACKUP_KDF
        || envelope.cipher.algorithm != BACKUP_CIPHER
        || envelope.kdf.memory_kib < 8_192
        || envelope.kdf.memory_kib > 262_144
        || envelope.kdf.iterations == 0
        || envelope.kdf.iterations > 10
        || envelope.kdf.parallelism == 0
        || envelope.kdf.parallelism > 4
    {
        return Err(BackupServiceError::InvalidBackup);
    }

    let salt = STANDARD_NO_PAD
        .decode(&envelope.kdf.salt)
        .map_err(|_| BackupServiceError::InvalidBackup)?;
    if salt.len() != BACKUP_SALT_LENGTH {
        return Err(BackupServiceError::InvalidBackup);
    }

    Ok(())
}

fn validate_payload(payload: &BackupPayload) -> Result<(), BackupServiceError> {
    if payload.format != BACKUP_FORMAT
        || payload.version != BACKUP_VERSION
        || payload.connections.len() > MAX_BACKUP_CONNECTIONS
        || (!payload.includes_credentials
            && payload
                .connections
                .iter()
                .any(|connection| connection.credential.is_some()))
    {
        return Err(BackupServiceError::InvalidBackup);
    }

    let mut ids = HashSet::with_capacity(payload.connections.len());
    for connection in &payload.connections {
        if Uuid::parse_str(&connection.id).is_err()
            || !ids.insert(connection.id.as_str())
            || (connection.authentication_method == BackupAuthenticationMethod::Agent
                && connection.credential.is_some())
        {
            return Err(BackupServiceError::InvalidBackup);
        }
    }

    Ok(())
}

async fn write_backup_file(path: &Path, contents: &[u8]) -> Result<(), BackupServiceError> {
    if path.file_name().is_none() {
        return Err(BackupServiceError::File);
    }

    tokio::fs::write(path, contents)
        .await
        .map_err(|_| BackupServiceError::File)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        tokio::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .await
            .map_err(|_| BackupServiceError::File)?;
    }

    Ok(())
}

fn validate_export_password(password: &SecretString) -> Result<(), BackupServiceError> {
    if password.expose().chars().count() < MIN_EXPORT_PASSWORD_CHARS {
        return Err(BackupServiceError::InvalidInput {
            field: "exportPassword",
            message: "导出密码至少需要 8 个字符。",
        });
    }

    Ok(())
}

fn unix_time_millis() -> Result<u64, BackupServiceError> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| BackupServiceError::Crypto)?
        .as_millis();
    u64::try_from(millis).map_err(|_| BackupServiceError::Crypto)
}

fn as_u32(value: usize) -> Result<u32, BackupServiceError> {
    u32::try_from(value).map_err(|_| BackupServiceError::InvalidBackup)
}

#[derive(Debug)]
pub enum BackupServiceError {
    InvalidInput {
        field: &'static str,
        message: &'static str,
    },
    InvalidBackup,
    WrongPasswordOrDamaged,
    File,
    Crypto,
    Connection(ConnectionServiceError),
}

impl From<ConnectionServiceError> for BackupServiceError {
    fn from(error: ConnectionServiceError) -> Self {
        Self::Connection(error)
    }
}

impl std::fmt::Display for BackupServiceError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidInput { .. } => formatter.write_str("invalid backup input"),
            Self::InvalidBackup => formatter.write_str("invalid connection backup"),
            Self::WrongPasswordOrDamaged => {
                formatter.write_str("incorrect password or damaged backup")
            }
            Self::File => formatter.write_str("backup file is unavailable"),
            Self::Crypto => formatter.write_str("backup encryption is unavailable"),
            Self::Connection(error) => std::fmt::Display::fmt(error, formatter),
        }
    }
}

impl std::error::Error for BackupServiceError {}
