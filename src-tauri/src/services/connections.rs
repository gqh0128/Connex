use uuid::Uuid;

use crate::domain::connections::{ConnectionDraft, ConnectionProfile};
use crate::infrastructure::connections::{ConnectionRepository, ConnectionRepositoryError};

#[derive(Clone)]
pub struct ConnectionService {
    repository: ConnectionRepository,
}

impl ConnectionService {
    pub fn new(repository: ConnectionRepository) -> Self {
        Self { repository }
    }

    pub async fn get(&self, id: String) -> Result<ConnectionProfile, ConnectionServiceError> {
        self.repository
            .get(id)
            .await
            .map_err(ConnectionServiceError::from)
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
    ) -> Result<ConnectionProfile, ConnectionServiceError> {
        self.repository
            .create(Uuid::new_v4().to_string(), draft)
            .await
            .map_err(ConnectionServiceError::from)
    }

    pub async fn update(
        &self,
        id: String,
        draft: ConnectionDraft,
    ) -> Result<ConnectionProfile, ConnectionServiceError> {
        self.repository
            .update(id, draft)
            .await
            .map_err(ConnectionServiceError::from)
    }

    pub async fn delete(&self, id: String) -> Result<(), ConnectionServiceError> {
        self.repository
            .delete(id)
            .await
            .map_err(ConnectionServiceError::from)
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
}

impl From<ConnectionRepositoryError> for ConnectionServiceError {
    fn from(error: ConnectionRepositoryError) -> Self {
        match error {
            ConnectionRepositoryError::NotFound => Self::NotFound,
            ConnectionRepositoryError::Storage => Self::Storage,
        }
    }
}

impl std::fmt::Display for ConnectionServiceError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidInput { .. } => formatter.write_str("invalid connection profile"),
            Self::NotFound => formatter.write_str("connection profile not found"),
            Self::Storage => formatter.write_str("connection storage is unavailable"),
        }
    }
}

impl std::error::Error for ConnectionServiceError {}
