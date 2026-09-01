use serde::{Deserialize, Serialize};

use crate::domain::sftp::{
    LocalDownloadTargetSelection, LocalUploadFileSelection, RemoteDirectory, RemoteDownloadResult,
    RemoteFileEntry, RemoteFileKind, RemoteFileTransferCancelStatus, RemoteFileTransferProgress,
    RemoteUploadResult,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadRemoteFileInput {
    pub transfer_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRemoteFileInput {
    pub transfer_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachRemoteFileTransfersInput {
    pub transfer_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectLocalUploadFilesInput {
    pub session_id: String,
    pub remote_directory: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectLocalDownloadTargetInput {
    pub session_id: String,
    pub remote_path: String,
    pub default_file_name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalUploadFileSelectionDto {
    pub transfer_id: String,
    pub file_name: String,
    pub total_bytes: u64,
}

impl From<LocalUploadFileSelection> for LocalUploadFileSelectionDto {
    fn from(selection: LocalUploadFileSelection) -> Self {
        Self {
            transfer_id: selection.transfer_id,
            file_name: selection.file_name,
            total_bytes: selection.total_bytes,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDownloadTargetSelectionDto {
    pub transfer_id: String,
    pub total_bytes: u64,
}

impl From<LocalDownloadTargetSelection> for LocalDownloadTargetSelectionDto {
    fn from(selection: LocalDownloadTargetSelection) -> Self {
        Self {
            transfer_id: selection.transfer_id,
            total_bytes: selection.total_bytes,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RemoteFileKindDto {
    Directory,
    File,
    Symlink,
    Other,
}

impl From<RemoteFileKind> for RemoteFileKindDto {
    fn from(kind: RemoteFileKind) -> Self {
        match kind {
            RemoteFileKind::Directory => Self::Directory,
            RemoteFileKind::File => Self::File,
            RemoteFileKind::Symlink => Self::Symlink,
            RemoteFileKind::Other => Self::Other,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileEntryDto {
    pub name: String,
    pub path: String,
    pub kind: RemoteFileKindDto,
    pub size: Option<u64>,
    pub modified_at: Option<u64>,
}

impl From<RemoteFileEntry> for RemoteFileEntryDto {
    fn from(entry: RemoteFileEntry) -> Self {
        Self {
            name: entry.name,
            path: entry.path,
            kind: entry.kind.into(),
            size: entry.size,
            modified_at: entry.modified_at,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDirectoryDto {
    pub path: String,
    pub entries: Vec<RemoteFileEntryDto>,
}

impl From<RemoteDirectory> for RemoteDirectoryDto {
    fn from(directory: RemoteDirectory) -> Self {
        Self {
            path: directory.path,
            entries: directory.entries.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileTransferProgressDto {
    pub transfer_id: String,
    pub transferred_bytes: u64,
    pub total_bytes: u64,
    pub bytes_per_second: u64,
}

impl From<RemoteFileTransferProgress> for RemoteFileTransferProgressDto {
    fn from(progress: RemoteFileTransferProgress) -> Self {
        Self {
            transfer_id: progress.transfer_id,
            transferred_bytes: progress.transferred_bytes,
            total_bytes: progress.total_bytes,
            bytes_per_second: progress.bytes_per_second,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteUploadResultDto {
    pub remote_path: String,
    pub total_bytes: u64,
}

impl From<RemoteUploadResult> for RemoteUploadResultDto {
    fn from(result: RemoteUploadResult) -> Self {
        Self {
            remote_path: result.remote_path,
            total_bytes: result.total_bytes,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDownloadResultDto {
    pub local_path: std::path::PathBuf,
    pub total_bytes: u64,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RemoteFileTransferCancelStatusDto {
    Accepted,
    TooLate,
    NotFound,
}

impl From<RemoteFileTransferCancelStatus> for RemoteFileTransferCancelStatusDto {
    fn from(status: RemoteFileTransferCancelStatus) -> Self {
        match status {
            RemoteFileTransferCancelStatus::Accepted => Self::Accepted,
            RemoteFileTransferCancelStatus::TooLate => Self::TooLate,
            RemoteFileTransferCancelStatus::NotFound => Self::NotFound,
        }
    }
}

impl From<RemoteDownloadResult> for RemoteDownloadResultDto {
    fn from(result: RemoteDownloadResult) -> Self {
        Self {
            local_path: result.local_path,
            total_bytes: result.total_bytes,
        }
    }
}
