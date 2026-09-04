use std::fmt;
use std::sync::Arc;

use base64::{Engine as _, engine::general_purpose::STANDARD_NO_PAD};
use keyring::{Entry, Error as KeyringError};
use ring::aead::{AES_256_GCM, Aad, LessSafeKey, Nonce, UnboundKey};
use ring::rand::{SecureRandom, SystemRandom};
use tokio::sync::OnceCell;
use tokio_rusqlite::{Connection, OptionalExtension, params};
use zeroize::Zeroizing;

use crate::domain::credentials::SecretString;
use crate::infrastructure::database::Database;

const MASTER_KEY_SERVICE: &str = "com.gqh.connex.credentials";
const MASTER_KEY_ACCOUNT: &str = "local-master-key-v1";
const LEGACY_CREDENTIAL_SERVICE: &str = "com.gqh.connex.ssh";
const CREDENTIAL_ALGORITHM: &str = "aes-256-gcm-v1";
const MASTER_KEY_LENGTH: usize = 32;
const NONCE_LENGTH: usize = 12;

#[derive(Clone)]
pub struct CredentialStore {
    repository: EncryptedCredentialRepository,
    master_key: Arc<OnceCell<Zeroizing<Vec<u8>>>>,
}

impl CredentialStore {
    pub fn new(database: Database) -> Self {
        Self {
            repository: EncryptedCredentialRepository::new(database),
            master_key: Arc::new(OnceCell::new()),
        }
    }

    pub async fn get(
        &self,
        connection_id: &str,
    ) -> Result<Option<SecretString>, CredentialStoreError> {
        if let Some(encrypted) = self.repository.get(connection_id).await? {
            self.ensure_master_key().await?;
            return self.decrypt(connection_id, encrypted).map(Some);
        }

        let Some(legacy_secret) =
            get_keyring_secret(LEGACY_CREDENTIAL_SERVICE, connection_id).await?
        else {
            return Ok(None);
        };

        self.set(connection_id, legacy_secret).await?;
        delete_keyring_secret(LEGACY_CREDENTIAL_SERVICE, connection_id).await?;

        self.repository
            .get(connection_id)
            .await?
            .map(|encrypted| self.decrypt(connection_id, encrypted))
            .transpose()
    }

    pub async fn set(
        &self,
        connection_id: &str,
        secret: SecretString,
    ) -> Result<(), CredentialStoreError> {
        let encrypted = self.encrypt(connection_id, secret).await?;
        self.repository.set(connection_id, encrypted).await
    }

    pub async fn delete(&self, connection_id: &str) -> Result<(), CredentialStoreError> {
        self.repository.delete(connection_id).await?;
        delete_keyring_secret(LEGACY_CREDENTIAL_SERVICE, connection_id).await
    }

    pub async fn migrate_legacy(&self, connection_id: &str) -> Result<(), CredentialStoreError> {
        if self.repository.get(connection_id).await?.is_some() {
            return delete_keyring_secret(LEGACY_CREDENTIAL_SERVICE, connection_id).await;
        }

        let Some(legacy_secret) =
            get_keyring_secret(LEGACY_CREDENTIAL_SERVICE, connection_id).await?
        else {
            return Ok(());
        };
        self.set(connection_id, legacy_secret).await?;
        delete_keyring_secret(LEGACY_CREDENTIAL_SERVICE, connection_id).await
    }

    async fn encrypt(
        &self,
        connection_id: &str,
        secret: SecretString,
    ) -> Result<EncryptedCredential, CredentialStoreError> {
        let master_key = self.ensure_master_key().await?;
        let cipher = build_cipher(master_key)?;
        let nonce_bytes = random_bytes::<NONCE_LENGTH>()?;
        let nonce = Nonce::assume_unique_for_key(nonce_bytes);
        let mut ciphertext = Zeroizing::new(secret.expose().as_bytes().to_vec());

        cipher
            .seal_in_place_append_tag(nonce, Aad::from(connection_id.as_bytes()), &mut *ciphertext)
            .map_err(|_| CredentialStoreError::Unavailable)?;

        Ok(EncryptedCredential {
            algorithm: CREDENTIAL_ALGORITHM.to_owned(),
            nonce: nonce_bytes.to_vec(),
            ciphertext: ciphertext.to_vec(),
        })
    }

    fn decrypt(
        &self,
        connection_id: &str,
        encrypted: EncryptedCredential,
    ) -> Result<SecretString, CredentialStoreError> {
        if encrypted.algorithm != CREDENTIAL_ALGORITHM {
            return Err(CredentialStoreError::Unavailable);
        }

        let nonce_bytes: [u8; NONCE_LENGTH] = encrypted
            .nonce
            .try_into()
            .map_err(|_| CredentialStoreError::Unavailable)?;
        let master_key = self
            .master_key
            .get()
            .ok_or(CredentialStoreError::Unavailable)?;
        let cipher = build_cipher(master_key)?;
        let mut ciphertext = Zeroizing::new(encrypted.ciphertext);
        let plaintext = cipher
            .open_in_place(
                Nonce::assume_unique_for_key(nonce_bytes),
                Aad::from(connection_id.as_bytes()),
                &mut ciphertext,
            )
            .map_err(|_| CredentialStoreError::Unavailable)?;
        let secret =
            String::from_utf8(plaintext.to_vec()).map_err(|_| CredentialStoreError::Unavailable)?;

        Ok(SecretString::new(secret))
    }

