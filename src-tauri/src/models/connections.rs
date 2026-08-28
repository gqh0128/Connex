use serde::{Deserialize, Serialize};

use crate::domain::connections::{
    AuthenticationMethod, ConnectionDraft, ConnectionProfile, ConnectionValidationError,
};
use crate::domain::credentials::SecretString;
use crate::services::connections::ConnectionServiceError;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthenticationMethodDto {
    Password,
    PrivateKey,
    Agent,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConnectionInput {
    pub name: String,
    pub host: String,
    pub port: u32,
    pub username: String,
    pub authentication_method: AuthenticationMethodDto,
    pub private_key_path: Option<String>,
    pub password: Option<String>,
    pub private_key_passphrase: Option<String>,
}

impl SaveConnectionInput {
    pub fn into_parts(
        self,
    ) -> Result<(ConnectionDraft, Option<SecretString>), ConnectionServiceError> {
        let authentication_method = AuthenticationMethod::from(self.authentication_method);
        let password = self
            .password
            .filter(|value| !value.is_empty())
            .map(SecretString::new);
        let private_key_passphrase = self
            .private_key_passphrase
            .filter(|value| !value.is_empty())
            .map(SecretString::new);
        let credential = match authentication_method {
            AuthenticationMethod::Password => password,
            AuthenticationMethod::PrivateKey => private_key_passphrase,
            AuthenticationMethod::Agent => None,
        };
        let draft = ConnectionDraft::new(
            self.name,
            self.host,
            self.port,
            self.username,
            authentication_method,
            self.private_key_path,
        )
        .map_err(ConnectionServiceError::from)?;

        Ok((draft, credential))
    }
}

impl From<ConnectionValidationError> for ConnectionServiceError {
    fn from(error: ConnectionValidationError) -> Self {
        Self::InvalidInput {
            field: error.field,
            message: error.message,
        }
    }
}

impl From<AuthenticationMethodDto> for AuthenticationMethod {
    fn from(method: AuthenticationMethodDto) -> Self {
        match method {
            AuthenticationMethodDto::Password => Self::Password,
            AuthenticationMethodDto::PrivateKey => Self::PrivateKey,
            AuthenticationMethodDto::Agent => Self::Agent,
        }
    }
}

impl From<AuthenticationMethod> for AuthenticationMethodDto {
    fn from(method: AuthenticationMethod) -> Self {
        match method {
            AuthenticationMethod::Password => Self::Password,
            AuthenticationMethod::PrivateKey => Self::PrivateKey,
            AuthenticationMethod::Agent => Self::Agent,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfileDto {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub authentication_method: AuthenticationMethodDto,
    pub private_key_path: Option<String>,
    pub has_stored_credential: bool,
    pub created_at: String,
    pub updated_at: String,
    pub last_connected_at: Option<String>,
}

impl From<ConnectionProfile> for ConnectionProfileDto {
    fn from(profile: ConnectionProfile) -> Self {
        Self {
            id: profile.id,
            name: profile.name,
            host: profile.host,
            port: profile.port,
            username: profile.username,
            authentication_method: profile.authentication_method.into(),
            private_key_path: profile.private_key_path,
            has_stored_credential: profile.has_stored_credential,
            created_at: profile.created_at,
            updated_at: profile.updated_at,
            last_connected_at: profile.last_connected_at,
        }
    }
}
