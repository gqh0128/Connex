use serde::Serialize;

use crate::managers::sessions::SessionManagerError;
use crate::services::backups::BackupServiceError;
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
            ConnectionServiceError::Conflict => Self {
                code: "connection_conflict",
                message: "这个连接已经存在，请选择覆盖、跳过或保留两份。",
                field: None,
            },
            ConnectionServiceError::Storage => Self {
                code: "connection_storage_unavailable",
                message: "连接数据暂时无法访问，请稍后重试。",
                field: None,
            },
            ConnectionServiceError::Credentials => Self {
                code: "credential_storage_unavailable",
                message: "系统凭据存储暂时无法访问，请检查系统安全设置后重试。",
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

impl From<BackupServiceError> for CommandError {
    fn from(error: BackupServiceError) -> Self {
        match error {
            BackupServiceError::InvalidInput { field, message } => Self {
                code: "invalid_backup_input",
                message,
                field: Some(field),
            },
            BackupServiceError::InvalidBackup => Self {
                code: "invalid_backup",
                message: "这不是有效的 Connex 连接备份，或备份版本暂不受支持。",
                field: None,
            },
            BackupServiceError::WrongPasswordOrDamaged => Self {
                code: "backup_decryption_failed",
                message: "导出密码不正确，或备份文件已经损坏。",
                field: Some("exportPassword"),
            },
            BackupServiceError::File => Self {
                code: "backup_file_unavailable",
                message: "无法访问备份文件，请检查位置和文件权限。",
                field: None,
            },
            BackupServiceError::Crypto => Self {
                code: "backup_encryption_unavailable",
                message: "暂时无法加密或解密连接备份，请稍后重试。",
                field: None,
            },
            BackupServiceError::Connection(error) => Self::from(error),
        }
    }
}
