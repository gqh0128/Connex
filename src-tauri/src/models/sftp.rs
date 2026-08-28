use serde::Serialize;

use crate::domain::sftp::{RemoteDirectory, RemoteFileEntry, RemoteFileKind};

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
