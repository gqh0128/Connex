use serde::Serialize;

use crate::managers::sessions::SessionManagerError;
use crate::services::connections::ConnectionServiceError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: &'static str,
    pub field: Option<&'static str>,
}

impl From<ConnectionServiceError> for CommandError {
    fn from(error: ConnectionServiceError) -> Self {
        match error {
            ConnectionServiceError::InvalidInput { field, message } => Self {
                code: "invalid_connection",
                message,
                field: Some(field),
            },
            ConnectionServiceError::NotFound => Self {
                code: "connection_not_found",
                message: "找不到这个连接，它可能已被删除。",
                field: None,
            },
            ConnectionServiceError::Storage => Self {
                code: "connection_storage_unavailable",
                message: "连接数据暂时无法访问，请稍后重试。",
                field: None,
            },
        }
    }
}

impl From<SessionManagerError> for CommandError {
    fn from(error: SessionManagerError) -> Self {
        match error {
            SessionManagerError::InvalidInput { field, message } => Self {
                code: "invalid_ssh_session",
                message,
                field: Some(field),
            },
            SessionManagerError::NotFound => Self {
                code: "ssh_session_not_found",
                message: "找不到这个 SSH 会话，它可能已经结束。",
                field: None,
            },
            SessionManagerError::InvalidState => Self {
                code: "invalid_ssh_session_state",
                message: "SSH 会话当前不能执行这个操作。",
                field: None,
            },
            SessionManagerError::Unavailable => Self {
                code: "ssh_session_unavailable",
                message: "SSH 会话暂时不可用，请重新连接。",
                field: None,
            },
        }
    }
}
