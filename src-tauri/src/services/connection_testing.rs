use crate::domain::connections::ConnectionDraft;
use crate::domain::credentials::SecretString;
use crate::domain::sessions::{HostKeyChallenge, SessionFailure, TestConnectionRequest};
use crate::infrastructure::ssh::{SshConnector, SshTransportError};
use crate::services::connections::{ConnectionService, ConnectionServiceError};

#[derive(Clone)]
pub struct ConnectionTestService {
    connector: SshConnector,
    connections: ConnectionService,
}

impl ConnectionTestService {
    pub fn new(connector: SshConnector, connections: ConnectionService) -> Self {
        Self {
            connector,
            connections,
        }
    }

    pub async fn test(
        &self,
        draft: ConnectionDraft,
        mut credential: Option<SecretString>,
        can_use_saved_credential: bool,
        connection_id: Option<String>,
        accepted_host_key: Option<HostKeyChallenge>,
        should_remember_host_key: bool,
    ) -> Result<ConnectionTestResult, ConnectionTestServiceError> {
        if can_use_saved_credential
            && credential.is_none()
            && let Some(connection_id) = connection_id
        {
            let (saved_profile, saved_credential) = self
                .connections
                .get_for_session(connection_id)
                .await
                .map_err(ConnectionTestServiceError::Connection)?;
            if saved_profile.authentication_method == draft.authentication_method {
                credential = saved_credential;
            }
        }

        let request = TestConnectionRequest::new(
            draft,
            credential,
            accepted_host_key,
            should_remember_host_key,
        )
        .map_err(ConnectionTestServiceError::from)?;

        match self.connector.test(request).await {
            Ok(()) => Ok(ConnectionTestResult::Success),
            Err(SshTransportError::HostKeyUnknown(challenge)) => {
                Ok(ConnectionTestResult::HostKeyRequired(challenge))
            }
            Err(error) => Ok(ConnectionTestResult::Failed(error.failure())),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ConnectionTestResult {
    Success,
    HostKeyRequired(HostKeyChallenge),
    Failed(SessionFailure),
}

#[derive(Debug)]
pub enum ConnectionTestServiceError {
    InvalidInput {
        field: &'static str,
        message: &'static str,
    },
    Connection(ConnectionServiceError),
}

impl From<crate::domain::sessions::SessionValidationError> for ConnectionTestServiceError {
    fn from(error: crate::domain::sessions::SessionValidationError) -> Self {
        Self::InvalidInput {
            field: error.field,
            message: error.message,
        }
    }
}
