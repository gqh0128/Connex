use uuid::Uuid;

use crate::domain::connections::{
    AuthenticationMethod, ConnectionDraft, ConnectionOrigin, ConnectionProfile,
};
use crate::domain::credentials::SecretString;
use crate::infrastructure::connections::{ConnectionRepository, ConnectionRepositoryError};
use crate::infrastructure::credentials::{CredentialStore, CredentialStoreError};

#[derive(Clone)]
pub struct ConnectionService {
    repository: ConnectionRepository,
    credentials: CredentialStore,
}

impl ConnectionService {
    pub fn new(repository: ConnectionRepository, credentials: CredentialStore) -> Self {
        Self {
            repository,
            credentials,
        }
    }

    pub async fn list(&self) -> Result<Vec<ConnectionProfile>, ConnectionServiceError> {
        self.repository
            .list()
            .await
            .map_err(ConnectionServiceError::from)
    }

    pub async fn create(
        &self,
        draft: ConnectionDraft,
        credential: Option<SecretString>,
    ) -> Result<ConnectionProfile, ConnectionServiceError> {
        if draft.authentication_method == AuthenticationMethod::Password && credential.is_none() {
            return Err(ConnectionServiceError::InvalidInput {
                field: "password",
                message: "请输入 SSH 登录密码。",
            });
        }

        let id = Uuid::new_v4().to_string();
        let has_stored_credential = credential.is_some();
        if let Some(credential) = credential {
            self.credentials.set(&id, credential).await?;
        }

        match self
            .repository
            .create(
                id.clone(),
                draft,
                has_stored_credential,
                ConnectionOrigin::Manual,
            )
            .await
        {
            Ok(profile) => Ok(profile),
            Err(error) => {
                if has_stored_credential {
                    self.credentials.delete(&id).await?;
                }
                Err(error.into())
            }
        }
    }

    pub async fn update(
        &self,
        id: String,
        draft: ConnectionDraft,
        credential: Option<SecretString>,
    ) -> Result<ConnectionProfile, ConnectionServiceError> {
        let current = self.repository.get(id.clone()).await?;
        let mutation = credential_mutation(&current, &draft, credential)?;
        self.update_with_mutation(id, draft, current, mutation, None)
            .await
    }

    pub async fn credential_for_backup(
        &self,
        profile: &ConnectionProfile,
    ) -> Result<Option<SecretString>, ConnectionServiceError> {
        if !profile.has_stored_credential {
            return Ok(None);
        }

        self.credentials.get(&profile.id).await.map_err(Into::into)
    }

    pub async fn import_profile(
        &self,
        id: String,
        draft: ConnectionDraft,
        credential: Option<SecretString>,
        overwrite: bool,
        origin: ConnectionOrigin,
    ) -> Result<ConnectionProfile, ConnectionServiceError> {
        if self.repository.contains(id.clone()).await? {
            if !overwrite {
                return Err(ConnectionServiceError::Conflict);
            }

            let current = self.repository.get(id.clone()).await?;
            let mutation = credential_mutation_for_import(&current, &draft, credential);
            return self
                .update_with_mutation(id, draft, current, mutation, Some(origin))
                .await;
        }

        self.create_with_id(id, draft, credential, origin).await
    }

    async fn create_with_id(
        &self,
        id: String,
        draft: ConnectionDraft,
        credential: Option<SecretString>,
        origin: ConnectionOrigin,
    ) -> Result<ConnectionProfile, ConnectionServiceError> {
        let has_stored_credential = credential.is_some();
        if let Some(credential) = credential {
            self.credentials.set(&id, credential).await?;
        }

        match self
            .repository
            .create(id.clone(), draft, has_stored_credential, origin)
            .await
        {
            Ok(profile) => Ok(profile),
            Err(error) => {
                if has_stored_credential {
                    self.credentials.delete(&id).await?;
                }
                Err(error.into())
            }
        }
    }

    async fn update_with_mutation(
        &self,
        id: String,
        draft: ConnectionDraft,
        current: ConnectionProfile,
        mutation: CredentialMutation,
        origin: Option<ConnectionOrigin>,
    ) -> Result<ConnectionProfile, ConnectionServiceError> {
        let has_stored_credential = match &mutation {
            CredentialMutation::Keep => current.has_stored_credential,
            CredentialMutation::Set(_) => true,
            CredentialMutation::Delete => false,
        };
        let should_mutate_credential = match &mutation {
            CredentialMutation::Keep => false,
            CredentialMutation::Set(_) => true,
            CredentialMutation::Delete => current.has_stored_credential,
        };
        let previous_credential = if should_mutate_credential && current.has_stored_credential {
            self.credentials.get(&id).await?
        } else {
            None
        };

        match mutation {
            CredentialMutation::Keep => {}
            CredentialMutation::Set(secret) => self.credentials.set(&id, secret).await?,
            CredentialMutation::Delete if current.has_stored_credential => {
                self.credentials.delete(&id).await?
            }
            CredentialMutation::Delete => {}
        }

        match self
            .repository
            .update(id.clone(), draft, has_stored_credential, origin)
            .await
        {
            Ok(profile) => Ok(profile),
            Err(error) => {
                if should_mutate_credential {
                    self.restore_credential(
                        &id,
                        current.has_stored_credential,
                        previous_credential,
                    )
                    .await?;
                }
                Err(error.into())
            }
        }
    }

