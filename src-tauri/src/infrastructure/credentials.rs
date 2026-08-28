use std::fmt;

use keyring::{Entry, Error as KeyringError};

use crate::domain::credentials::SecretString;

const CREDENTIAL_SERVICE: &str = "com.gqh.connex.ssh";

#[derive(Clone, Default)]
pub struct CredentialStore;

impl CredentialStore {
    pub fn new() -> Self {
        Self
    }

    pub async fn get(
        &self,
        connection_id: &str,
    ) -> Result<Option<SecretString>, CredentialStoreError> {
        let connection_id = connection_id.to_owned();

        tokio::task::spawn_blocking(move || {
            let entry = credential_entry(&connection_id)?;
            match entry.get_password() {
                Ok(secret) => Ok(Some(SecretString::new(secret))),
                Err(KeyringError::NoEntry) => Ok(None),
                Err(_) => Err(CredentialStoreError::Unavailable),
            }
        })
        .await
        .map_err(|_| CredentialStoreError::Unavailable)?
    }

    pub async fn set(
        &self,
        connection_id: &str,
        secret: SecretString,
    ) -> Result<(), CredentialStoreError> {
        let connection_id = connection_id.to_owned();

        tokio::task::spawn_blocking(move || {
            credential_entry(&connection_id)?
                .set_password(secret.expose())
                .map_err(|_| CredentialStoreError::Unavailable)
        })
        .await
        .map_err(|_| CredentialStoreError::Unavailable)?
    }

    pub async fn delete(&self, connection_id: &str) -> Result<(), CredentialStoreError> {
        let connection_id = connection_id.to_owned();

        tokio::task::spawn_blocking(move || {
            let entry = credential_entry(&connection_id)?;
            match entry.delete_credential() {
                Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
                Err(_) => Err(CredentialStoreError::Unavailable),
            }
        })
        .await
        .map_err(|_| CredentialStoreError::Unavailable)?
    }
}

fn credential_entry(connection_id: &str) -> Result<Entry, CredentialStoreError> {
    Entry::new(CREDENTIAL_SERVICE, connection_id).map_err(|_| CredentialStoreError::Unavailable)
}

#[derive(Debug)]
pub enum CredentialStoreError {
    Unavailable,
}

impl fmt::Display for CredentialStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("system credential store is unavailable")
    }
}

impl std::error::Error for CredentialStoreError {}
