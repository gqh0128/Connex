use crate::domain::connections::{AuthenticationMethod, ConnectionProfile};
use crate::domain::credentials::SecretString;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionState {
    Connecting,
    VerifyingHost,
    Authenticating,
    Connected,
    Closing,
    Closed,
    Disconnected,
    Error,
}

impl SessionState {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Closed | Self::Disconnected | Self::Error)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HostKeyChallenge {
    pub key_algorithm: String,
    pub fingerprint_sha256: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostKeyDecision {
    AcceptOnce,
    AcceptAndRemember,
    Reject,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionFailureCode {
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionFailure {
    pub code: SessionFailureCode,
    pub message: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionSnapshot {
    pub id: String,
    pub connection_id: String,
    pub connection_name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub state: SessionState,
    pub host_key_challenge: Option<HostKeyChallenge>,
    pub failure: Option<SessionFailure>,
    pub exit_status: Option<u32>,
}

impl SessionSnapshot {
    pub fn connecting(id: String, profile: &ConnectionProfile) -> Self {
        Self {
            id,
            connection_id: profile.id.clone(),
            connection_name: profile.name.clone(),
            host: profile.host.clone(),
            port: profile.port,
            username: profile.username.clone(),
            state: SessionState::Connecting,
            host_key_challenge: None,
            failure: None,
            exit_status: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TerminalSize {
    pub columns: u32,
    pub rows: u32,
    pub pixel_width: u32,
    pub pixel_height: u32,
}

impl TerminalSize {
    pub fn new(
        columns: u32,
        rows: u32,
        pixel_width: u32,
        pixel_height: u32,
    ) -> Result<Self, SessionValidationError> {
        if !(1..=1_000).contains(&columns) {
            return Err(SessionValidationError {
                field: "columns",
                message: "终端列数必须在 1 到 1000 之间。",
            });
        }
        if !(1..=1_000).contains(&rows) {
            return Err(SessionValidationError {
                field: "rows",
                message: "终端行数必须在 1 到 1000 之间。",
            });
        }
        if pixel_width > 100_000 || pixel_height > 100_000 {
            return Err(SessionValidationError {
                field: "terminalSize",
                message: "终端像素尺寸超出允许范围。",
            });
        }

        Ok(Self {
            columns,
            rows,
            pixel_width,
            pixel_height,
        })
    }
}

#[derive(Debug)]
pub enum SessionAuthentication {
    Password(SecretString),
    PrivateKey {
        path: String,
        passphrase: Option<SecretString>,
    },
    Agent,
}

#[derive(Debug)]
pub struct StartSessionRequest {
    pub profile: ConnectionProfile,
    pub authentication: SessionAuthentication,
    pub terminal_size: TerminalSize,
}

impl StartSessionRequest {
    pub fn new(
        profile: ConnectionProfile,
        credential: Option<SecretString>,
        terminal_size: TerminalSize,
    ) -> Result<Self, SessionValidationError> {
        let authentication = match profile.authentication_method {
            AuthenticationMethod::Password => {
                let password = credential.ok_or(SessionValidationError {
                    field: "password",
                    message: "当前连接没有已保存的密码，请编辑连接并补充密码。",
                })?;
                SessionAuthentication::Password(password)
            }
            AuthenticationMethod::PrivateKey => {
                let path = profile
                    .private_key_path
                    .clone()
                    .ok_or(SessionValidationError {
                        field: "privateKeyPath",
                        message: "当前连接没有可用的私钥路径。",
                    })?;
                SessionAuthentication::PrivateKey {
                    path,
                    passphrase: credential,
                }
            }
            AuthenticationMethod::Agent => SessionAuthentication::Agent,
        };

        Ok(Self {
            profile,
            authentication,
            terminal_size,
        })
    }
}

#[derive(Debug)]
pub struct SessionValidationError {
    pub field: &'static str,
    pub message: &'static str,
}

pub enum SessionControl {
    Write(Vec<u8>),
    Resize(TerminalSize),
    Keepalive,
    Close,
}

pub enum SessionEvent {
    Snapshot(SessionSnapshot),
    Output(Vec<u8>),
}
