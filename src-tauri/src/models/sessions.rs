use serde::{Deserialize, Serialize};

use crate::domain::sessions::{
    HostKeyChallenge, HostKeyDecision, SessionFailure, SessionFailureCode, SessionSnapshot,
    SessionState, TerminalSize,
};
use crate::managers::sessions::SessionManagerError;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSshSessionInput {
    pub connection_id: String,
    pub password: Option<String>,
    pub private_key_passphrase: Option<String>,
    pub columns: u32,
    pub rows: u32,
    #[serde(default)]
    pub pixel_width: u32,
    #[serde(default)]
    pub pixel_height: u32,
}

impl StartSshSessionInput {
    pub fn terminal_size(&self) -> Result<TerminalSize, SessionManagerError> {
        TerminalSize::new(self.columns, self.rows, self.pixel_width, self.pixel_height)
            .map_err(SessionManagerError::from)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResizeSshSessionInput {
    pub columns: u32,
    pub rows: u32,
    #[serde(default)]
    pub pixel_width: u32,
    #[serde(default)]
    pub pixel_height: u32,
}

impl TryFrom<ResizeSshSessionInput> for TerminalSize {
    type Error = SessionManagerError;

    fn try_from(input: ResizeSshSessionInput) -> Result<Self, Self::Error> {
        Self::new(
            input.columns,
            input.rows,
            input.pixel_width,
            input.pixel_height,
        )
        .map_err(SessionManagerError::from)
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HostKeyDecisionDto {
    AcceptOnce,
    AcceptAndRemember,
    Reject,
}

impl From<HostKeyDecisionDto> for HostKeyDecision {
    fn from(decision: HostKeyDecisionDto) -> Self {
        match decision {
            HostKeyDecisionDto::AcceptOnce => Self::AcceptOnce,
            HostKeyDecisionDto::AcceptAndRemember => Self::AcceptAndRemember,
            HostKeyDecisionDto::Reject => Self::Reject,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionStateDto {
    Connecting,
    VerifyingHost,
    Authenticating,
    Connected,
    Closing,
    Closed,
    Disconnected,
    Error,
}

impl From<SessionState> for SessionStateDto {
    fn from(state: SessionState) -> Self {
        match state {
            SessionState::Connecting => Self::Connecting,
            SessionState::VerifyingHost => Self::VerifyingHost,
            SessionState::Authenticating => Self::Authenticating,
            SessionState::Connected => Self::Connected,
            SessionState::Closing => Self::Closing,
            SessionState::Closed => Self::Closed,
            SessionState::Disconnected => Self::Disconnected,
            SessionState::Error => Self::Error,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyChallengeDto {
    pub key_algorithm: String,
    pub fingerprint_sha256: String,
}

impl From<HostKeyChallenge> for HostKeyChallengeDto {
    fn from(challenge: HostKeyChallenge) -> Self {
        Self {
            key_algorithm: challenge.key_algorithm,
            fingerprint_sha256: challenge.fingerprint_sha256,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionFailureCodeDto {
    NetworkUnavailable,
    HostVerificationFailed,
    HostKeyChanged,
    AuthenticationFailed,
    AgentUnavailable,
    PrivateKeyUnavailable,
    ShellUnavailable,
    ConnectionLost,
    Internal,
}

impl From<SessionFailureCode> for SessionFailureCodeDto {
    fn from(code: SessionFailureCode) -> Self {
        match code {
            SessionFailureCode::NetworkUnavailable => Self::NetworkUnavailable,
            SessionFailureCode::HostVerificationFailed => Self::HostVerificationFailed,
            SessionFailureCode::HostKeyChanged => Self::HostKeyChanged,
            SessionFailureCode::AuthenticationFailed => Self::AuthenticationFailed,
            SessionFailureCode::AgentUnavailable => Self::AgentUnavailable,
            SessionFailureCode::PrivateKeyUnavailable => Self::PrivateKeyUnavailable,
            SessionFailureCode::ShellUnavailable => Self::ShellUnavailable,
            SessionFailureCode::ConnectionLost => Self::ConnectionLost,
            SessionFailureCode::Internal => Self::Internal,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFailureDto {
    pub code: SessionFailureCodeDto,
    pub message: String,
}

impl From<SessionFailure> for SessionFailureDto {
    fn from(failure: SessionFailure) -> Self {
        Self {
            code: failure.code.into(),
            message: failure.message,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshotDto {
    pub id: String,
    pub connection_id: String,
    pub connection_name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub state: SessionStateDto,
    pub host_key_challenge: Option<HostKeyChallengeDto>,
    pub failure: Option<SessionFailureDto>,
    pub exit_status: Option<u32>,
}

impl From<SessionSnapshot> for SessionSnapshotDto {
    fn from(snapshot: SessionSnapshot) -> Self {
        Self {
            id: snapshot.id,
            connection_id: snapshot.connection_id,
            connection_name: snapshot.connection_name,
            host: snapshot.host,
            port: snapshot.port,
            username: snapshot.username,
            state: snapshot.state.into(),
            host_key_challenge: snapshot.host_key_challenge.map(Into::into),
            failure: snapshot.failure.map(Into::into),
            exit_status: snapshot.exit_status,
        }
    }
}
