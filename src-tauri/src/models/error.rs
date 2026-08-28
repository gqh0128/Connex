use serde::Serialize;

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
