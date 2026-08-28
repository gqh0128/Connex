use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::domain::sftp::{
    RemoteDirectory, RemoteFileEntry, RemoteFileKind, RemoteUploadProgress, RemoteUploadResult,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadRemoteFileInput {
    pub transfer_id: String,
    pub session_id: String,
    pub local_path: PathBuf,
    pub remote_directory: String,
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
pub struct RemoteUploadProgressDto {
    pub transfer_id: String,
    pub transferred_bytes: u64,
    pub total_bytes: u64,
    pub bytes_per_second: u64,
}

impl From<RemoteUploadProgress> for RemoteUploadProgressDto {
    fn from(progress: RemoteUploadProgress) -> Self {
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
