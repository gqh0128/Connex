use std::sync::Arc;

use russh_sftp::client::SftpSession;
use russh_sftp::protocol::FileType;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::RwLock;

use crate::domain::sftp::{RemoteDirectory, RemoteFileEntry, RemoteFileKind};

const MAX_REMOTE_PATH_BYTES: usize = 16 * 1024;

pub type SharedRemoteFileSession = Arc<RwLock<RemoteFileSessionState>>;

#[derive(Clone)]
pub enum RemoteFileSessionState {
    Connecting,
    Ready(RemoteFileSession),
    Unavailable,
}

#[derive(Clone)]
pub struct RemoteFileSession {
    client: Arc<SftpSession>,
    default_directory: Arc<str>,
}

impl RemoteFileSession {
    pub async fn connect<S>(stream: S) -> Result<Self, RemoteFileError>
    where
        S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
    {
        let client = SftpSession::new(stream)
            .await
            .map_err(|_| RemoteFileError::Unavailable)?;
        let default_directory = client
            .canonicalize(".")
            .await
            .map_err(|_| RemoteFileError::Unavailable)?;

        Ok(Self {
            client: Arc::new(client),
            default_directory: Arc::from(default_directory),
        })
    }

    pub async fn list_directory(
        &self,
        requested_path: Option<&str>,
    ) -> Result<RemoteDirectory, RemoteFileError> {
        let requested_path = requested_path.unwrap_or(&self.default_directory);
        validate_remote_path(requested_path)?;

        let path = self
            .client
            .canonicalize(requested_path)
            .await
            .map_err(|_| RemoteFileError::DirectoryUnavailable)?;
        let directory = self
            .client
            .read_dir(path.clone())
            .await
            .map_err(|_| RemoteFileError::DirectoryUnavailable)?;
        let mut entries = directory
            .map(|entry| {
                let metadata = entry.metadata();
                let kind = match entry.file_type() {
                    FileType::Dir => RemoteFileKind::Directory,
                    FileType::File => RemoteFileKind::File,
                    FileType::Symlink => RemoteFileKind::Symlink,
                    FileType::Other => RemoteFileKind::Other,
                };

                RemoteFileEntry {
                    name: entry.file_name(),
                    path: entry.path(),
                    kind,
                    size: metadata.size,
                    modified_at: metadata.mtime.map(u64::from),
                }
            })
            .collect::<Vec<_>>();

        entries.sort_by(|left, right| {
            let left_rank = u8::from(left.kind != RemoteFileKind::Directory);
            let right_rank = u8::from(right.kind != RemoteFileKind::Directory);
            left_rank
                .cmp(&right_rank)
                .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
        });

        Ok(RemoteDirectory { path, entries })
    }
}

fn validate_remote_path(path: &str) -> Result<(), RemoteFileError> {
    if path.is_empty() || path.len() > MAX_REMOTE_PATH_BYTES || path.contains('\0') {
        return Err(RemoteFileError::InvalidPath);
    }

    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RemoteFileError {
    InvalidPath,
    Unavailable,
    DirectoryUnavailable,
}

impl std::fmt::Display for RemoteFileError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidPath => formatter.write_str("invalid remote path"),
            Self::Unavailable => formatter.write_str("remote file session is unavailable"),
            Self::DirectoryUnavailable => formatter.write_str("remote directory is unavailable"),
        }
    }
}

impl std::error::Error for RemoteFileError {}
