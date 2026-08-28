use serde::{Deserialize, Serialize};

use crate::domain::connections::{
    AuthenticationMethod, ConnectionDraft, ConnectionProfile, ConnectionValidationError,
};
use crate::services::connections::ConnectionServiceError;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthenticationMethodDto {
    Password,
    PrivateKey,
    Agent,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConnectionInput {
    pub name: String,
    pub host: String,
    pub port: u32,
    pub username: String,
    pub authentication_method: AuthenticationMethodDto,
    pub private_key_path: Option<String>,
}

impl TryFrom<SaveConnectionInput> for ConnectionDraft {
    type Error = ConnectionServiceError;

    fn try_from(input: SaveConnectionInput) -> Result<Self, Self::Error> {
        ConnectionDraft::new(
            input.name,
            input.host,
            input.port,
            input.username,
            input.authentication_method.into(),
            input.private_key_path,
        )
        .map_err(ConnectionServiceError::from)
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
            created_at: profile.created_at,
            updated_at: profile.updated_at,
            last_connected_at: profile.last_connected_at,
        }
    }
}