    pub async fn delete(&self, id: String) -> Result<(), ConnectionServiceError> {
        let current = self.repository.get(id.clone()).await?;
        let previous_credential = if current.has_stored_credential {
            let credential = self.credentials.get(&id).await?;
            self.credentials.delete(&id).await?;
            credential
        } else {
            None
        };

        match self.repository.delete(id.clone()).await {
            Ok(()) => Ok(()),
            Err(error) => {
                if current.has_stored_credential {
                    self.restore_credential(&id, true, previous_credential)
                        .await?;
                }
                Err(error.into())
            }
        }
    }

    pub async fn get_for_session(
        &self,
        id: String,
    ) -> Result<(ConnectionProfile, Option<SecretString>), ConnectionServiceError> {
        let profile = self.repository.get(id).await?;
        let credential = match (profile.authentication_method, profile.has_stored_credential) {
            (_, false) => None,
            (AuthenticationMethod::Password | AuthenticationMethod::PrivateKey, true) => {
                self.credentials.get(&profile.id).await?
            }
            (AuthenticationMethod::Agent, true) => None,
        };

        Ok((profile, credential))
    }

    pub async fn reveal_credential(
        &self,
        id: String,
    ) -> Result<Option<SecretString>, ConnectionServiceError> {
        let profile = self.repository.get(id).await?;
        if !profile.has_stored_credential {
            return Ok(None);
        }

        self.credentials.get(&profile.id).await.map_err(Into::into)
    }

    async fn restore_credential(
        &self,
        id: &str,
        should_exist: bool,
        credential: Option<SecretString>,
    ) -> Result<(), ConnectionServiceError> {
        match (should_exist, credential) {
            (true, Some(secret)) => self.credentials.set(id, secret).await?,
            (true, None) | (false, _) => self.credentials.delete(id).await?,
        }

        Ok(())
    }
}

enum CredentialMutation {
    Keep,
    Set(SecretString),
    Delete,
}

fn credential_mutation(
    current: &ConnectionProfile,
    draft: &ConnectionDraft,
    credential: Option<SecretString>,
) -> Result<CredentialMutation, ConnectionServiceError> {
    if let Some(credential) = credential {
        return Ok(CredentialMutation::Set(credential));
    }

    if current.authentication_method == draft.authentication_method {
        return Ok(CredentialMutation::Keep);
    }

    match draft.authentication_method {
        AuthenticationMethod::Password => Err(ConnectionServiceError::InvalidInput {
            field: "password",
            message: "切换为密码认证时必须输入 SSH 登录密码。",
        }),
        AuthenticationMethod::PrivateKey | AuthenticationMethod::Agent => {
            Ok(CredentialMutation::Delete)
        }
    }
}

fn credential_mutation_for_import(
    current: &ConnectionProfile,
    draft: &ConnectionDraft,
    credential: Option<SecretString>,
) -> CredentialMutation {
    if let Some(credential) = credential {
        return CredentialMutation::Set(credential);
    }

    if current.authentication_method == draft.authentication_method {
        CredentialMutation::Keep
    } else {
        CredentialMutation::Delete
    }
}

#[derive(Debug)]
pub enum ConnectionServiceError {
    InvalidInput {
        field: &'static str,
        message: &'static str,
    },
    NotFound,
    Conflict,
    Storage,
    Credentials,
}

impl From<ConnectionRepositoryError> for ConnectionServiceError {
    fn from(error: ConnectionRepositoryError) -> Self {
        match error {
            ConnectionRepositoryError::NotFound => Self::NotFound,
            ConnectionRepositoryError::Storage => Self::Storage,
        }
    }
}

impl From<CredentialStoreError> for ConnectionServiceError {
    fn from(_: CredentialStoreError) -> Self {
        Self::Credentials
    }
}

impl std::fmt::Display for ConnectionServiceError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidInput { .. } => formatter.write_str("invalid connection profile"),
            Self::NotFound => formatter.write_str("connection profile not found"),
            Self::Conflict => formatter.write_str("connection profile already exists"),
            Self::Storage => formatter.write_str("connection storage is unavailable"),
            Self::Credentials => formatter.write_str("system credential store is unavailable"),
        }
    }
}

impl std::error::Error for ConnectionServiceError {}
