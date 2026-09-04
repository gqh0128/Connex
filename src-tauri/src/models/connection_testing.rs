use serde::{Deserialize, Serialize};

use crate::domain::connections::ConnectionDraft;
use crate::domain::credentials::SecretString;
use crate::domain::sessions::HostKeyChallenge;
use crate::models::connections::SaveConnectionInput;
use crate::models::sessions::{HostKeyChallengeDto, SessionFailureDto};
use crate::services::connection_testing::{ConnectionTestResult, ConnectionTestServiceError};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestSshConnectionInput {
    #[serde(flatten)]
    connection: SaveConnectionInput,
    connection_id: Option<String>,
    accepted_host_key: Option<HostKeyChallengeDto>,
    #[serde(default)]
    should_remember_host_key: bool,
}

pub struct TestSshConnectionParts {
    pub draft: ConnectionDraft,
    pub credential: Option<SecretString>,
    pub can_use_saved_credential: bool,
    pub connection_id: Option<String>,
    pub accepted_host_key: Option<HostKeyChallenge>,
    pub should_remember_host_key: bool,
}

impl TestSshConnectionInput {
    pub fn into_parts(self) -> Result<TestSshConnectionParts, ConnectionTestServiceError> {
        let (draft, credential, should_clear_credential) =
            self.connection.into_parts().map_err(|error| match error {
                crate::services::connections::ConnectionServiceError::InvalidInput {
                    field,
                    message,
                } => ConnectionTestServiceError::InvalidInput { field, message },
                _ => ConnectionTestServiceError::InvalidInput {
                    field: "form",
                    message: "连接参数无效。",
                },
            })?;

        Ok(TestSshConnectionParts {
            draft,
            credential,
            can_use_saved_credential: !should_clear_credential,
            connection_id: self.connection_id,
            accepted_host_key: self.accepted_host_key.map(Into::into),
            should_remember_host_key: self.should_remember_host_key,
        })
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum SshConnectionTestResultDto {
    Success,
    HostKeyRequired { host_key: HostKeyChallengeDto },
    Failed { failure: SessionFailureDto },
}

impl From<ConnectionTestResult> for SshConnectionTestResultDto {
    fn from(result: ConnectionTestResult) -> Self {
        match result {
            ConnectionTestResult::Success => Self::Success,
            ConnectionTestResult::HostKeyRequired(host_key) => Self::HostKeyRequired {
                host_key: host_key.into(),
            },
            ConnectionTestResult::Failed(failure) => Self::Failed {
                failure: failure.into(),
            },
        }
    }
}
