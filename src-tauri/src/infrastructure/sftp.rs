use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

use russh_sftp::client::SftpSession;
use russh_sftp::protocol::{FileType, OpenFlags};
use tokio::fs::File as LocalFile;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::{RwLock, mpsc, watch};

use crate::domain::sftp::{
    RemoteDirectory, RemoteFileEntry, RemoteFileKind, RemoteUploadProgress, RemoteUploadResult,
};

const MAX_REMOTE_PATH_BYTES: usize = 16 * 1024;
const MAX_REMOTE_FILE_NAME_BYTES: usize = 255;
const UPLOAD_CHUNK_BYTES: usize = 64 * 1024;

pub type SharedRemoteFileSession = Arc<RwLock<RemoteFileSessionState>>;

#[derive(Clone)]
pub enum RemoteFileSessionState {
    Idle,
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

    pub async fn create_directory(
        &self,
        parent_path: &str,
        name: &str,
    ) -> Result<String, RemoteFileError> {
        validate_remote_file_name(name)?;
        let parent_path = self
            .client
            .canonicalize(parent_path)
            .await
            .map_err(|_| RemoteFileError::DirectoryUnavailable)?;
        let path = join_remote_path(&parent_path, name);
        if self
            .client
            .try_exists(path.clone())
            .await
            .map_err(|_| RemoteFileError::CreateFailed)?
        {
            return Err(RemoteFileError::EntryExists);
        }

        self.client
            .create_dir(path.clone())
            .await
            .map_err(|_| RemoteFileError::CreateFailed)?;
        Ok(path)
    }

    pub async fn create_file(
        &self,
        parent_path: &str,
        name: &str,
    ) -> Result<String, RemoteFileError> {
        validate_remote_file_name(name)?;
        let parent_path = self
            .client
            .canonicalize(parent_path)
            .await
            .map_err(|_| RemoteFileError::DirectoryUnavailable)?;
        let path = join_remote_path(&parent_path, name);
        if self
            .client
            .try_exists(path.clone())
            .await
            .map_err(|_| RemoteFileError::CreateFailed)?
        {
            return Err(RemoteFileError::EntryExists);
        }

        let file = self
            .client
            .open_with_flags(
                path.clone(),
                OpenFlags::CREATE | OpenFlags::EXCLUDE | OpenFlags::WRITE,
            )
            .await
            .map_err(|_| RemoteFileError::CreateFailed)?;
        file.close()
            .await
            .map_err(|_| RemoteFileError::CreateFailed)?;
        Ok(path)
    }

    pub async fn rename_entry(
        &self,
        path: &str,
        new_name: &str,
    ) -> Result<String, RemoteFileError> {
        validate_mutable_remote_path(path)?;
        validate_remote_file_name(new_name)?;
        let path = path.trim_end_matches('/');
        let current_name = path
            .rsplit('/')
            .next()
            .ok_or(RemoteFileError::InvalidPath)?;
        if current_name == new_name {
            return Ok(path.to_owned());
        }

        let parent_path = remote_parent_directory(path)?;
        let next_path = join_remote_path(&parent_path, new_name);
        if self
            .client
            .try_exists(next_path.clone())
            .await
            .map_err(|_| RemoteFileError::RenameFailed)?
        {
            return Err(RemoteFileError::EntryExists);
        }

        self.client
            .rename(path, next_path.clone())
            .await
            .map_err(|_| RemoteFileError::RenameFailed)?;
        Ok(next_path)
    }

    pub async fn delete_entry(&self, path: &str) -> Result<(), RemoteFileError> {
        validate_mutable_remote_path(path)?;
        let metadata = self
            .client
            .symlink_metadata(path)
            .await
            .map_err(|_| RemoteFileError::DeleteFailed)?;

        if metadata.file_type().is_dir() {
            self.client
                .remove_dir(path)
                .await
                .map_err(|_| RemoteFileError::DeleteFailed)
        } else {
            self.client
                .remove_file(path)
                .await
                .map_err(|_| RemoteFileError::DeleteFailed)
        }
    }

