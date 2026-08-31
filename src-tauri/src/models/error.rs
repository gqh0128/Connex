use serde::Serialize;

use crate::infrastructure::app_settings::AppSettingsRepositoryError;
use crate::managers::sessions::SessionManagerError;
use crate::services::backups::BackupServiceError;
use crate::services::connections::ConnectionServiceError;
use crate::services::terminal_fonts::TerminalFontServiceError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: &'static str,
    pub field: Option<&'static str>,
}

impl From<AppSettingsRepositoryError> for CommandError {
    fn from(_: AppSettingsRepositoryError) -> Self {
        Self {
            code: "app_settings_unavailable",
            message: "应用设置暂时无法访问，请稍后重试。",
            field: None,
        }
    }
}

impl From<TerminalFontServiceError> for CommandError {
    fn from(error: TerminalFontServiceError) -> Self {
        match error {
            TerminalFontServiceError::InvalidInput { field, message } => Self {
                code: "invalid_terminal_font",
                message,
                field: Some(field),
            },
            TerminalFontServiceError::NotFound => Self {
                code: "terminal_font_not_found",
                message: "找不到这个终端字体，它可能已被删除。",
                field: None,
            },
            TerminalFontServiceError::Unsupported => Self {
                code: "unsupported_terminal_font",
                message: "字体文件无效或格式不受支持，请选择 TTF、OTF、WOFF 或 WOFF2 文件。",
                field: Some("path"),
            },
            TerminalFontServiceError::TooLarge => Self {
                code: "terminal_font_too_large",
                message: "字体文件不能超过 10 MB。",
                field: Some("path"),
            },
            TerminalFontServiceError::File => Self {
                code: "terminal_font_file_unavailable",
                message: "无法访问字体文件，请检查文件是否存在以及访问权限。",
                field: Some("path"),
            },
            TerminalFontServiceError::Storage => Self {
                code: "terminal_font_storage_unavailable",
                message: "终端字体暂时无法保存，请稍后重试。",
                field: None,
            },
        }
    }
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
            SessionManagerError::InvalidRemotePath => Self {
                code: "invalid_remote_path",
                message: "远程路径无效，请返回上一级目录后重试。",
                field: Some("path"),
            },
            SessionManagerError::InvalidRemoteName => Self {
                code: "invalid_remote_name",
                message: "名称不能为空，且不能是 .、.. 或包含 /。",
                field: Some("name"),
            },
            SessionManagerError::InvalidLocalFile => Self {
                code: "local_file_unavailable",
                message: "无法读取这个本地文件，请检查文件是否仍然存在以及访问权限。",
                field: Some("localPath"),
            },
            SessionManagerError::RemoteFilesUnavailable => Self {
                code: "sftp_unavailable",
                message: "服务器没有提供可用的 SFTP 文件服务。",
                field: None,
            },
            SessionManagerError::RemoteDirectoryUnavailable => Self {
                code: "remote_directory_unavailable",
                message: "无法读取这个远程目录，请检查路径和访问权限。",
                field: Some("path"),
            },
            SessionManagerError::RemoteEntryExists => Self {
                code: "remote_entry_exists",
                message: "当前目录中已经存在同名文件或文件夹。",
                field: Some("name"),
            },
            SessionManagerError::RemoteFileExists => Self {
                code: "remote_file_exists",
                message: "远程目录中已经存在同名文件，Connex 没有覆盖它。",
                field: Some("remoteDirectory"),
            },
            SessionManagerError::RemoteCreateFailed => Self {
                code: "remote_create_failed",
                message: "创建失败，请检查当前目录权限和连接状态。",
                field: None,
            },
            SessionManagerError::RemoteRenameFailed => Self {
                code: "remote_rename_failed",
                message: "重命名失败，请检查文件权限和连接状态。",
                field: None,
            },
            SessionManagerError::RemoteDeleteFailed => Self {
                code: "remote_delete_failed",
                message: "删除失败，请检查权限；文件夹必须为空才能删除。",
                field: None,
            },
            SessionManagerError::TransferCancelled => Self {
                code: "transfer_cancelled",
                message: "文件上传已取消。",
                field: None,
            },
            SessionManagerError::RemoteUploadFailed => Self {
                code: "remote_upload_failed",
                message: "文件上传失败，请检查远程目录权限和连接状态。",
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
