use uuid::Uuid;

use crate::domain::connections::{AuthenticationMethod, ConnectionDraft, ConnectionProfile};
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
            .create(id.clone(), draft, has_stored_credential)
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
        let has_stored_credential = match &mutation {
            CredentialMutation::Keep => current.has_stored_credential,
            CredentialMutation::Set(_) => true,
            CredentialMutation::Delete => false,
        };
        let should_mutate_credential = !matches!(&mutation, CredentialMutation::Keep);
        let previous_credential = if should_mutate_credential && current.has_stored_credential {
            self.credentials.get(&id).await?
        } else {
            None
        };

        match mutation {
            CredentialMutation::Keep => {}
            CredentialMutation::Set(secret) => self.credentials.set(&id, secret).await?,
            CredentialMutation::Delete => self.credentials.delete(&id).await?,
        }

        match self
            .repository
            .update(id.clone(), draft, has_stored_credential)
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

#[derive(Debug)]
pub enum ConnectionServiceError {
    InvalidInput {
        field: &'static str,
        message: &'static str,
    },
    NotFound,
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
            Self::Storage => formatter.write_str("connection storage is unavailable"),
            Self::Credentials => formatter.write_str("system credential store is unavailable"),
        }
    }
}

impl std::error::Error for ConnectionServiceError {}