    pub async fn upload_file(
        &self,
        transfer_id: &str,
        local_path: &Path,
        remote_directory: &str,
        mut cancellation: watch::Receiver<bool>,
        progress: mpsc::Sender<RemoteUploadProgress>,
    ) -> Result<RemoteUploadResult, RemoteFileError> {
        validate_remote_path(remote_directory)?;
        let file_name = local_path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or(RemoteFileError::InvalidLocalFile)?;
        validate_remote_file_name(file_name).map_err(|_| RemoteFileError::InvalidLocalFile)?;

        let mut local_file = LocalFile::open(local_path)
            .await
            .map_err(|_| RemoteFileError::InvalidLocalFile)?;
        let local_metadata = local_file
            .metadata()
            .await
            .map_err(|_| RemoteFileError::InvalidLocalFile)?;
        if !local_metadata.is_file() {
            return Err(RemoteFileError::InvalidLocalFile);
        }

        let remote_directory = self
            .client
            .canonicalize(remote_directory)
            .await
            .map_err(|_| RemoteFileError::DirectoryUnavailable)?;
        let remote_path = join_remote_path(&remote_directory, file_name);
        if self
            .client
            .try_exists(remote_path.clone())
            .await
            .map_err(|_| RemoteFileError::UploadFailed)?
        {
            return Err(RemoteFileError::RemoteFileExists);
        }

        let temporary_name = format!(".connex-upload-{transfer_id}.part");
        let temporary_path = join_remote_path(&remote_directory, &temporary_name);
        let mut remote_file = self
            .client
            .open_with_flags(
                temporary_path.clone(),
                OpenFlags::CREATE | OpenFlags::EXCLUDE | OpenFlags::WRITE,
            )
            .await
            .map_err(|_| RemoteFileError::UploadFailed)?;
        let total_bytes = local_metadata.len();
        let started_at = Instant::now();
        let mut transferred_bytes = 0_u64;
        let mut buffer = vec![0_u8; UPLOAD_CHUNK_BYTES];
        send_upload_progress(
            &progress,
            transfer_id,
            transferred_bytes,
            total_bytes,
            started_at,
        );

        let upload_result = async {
            loop {
                if *cancellation.borrow() {
                    return Err(RemoteFileError::TransferCancelled);
                }

                let bytes_read = local_file
                    .read(&mut buffer)
                    .await
                    .map_err(|_| RemoteFileError::InvalidLocalFile)?;
                if bytes_read == 0 {
                    break;
                }

                tokio::select! {
                    write_result = remote_file.write_all(&buffer[..bytes_read]) => {
                        write_result.map_err(|_| RemoteFileError::UploadFailed)?;
                    }
                    changed = cancellation.changed() => {
                        if changed.is_ok() && *cancellation.borrow() {
                            return Err(RemoteFileError::TransferCancelled);
                        }
                        return Err(RemoteFileError::UploadFailed);
                    }
                }

                transferred_bytes = transferred_bytes.saturating_add(bytes_read as u64);
                send_upload_progress(
                    &progress,
                    transfer_id,
                    transferred_bytes,
                    total_bytes,
                    started_at,
                );
            }

            remote_file
                .close()
                .await
                .map_err(|_| RemoteFileError::UploadFailed)
        }
        .await;

        if let Err(error) = upload_result {
            let _cleanup_result = self.client.remove_file(temporary_path).await;
            return Err(error);
        }

        if *cancellation.borrow() {
            let _cleanup_result = self.client.remove_file(temporary_path).await;
            return Err(RemoteFileError::TransferCancelled);
        }

        match self.client.try_exists(remote_path.clone()).await {
            Ok(true) => {
                let _cleanup_result = self.client.remove_file(temporary_path).await;
                return Err(RemoteFileError::RemoteFileExists);
            }
            Ok(false) => {}
            Err(_) => {
                let _cleanup_result = self.client.remove_file(temporary_path).await;
                return Err(RemoteFileError::UploadFailed);
            }
        }

        if self
            .client
            .rename(temporary_path.clone(), remote_path.clone())
            .await
            .is_err()
        {
            let _cleanup_result = self.client.remove_file(temporary_path).await;
            return Err(RemoteFileError::UploadFailed);
        }

        Ok(RemoteUploadResult {
            remote_path,
            total_bytes,
        })
    }
}