    async fn ensure_master_key(&self) -> Result<&Zeroizing<Vec<u8>>, CredentialStoreError> {
        self.master_key
            .get_or_try_init(|| async {
                if let Some(encoded) =
                    get_keyring_secret(MASTER_KEY_SERVICE, MASTER_KEY_ACCOUNT).await?
                {
                    let decoded = STANDARD_NO_PAD
                        .decode(encoded.expose())
                        .map_err(|_| CredentialStoreError::Unavailable)?;
                    if decoded.len() != MASTER_KEY_LENGTH {
                        return Err(CredentialStoreError::Unavailable);
                    }

                    return Ok(Zeroizing::new(decoded));
                }

                let master_key = Zeroizing::new(random_bytes::<MASTER_KEY_LENGTH>()?.to_vec());
                let encoded = Zeroizing::new(STANDARD_NO_PAD.encode(master_key.as_slice()));
                set_keyring_secret(MASTER_KEY_SERVICE, MASTER_KEY_ACCOUNT, encoded.as_str())
                    .await?;

                Ok(master_key)
            })
            .await
    }
}

#[derive(Clone)]
struct EncryptedCredentialRepository {
    connection: Connection,
}

impl EncryptedCredentialRepository {
    fn new(database: Database) -> Self {
        Self {
            connection: database.connection(),
        }
    }

    async fn get(
        &self,
        connection_id: &str,
    ) -> Result<Option<EncryptedCredential>, CredentialStoreError> {
        let connection_id = connection_id.to_owned();
        self.connection
            .call(
                move |database| -> tokio_rusqlite::rusqlite::Result<Option<EncryptedCredential>> {
                    database
                        .query_row(
                            "SELECT algorithm, nonce, ciphertext \
                             FROM connection_credentials WHERE connection_id = ?1",
                            [connection_id],
                            |row| {
                                Ok(EncryptedCredential {
                                    algorithm: row.get(0)?,
                                    nonce: row.get(1)?,
                                    ciphertext: row.get(2)?,
                                })
                            },
                        )
                        .optional()
                },
            )
            .await
            .map_err(|_| CredentialStoreError::Unavailable)
    }

    async fn set(
        &self,
        connection_id: &str,
        encrypted: EncryptedCredential,
    ) -> Result<(), CredentialStoreError> {
        let connection_id = connection_id.to_owned();
        self.connection
            .call(move |database| -> tokio_rusqlite::rusqlite::Result<()> {
                database.execute(
                    "INSERT INTO connection_credentials (connection_id, algorithm, nonce, ciphertext) \
                     VALUES (?1, ?2, ?3, ?4) \
                     ON CONFLICT(connection_id) DO UPDATE SET \
                        algorithm = excluded.algorithm, \
                        nonce = excluded.nonce, \
                        ciphertext = excluded.ciphertext, \
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                    params![
                        connection_id,
                        encrypted.algorithm,
                        encrypted.nonce,
                        encrypted.ciphertext,
                    ],
                )?;
                Ok(())
            })
            .await
            .map_err(|_| CredentialStoreError::Unavailable)
    }

    async fn delete(&self, connection_id: &str) -> Result<(), CredentialStoreError> {
        let connection_id = connection_id.to_owned();
        self.connection
            .call(move |database| -> tokio_rusqlite::rusqlite::Result<()> {
                database.execute(
                    "DELETE FROM connection_credentials WHERE connection_id = ?1",
                    [connection_id],
                )?;
                Ok(())
            })
            .await
            .map_err(|_| CredentialStoreError::Unavailable)
    }
}

struct EncryptedCredential {
    algorithm: String,
    nonce: Vec<u8>,
    ciphertext: Vec<u8>,
}

fn build_cipher(master_key: &[u8]) -> Result<LessSafeKey, CredentialStoreError> {
    UnboundKey::new(&AES_256_GCM, master_key)
        .map(LessSafeKey::new)
        .map_err(|_| CredentialStoreError::Unavailable)
}

fn random_bytes<const LENGTH: usize>() -> Result<[u8; LENGTH], CredentialStoreError> {
    let mut bytes = [0_u8; LENGTH];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| CredentialStoreError::Unavailable)?;
    Ok(bytes)
}

async fn get_keyring_entry(service: &str, account: &str) -> Result<Entry, CredentialStoreError> {
    Entry::new(service, account).map_err(|_| CredentialStoreError::Unavailable)
}

async fn get_keyring_secret(
    service: &str,
    account: &str,
) -> Result<Option<SecretString>, CredentialStoreError> {
    let entry = get_keyring_entry(service, account).await?;
    tokio::task::spawn_blocking(move || match entry.get_password() {
        Ok(secret) => Ok(Some(SecretString::new(secret))),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err(CredentialStoreError::Unavailable),
    })
    .await
    .map_err(|_| CredentialStoreError::Unavailable)?
}

async fn set_keyring_secret(
    service: &str,
    account: &str,
    secret: &str,
) -> Result<(), CredentialStoreError> {
    let entry = get_keyring_entry(service, account).await?;
    let secret = Zeroizing::new(secret.to_owned());
    tokio::task::spawn_blocking(move || {
        entry
            .set_password(secret.as_str())
            .map_err(|_| CredentialStoreError::Unavailable)
    })
    .await
    .map_err(|_| CredentialStoreError::Unavailable)?
}

async fn delete_keyring_secret(service: &str, account: &str) -> Result<(), CredentialStoreError> {
    let entry = get_keyring_entry(service, account).await?;
    tokio::task::spawn_blocking(move || match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err(CredentialStoreError::Unavailable),
    })
    .await
    .map_err(|_| CredentialStoreError::Unavailable)?
}

#[derive(Debug)]
pub enum CredentialStoreError {
    Unavailable,
}

impl fmt::Display for CredentialStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("encrypted credential storage is unavailable")
    }
}

impl std::error::Error for CredentialStoreError {}