fn validate_remote_path(path: &str) -> Result<(), RemoteFileError> {
    if path.is_empty() || path.len() > MAX_REMOTE_PATH_BYTES || path.contains('\0') {
        return Err(RemoteFileError::InvalidPath);
    }

    Ok(())
}

fn validate_mutable_remote_path(path: &str) -> Result<(), RemoteFileError> {
    validate_remote_path(path)?;
    if matches!(path.trim_end_matches('/'), "" | "." | "..") {
        return Err(RemoteFileError::InvalidPath);
    }
    Ok(())
}

fn validate_remote_file_name(file_name: &str) -> Result<(), RemoteFileError> {
    if file_name.is_empty()
        || file_name == "."
        || file_name == ".."
        || file_name.len() > MAX_REMOTE_FILE_NAME_BYTES
        || file_name.contains(['/', '\0'])
    {
        return Err(RemoteFileError::InvalidName);
    }

    Ok(())
}

fn join_remote_path(directory: &str, file_name: &str) -> String {
    if directory == "/" {
        format!("/{file_name}")
    } else {
        format!("{}/{file_name}", directory.trim_end_matches('/'))
    }
}

fn remote_parent_directory(path: &str) -> Result<String, RemoteFileError> {
    let path = path.trim_end_matches('/');
    let Some(separator_index) = path.rfind('/') else {
        return Ok(".".to_owned());
    };

    if separator_index == 0 {
        Ok("/".to_owned())
    } else {
        Ok(path[..separator_index].to_owned())
    }
}

fn send_upload_progress(
    progress: &mpsc::Sender<RemoteUploadProgress>,
    transfer_id: &str,
    transferred_bytes: u64,
    total_bytes: u64,
    started_at: Instant,
) {
    let elapsed_seconds = started_at.elapsed().as_secs_f64();
    let bytes_per_second = if elapsed_seconds > 0.0 {
        (transferred_bytes as f64 / elapsed_seconds) as u64
    } else {
        0
    };
    let _progress_result = progress.try_send(RemoteUploadProgress {
        transfer_id: transfer_id.to_owned(),
        transferred_bytes,
        total_bytes,
        bytes_per_second,
    });
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RemoteFileError {
    InvalidPath,
    InvalidName,
    InvalidLocalFile,
    Unavailable,
    DirectoryUnavailable,
    EntryExists,
    RemoteFileExists,
    CreateFailed,
    RenameFailed,
    DeleteFailed,
    TransferCancelled,
    UploadFailed,
}

impl std::fmt::Display for RemoteFileError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidPath => formatter.write_str("invalid remote path"),
            Self::InvalidName => formatter.write_str("invalid remote file name"),
            Self::InvalidLocalFile => formatter.write_str("local file is unavailable"),
            Self::Unavailable => formatter.write_str("remote file session is unavailable"),
            Self::DirectoryUnavailable => formatter.write_str("remote directory is unavailable"),
            Self::EntryExists => formatter.write_str("remote entry already exists"),
            Self::RemoteFileExists => formatter.write_str("remote file already exists"),
            Self::CreateFailed => formatter.write_str("remote entry creation failed"),
            Self::RenameFailed => formatter.write_str("remote entry rename failed"),
            Self::DeleteFailed => formatter.write_str("remote entry deletion failed"),
            Self::TransferCancelled => formatter.write_str("file transfer was cancelled"),
            Self::UploadFailed => formatter.write_str("remote file upload failed"),
        }
    }
}

impl std::error::Error for RemoteFileError {}
