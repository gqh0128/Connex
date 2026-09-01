use std::fs::File as StdFile;
use std::future::Future;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

use russh_sftp::client::SftpSession;
use russh_sftp::protocol::{FileAttributes, FileType, OpenFlags};
use same_file::Handle as FileIdentityHandle;
use tokio::fs::{self, File as LocalFile, OpenOptions};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::{RwLock, mpsc, watch};

use crate::domain::sftp::{
    LocalUploadFileMetadata, RemoteDirectory, RemoteDownloadResult, RemoteFileEntry,
    RemoteFileKind, RemoteFileTransferLifecycle, RemoteFileTransferProgress, RemoteUploadResult,
};

const MAX_REMOTE_PATH_BYTES: usize = 16 * 1024;
const MAX_REMOTE_FILE_NAME_BYTES: usize = 255;
const JAVASCRIPT_MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const TRANSFER_CHUNK_BYTES: usize = 64 * 1024;
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(200);
const TEMP_FILE_CLEANUP_TIMEOUT: Duration = Duration::from_secs(2);
const SPEED_EMA_ALPHA: f64 = 0.25;

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

#[derive(Clone, Debug)]
pub struct AuthorizedLocalUploadFile {
    path: PathBuf,
    metadata: LocalUploadFileMetadata,
    snapshot: LocalFileSnapshot,
}

impl AuthorizedLocalUploadFile {
    pub fn metadata(&self) -> &LocalUploadFileMetadata {
        &self.metadata
    }
}

#[derive(Clone, Debug)]
pub struct AuthorizedLocalDownloadTarget {
    path: PathBuf,
    parent_path: PathBuf,
    parent_identity: Arc<FileIdentityHandle>,
    initial_target: Option<LocalFileSnapshot>,
}

#[derive(Clone, Debug)]
pub struct AuthorizedRemoteDownloadFile {
    snapshot: RemoteDownloadFileSnapshot,
}

impl AuthorizedRemoteDownloadFile {
    pub fn total_bytes(&self) -> u64 {
        self.snapshot.total_bytes
    }
}

pub struct RemoteFileTransferRuntime {
    pub transfer_id: String,
    pub attempt_id: String,
    pub cancellation: watch::Receiver<bool>,
    pub lifecycle: Arc<RemoteFileTransferLifecycle>,
    pub progress: mpsc::Sender<RemoteFileTransferProgress>,
}

impl AuthorizedLocalDownloadTarget {
    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[derive(Clone, Debug)]
struct LocalFileSnapshot {
    identity: Arc<FileIdentityHandle>,
    length: u64,
    modified_at: Option<SystemTime>,
    permissions: std::fs::Permissions,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct RemoteDownloadFileSnapshot {
    canonical_path: String,
    total_bytes: u64,
    modified_at: u32,
    user_id: Option<u32>,
    group_id: Option<u32>,
    permissions: u32,
}

pub async fn authorize_local_upload_file(
    selected_path: PathBuf,
) -> Result<AuthorizedLocalUploadFile, RemoteFileError> {
    let selected_metadata = fs::symlink_metadata(&selected_path)
        .await
        .map_err(|_| RemoteFileError::InvalidLocalFile)?;
    if !selected_metadata.file_type().is_file() {
        return Err(RemoteFileError::InvalidLocalFile);
    }
    let path = fs::canonicalize(selected_path)
        .await
        .map_err(|_| RemoteFileError::InvalidLocalFile)?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(RemoteFileError::InvalidLocalFile)?
        .to_owned();
    validate_remote_file_name(&file_name).map_err(|_| RemoteFileError::InvalidLocalFile)?;
    let snapshot =
        capture_regular_file_snapshot(path.clone(), RemoteFileError::InvalidLocalFile).await?;
    ensure_javascript_safe_file_size(snapshot.length)?;

    Ok(AuthorizedLocalUploadFile {
        path,
        metadata: LocalUploadFileMetadata {
            file_name,
            total_bytes: snapshot.length,
        },
        snapshot,
    })
}

pub async fn authorize_local_download_target(
    selected_path: PathBuf,
) -> Result<AuthorizedLocalDownloadTarget, RemoteFileError> {
    let file_name = selected_path
        .file_name()
        .filter(|name| !name.is_empty())
        .ok_or(RemoteFileError::InvalidLocalDownloadTarget)?
        .to_owned();
    let selected_parent = selected_path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or(RemoteFileError::InvalidLocalDownloadTarget)?;
    let parent_path = fs::canonicalize(selected_parent)
        .await
        .map_err(|_| RemoteFileError::InvalidLocalDownloadTarget)?;
    let parent_identity = capture_directory_identity(
        parent_path.clone(),
        RemoteFileError::InvalidLocalDownloadTarget,
    )
    .await?;
    let path = parent_path.join(file_name);
    let initial_target = match fs::symlink_metadata(&path).await {
        Ok(metadata) if metadata.file_type().is_file() => Some(
            capture_regular_file_snapshot(
                path.clone(),
                RemoteFileError::InvalidLocalDownloadTarget,
            )
            .await?,
        ),
        Ok(_) => return Err(RemoteFileError::InvalidLocalDownloadTarget),
        Err(error) if error.kind() == ErrorKind::NotFound => None,
        Err(_) => return Err(RemoteFileError::InvalidLocalDownloadTarget),
    };

    Ok(AuthorizedLocalDownloadTarget {
        path,
        parent_path,
        parent_identity,
        initial_target,
    })
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

    pub async fn canonicalize_directory_path(&self, path: &str) -> Result<String, RemoteFileError> {
        validate_remote_path(path)?;
        self.client
            .canonicalize(path)
            .await
            .map_err(|_| RemoteFileError::DirectoryUnavailable)
    }

    pub async fn authorize_download_file(
        &self,
        path: &str,
    ) -> Result<AuthorizedRemoteDownloadFile, RemoteFileError> {
        validate_remote_path(path)?;
        let canonical_path = self
            .client
            .canonicalize(path)
            .await
            .map_err(|_| RemoteFileError::RemoteDownloadUnavailable)?;
        validate_remote_path(&canonical_path)
            .map_err(|_| RemoteFileError::RemoteDownloadUnavailable)?;
        let metadata = self
            .client
            .symlink_metadata(canonical_path.clone())
            .await
            .map_err(|_| RemoteFileError::RemoteDownloadUnavailable)?;
        let snapshot = RemoteDownloadFileSnapshot::from_metadata(canonical_path, &metadata)?;
        Ok(AuthorizedRemoteDownloadFile { snapshot })
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
                if let Some(size) = metadata.size {
                    ensure_javascript_safe_file_size(size)?;
                }
                let kind = match entry.file_type() {
                    FileType::Dir => RemoteFileKind::Directory,
                    FileType::File => RemoteFileKind::File,
                    FileType::Symlink => RemoteFileKind::Symlink,
                    FileType::Other => RemoteFileKind::Other,
                };

                Ok(RemoteFileEntry {
                    name: entry.file_name(),
                    path: entry.path(),
                    kind,
                    size: metadata.size,
                    modified_at: metadata.mtime.map(u64::from),
                })
            })
            .collect::<Result<Vec<_>, RemoteFileError>>()?;

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
        local_file: &AuthorizedLocalUploadFile,
        remote_directory: &str,
        runtime: RemoteFileTransferRuntime,
    ) -> Result<RemoteUploadResult, RemoteFileError> {
        let RemoteFileTransferRuntime {
            transfer_id,
            attempt_id,
            mut cancellation,
            lifecycle,
            progress,
        } = runtime;
        validate_remote_path(remote_directory)?;
        let (mut local_file_handle, local_metadata) =
            open_authorized_local_upload_file(local_file).await?;
        let total_bytes = local_metadata.total_bytes;
        let remote_directory = run_transfer_step(
            &mut cancellation,
            self.client.canonicalize(remote_directory),
            RemoteFileError::DirectoryUnavailable,
        )
        .await?;
        let remote_path = join_remote_path(&remote_directory, &local_metadata.file_name);
        if run_transfer_step(
            &mut cancellation,
            self.client.try_exists(remote_path.clone()),
            RemoteFileError::UploadFailed,
        )
        .await?
        {
            return Err(RemoteFileError::RemoteFileExists);
        }

        let temporary_name = format!(".connex-upload-{attempt_id}.part");
        let temporary_path = join_remote_path(&remote_directory, &temporary_name);
        let remote_file = run_transfer_step(
            &mut cancellation,
            self.client.open_with_flags(
                temporary_path.clone(),
                OpenFlags::CREATE | OpenFlags::EXCLUDE | OpenFlags::WRITE,
            ),
            RemoteFileError::UploadFailed,
        )
        .await?;
        let mut transferred_bytes = 0_u64;
        let mut buffer = vec![0_u8; TRANSFER_CHUNK_BYTES];
        let mut reporter = TransferProgressReporter::new(progress, &transfer_id, total_bytes);
        reporter.send_initial();

        let upload_result = {
            let mut remote_file = remote_file;
            async {
                while transferred_bytes < total_bytes {
                    let remaining_bytes = total_bytes - transferred_bytes;
                    let read_length = usize::try_from(remaining_bytes)
                        .unwrap_or(usize::MAX)
                        .min(buffer.len());
                    let bytes_read = run_transfer_step(
                        &mut cancellation,
                        local_file_handle.read(&mut buffer[..read_length]),
                        RemoteFileError::InvalidLocalFile,
                    )
                    .await?;
                    if bytes_read == 0 {
                        return Err(RemoteFileError::LocalUploadFileChanged);
                    }

                    run_transfer_step(
                        &mut cancellation,
                        remote_file.write_all(&buffer[..bytes_read]),
                        RemoteFileError::UploadFailed,
                    )
                    .await?;

                    transferred_bytes = transferred_bytes.saturating_add(bytes_read as u64);
                    reporter.record(transferred_bytes);
                }

                if transferred_bytes != total_bytes {
                    return Err(RemoteFileError::LocalUploadFileChanged);
                }

                let mut eof_probe = [0_u8; 1];
                let extra_bytes = run_transfer_step(
                    &mut cancellation,
                    local_file_handle.read(&mut eof_probe),
                    RemoteFileError::InvalidLocalFile,
                )
                .await?;
                if extra_bytes != 0 {
                    return Err(RemoteFileError::LocalUploadFileChanged);
                }

                let final_local_metadata = run_transfer_step(
                    &mut cancellation,
                    local_file_handle.metadata(),
                    RemoteFileError::InvalidLocalFile,
                )
                .await?;
                if !local_file.snapshot.matches_metadata(&final_local_metadata) {
                    return Err(RemoteFileError::LocalUploadFileChanged);
                }
                validate_local_upload_authorization(local_file).await?;

                run_transfer_step(
                    &mut cancellation,
                    remote_file.close(),
                    RemoteFileError::UploadFailed,
                )
                .await?;

                if run_transfer_step(
                    &mut cancellation,
                    self.client.try_exists(remote_path.clone()),
                    RemoteFileError::UploadFailed,
                )
                .await?
                {
                    return Err(RemoteFileError::RemoteFileExists);
                }

                ensure_transfer_not_cancelled(&cancellation)?;
                if !lifecycle.begin_commit() {
                    return Err(RemoteFileError::TransferCancelled);
                }
                // See the download path below: the atomic commit itself is the point of no return.
                self.client
                    .rename(temporary_path.clone(), remote_path.clone())
                    .await
                    .map_err(|_| RemoteFileError::UploadFailed)
            }
            .await
        };

        if let Err(error) = upload_result {
            best_effort_temp_cleanup(self.client.remove_file(temporary_path)).await;
            reporter.send_final(transferred_bytes);
            return Err(error);
        }
        reporter.send_final(transferred_bytes);

        Ok(RemoteUploadResult {
            remote_path,
            total_bytes,
        })
    }

    pub async fn download_file(
        &self,
        remote_source: &AuthorizedRemoteDownloadFile,
        local_target: &AuthorizedLocalDownloadTarget,
        runtime: RemoteFileTransferRuntime,
    ) -> Result<RemoteDownloadResult, RemoteFileError> {
        let RemoteFileTransferRuntime {
            transfer_id,
            attempt_id,
            mut cancellation,
            lifecycle,
            progress,
        } = runtime;
        validate_remote_path(&remote_source.snapshot.canonical_path)?;
        validate_local_download_target(local_target).await?;
        let temporary_path = prepare_local_download_path(&attempt_id, local_target)?;
        self.validate_remote_download_file(remote_source, &mut cancellation)
            .await?;
        let remote_file = run_transfer_step(
            &mut cancellation,
            self.client
                .open(remote_source.snapshot.canonical_path.clone()),
            RemoteFileError::RemoteDownloadFailed,
        )
        .await?;
        let remote_metadata = run_transfer_step(
            &mut cancellation,
            remote_file.metadata(),
            RemoteFileError::RemoteDownloadFailed,
        )
        .await?;
        if !remote_source.snapshot.matches_metadata(&remote_metadata) {
            return Err(RemoteFileError::RemoteDownloadFileChanged);
        }
        let total_bytes = remote_source.snapshot.total_bytes;
        let mut local_options = OpenOptions::new();
        local_options.write(true).create_new(true);
        #[cfg(unix)]
        local_options.mode(0o600);
        let local_file = local_options
            .open(&temporary_path)
            .await
            .map_err(|_| RemoteFileError::InvalidLocalDownloadTarget)?;
        let mut transferred_bytes = 0_u64;
        let mut buffer = vec![0_u8; TRANSFER_CHUNK_BYTES];
        let mut reporter = TransferProgressReporter::new(progress, &transfer_id, total_bytes);
        reporter.send_initial();

        let download_result = {
            let mut remote_file = remote_file;
            let mut local_file = local_file;
            async {
                while transferred_bytes < total_bytes {
                    let remaining_bytes = total_bytes - transferred_bytes;
                    let read_length = usize::try_from(remaining_bytes)
                        .unwrap_or(usize::MAX)
                        .min(buffer.len());
                    let bytes_read = run_transfer_step(
                        &mut cancellation,
                        remote_file.read(&mut buffer[..read_length]),
                        RemoteFileError::RemoteDownloadFailed,
                    )
                    .await?;
                    if bytes_read == 0 {
                        return Err(RemoteFileError::RemoteDownloadFileChanged);
                    }

                    run_transfer_step(
                        &mut cancellation,
                        local_file.write_all(&buffer[..bytes_read]),
                        RemoteFileError::LocalDownloadWriteFailed,
                    )
                    .await?;
                    transferred_bytes = transferred_bytes.saturating_add(bytes_read as u64);
                    reporter.record(transferred_bytes);
                }

                if transferred_bytes != total_bytes {
                    return Err(RemoteFileError::RemoteDownloadFileChanged);
                }

                let mut eof_probe = [0_u8; 1];
                let extra_bytes = run_transfer_step(
                    &mut cancellation,
                    remote_file.read(&mut eof_probe),
                    RemoteFileError::RemoteDownloadFailed,
                )
                .await?;
                if extra_bytes != 0 {
                    return Err(RemoteFileError::RemoteDownloadFileChanged);
                }

                let final_remote_metadata = run_transfer_step(
                    &mut cancellation,
                    remote_file.metadata(),
                    RemoteFileError::RemoteDownloadFailed,
                )
                .await?;
                if !remote_source
                    .snapshot
                    .matches_metadata(&final_remote_metadata)
                {
                    return Err(RemoteFileError::RemoteDownloadFileChanged);
                }

                run_transfer_step(
                    &mut cancellation,
                    remote_file.close(),
                    RemoteFileError::RemoteDownloadFailed,
                )
                .await?;
                self.validate_remote_download_file(remote_source, &mut cancellation)
                    .await?;
                run_transfer_step(
                    &mut cancellation,
                    local_file.flush(),
                    RemoteFileError::LocalDownloadWriteFailed,
                )
                .await?;
                run_transfer_step(
                    &mut cancellation,
                    local_file.sync_all(),
                    RemoteFileError::LocalDownloadWriteFailed,
                )
                .await
            }
            .await
        };

        let download_result = match download_result {
            Ok(()) => {
                async {
                    ensure_transfer_not_cancelled(&cancellation)?;
                    if !lifecycle.begin_commit() {
                        return Err(RemoteFileError::TransferCancelled);
                    }
                    validate_local_download_target(local_target).await?;
                    commit_local_download(&temporary_path, local_target).await
                }
                .await
            }
            Err(error) => Err(error),
        };

        if let Err(error) = download_result {
            best_effort_temp_cleanup(fs::remove_file(&temporary_path)).await;
            reporter.send_final(transferred_bytes);
            return Err(error);
        }
        reporter.send_final(transferred_bytes);

        Ok(RemoteDownloadResult {
            local_path: local_target.path.clone(),
            total_bytes,
        })
    }

    async fn validate_remote_download_file(
        &self,
        authorization: &AuthorizedRemoteDownloadFile,
        cancellation: &mut watch::Receiver<bool>,
    ) -> Result<(), RemoteFileError> {
        let canonical_path = run_transfer_step(
            cancellation,
            self.client
                .canonicalize(authorization.snapshot.canonical_path.clone()),
            RemoteFileError::RemoteDownloadFailed,
        )
        .await?;
        let metadata = run_transfer_step(
            cancellation,
            self.client.symlink_metadata(canonical_path.clone()),
            RemoteFileError::RemoteDownloadFailed,
        )
        .await?;
        if authorization.snapshot.matches(&canonical_path, &metadata) {
            Ok(())
        } else {
            Err(RemoteFileError::RemoteDownloadFileChanged)
        }
    }
}

async fn open_authorized_local_upload_file(
    authorization: &AuthorizedLocalUploadFile,
) -> Result<(LocalFile, LocalUploadFileMetadata), RemoteFileError> {
    let path = authorization.path.clone();
    let expected_snapshot = authorization.snapshot.clone();
    let std_file = tokio::task::spawn_blocking(move || {
        let path_metadata = std::fs::symlink_metadata(&path)
            .map_err(|_| RemoteFileError::LocalFileCapabilityChanged)?;
        if !path_metadata.file_type().is_file() {
            return Err(RemoteFileError::LocalFileCapabilityChanged);
        }
        let file = StdFile::open(&path).map_err(|_| RemoteFileError::InvalidLocalFile)?;
        let metadata = file
            .metadata()
            .map_err(|_| RemoteFileError::InvalidLocalFile)?;
        let identity = FileIdentityHandle::from_file(
            file.try_clone()
                .map_err(|_| RemoteFileError::InvalidLocalFile)?,
        )
        .map_err(|_| RemoteFileError::InvalidLocalFile)?;
        if !expected_snapshot.matches(&identity, &metadata) {
            return Err(RemoteFileError::LocalFileCapabilityChanged);
        }
        Ok(file)
    })
    .await
    .map_err(|_| RemoteFileError::InvalidLocalFile)??;

    Ok((
        LocalFile::from_std(std_file),
        authorization.metadata.clone(),
    ))
}

async fn validate_local_upload_authorization(
    authorization: &AuthorizedLocalUploadFile,
) -> Result<(), RemoteFileError> {
    let path = authorization.path.clone();
    let expected_snapshot = authorization.snapshot.clone();
    tokio::task::spawn_blocking(move || {
        let path_metadata = std::fs::symlink_metadata(&path)
            .map_err(|_| RemoteFileError::LocalFileCapabilityChanged)?;
        if !path_metadata.file_type().is_file() {
            return Err(RemoteFileError::LocalFileCapabilityChanged);
        }
        let identity = FileIdentityHandle::from_path(path)
            .map_err(|_| RemoteFileError::LocalFileCapabilityChanged)?;
        let metadata = identity
            .as_file()
            .metadata()
            .map_err(|_| RemoteFileError::LocalFileCapabilityChanged)?;
        if expected_snapshot.matches(&identity, &metadata) {
            Ok(())
        } else {
            Err(RemoteFileError::LocalFileCapabilityChanged)
        }
    })
    .await
    .map_err(|_| RemoteFileError::InvalidLocalFile)?
}

fn prepare_local_download_path(
    attempt_id: &str,
    authorization: &AuthorizedLocalDownloadTarget,
) -> Result<PathBuf, RemoteFileError> {
    let temporary_path = authorization
        .parent_path
        .join(format!(".connex-download-{attempt_id}.part"));
    if temporary_path == authorization.path {
        return Err(RemoteFileError::InvalidLocalDownloadTarget);
    }
    Ok(temporary_path)
}

async fn validate_local_download_target(
    authorization: &AuthorizedLocalDownloadTarget,
) -> Result<(), RemoteFileError> {
    let authorization = authorization.clone();
    tokio::task::spawn_blocking(move || {
        let parent = FileIdentityHandle::from_path(&authorization.parent_path)
            .map_err(|_| RemoteFileError::LocalFileCapabilityChanged)?;
        let parent_metadata = parent
            .as_file()
            .metadata()
            .map_err(|_| RemoteFileError::LocalFileCapabilityChanged)?;
        if !parent_metadata.is_dir() || parent != *authorization.parent_identity {
            return Err(RemoteFileError::LocalFileCapabilityChanged);
        }

        match &authorization.initial_target {
            Some(expected) => {
                let path_metadata = std::fs::symlink_metadata(&authorization.path)
                    .map_err(|_| RemoteFileError::LocalFileCapabilityChanged)?;
                if !path_metadata.file_type().is_file() {
                    return Err(RemoteFileError::LocalFileCapabilityChanged);
                }
                let current = FileIdentityHandle::from_path(&authorization.path)
                    .map_err(|_| RemoteFileError::LocalFileCapabilityChanged)?;
                let current_metadata = current
                    .as_file()
                    .metadata()
                    .map_err(|_| RemoteFileError::LocalFileCapabilityChanged)?;
                if !expected.matches(&current, &current_metadata) {
                    return Err(RemoteFileError::LocalFileCapabilityChanged);
                }
            }
            None => match std::fs::symlink_metadata(&authorization.path) {
                Err(error) if error.kind() == ErrorKind::NotFound => {}
                _ => return Err(RemoteFileError::LocalFileCapabilityChanged),
            },
        }

        Ok(())
    })
    .await
    .map_err(|_| RemoteFileError::InvalidLocalDownloadTarget)?
}

async fn commit_local_download(
    temporary_path: &Path,
    authorization: &AuthorizedLocalDownloadTarget,
) -> Result<(), RemoteFileError> {
    if let Some(initial_target) = &authorization.initial_target {
        let permissions = initial_target.permissions.clone();
        fs::set_permissions(temporary_path, permissions)
            .await
            .map_err(|_| RemoteFileError::LocalDownloadCommitFailed)?;
        validate_local_download_target(authorization).await?;
        fs::rename(temporary_path, &authorization.path)
            .await
            .map_err(|_| RemoteFileError::LocalDownloadCommitFailed)
    } else {
        fs::hard_link(temporary_path, &authorization.path)
            .await
            .map_err(|_| RemoteFileError::LocalDownloadCommitFailed)?;
        best_effort_temp_cleanup(fs::remove_file(temporary_path)).await;
        Ok(())
    }
}

async fn best_effort_temp_cleanup<T, E>(cleanup: impl Future<Output = Result<T, E>>) {
    let _cleanup_result = tokio::time::timeout(TEMP_FILE_CLEANUP_TIMEOUT, cleanup).await;
}

async fn capture_directory_identity(
    path: PathBuf,
    failure: RemoteFileError,
) -> Result<Arc<FileIdentityHandle>, RemoteFileError> {
    tokio::task::spawn_blocking(move || {
        let path_metadata = std::fs::symlink_metadata(&path).map_err(|_| failure)?;
        if !path_metadata.file_type().is_dir() {
            return Err(failure);
        }
        let identity = FileIdentityHandle::from_path(path).map_err(|_| failure)?;
        Ok(Arc::new(identity))
    })
    .await
    .map_err(|_| failure)?
}

async fn capture_regular_file_snapshot(
    path: PathBuf,
    failure: RemoteFileError,
) -> Result<LocalFileSnapshot, RemoteFileError> {
    tokio::task::spawn_blocking(move || {
        let path_metadata = std::fs::symlink_metadata(&path).map_err(|_| failure)?;
        if !path_metadata.file_type().is_file() {
            return Err(failure);
        }
        let identity = FileIdentityHandle::from_path(path).map_err(|_| failure)?;
        let metadata = identity.as_file().metadata().map_err(|_| failure)?;
        if !metadata.is_file() {
            return Err(failure);
        }
        Ok(LocalFileSnapshot::new(identity, &metadata))
    })
    .await
    .map_err(|_| failure)?
}

impl LocalFileSnapshot {
    fn new(identity: FileIdentityHandle, metadata: &std::fs::Metadata) -> Self {
        Self {
            identity: Arc::new(identity),
            length: metadata.len(),
            modified_at: metadata.modified().ok(),
            permissions: metadata.permissions(),
        }
    }

    fn matches(&self, identity: &FileIdentityHandle, metadata: &std::fs::Metadata) -> bool {
        metadata.is_file() && *self.identity == *identity && self.matches_metadata(metadata)
    }

    fn matches_metadata(&self, metadata: &std::fs::Metadata) -> bool {
        metadata.is_file()
            && self.length == metadata.len()
            && self.modified_at == metadata.modified().ok()
    }
}

impl RemoteDownloadFileSnapshot {
    fn from_metadata(
        canonical_path: String,
        metadata: &FileAttributes,
    ) -> Result<Self, RemoteFileError> {
        if !metadata.is_regular() {
            return Err(RemoteFileError::RemoteDownloadUnavailable);
        }
        let total_bytes = metadata
            .size
            .ok_or(RemoteFileError::RemoteDownloadUnavailable)?;
        ensure_javascript_safe_file_size(total_bytes)?;
        let modified_at = metadata
            .mtime
            .ok_or(RemoteFileError::RemoteDownloadUnavailable)?;
        let permissions = metadata
            .permissions
            .ok_or(RemoteFileError::RemoteDownloadUnavailable)?;
        Ok(Self {
            canonical_path,
            total_bytes,
            modified_at,
            user_id: metadata.uid,
            group_id: metadata.gid,
            permissions,
        })
    }

    fn matches(&self, canonical_path: &str, metadata: &FileAttributes) -> bool {
        self.canonical_path == canonical_path && self.matches_metadata(metadata)
    }

    fn matches_metadata(&self, metadata: &FileAttributes) -> bool {
        metadata.is_regular()
            && metadata.size == Some(self.total_bytes)
            && metadata.mtime == Some(self.modified_at)
            && metadata.uid == self.user_id
            && metadata.gid == self.group_id
            && metadata.permissions == Some(self.permissions)
    }
}

fn ensure_javascript_safe_file_size(size: u64) -> Result<(), RemoteFileError> {
    if size > JAVASCRIPT_MAX_SAFE_INTEGER {
        Err(RemoteFileError::FileSizeExceedsSafeInteger)
    } else {
        Ok(())
    }
}

fn ensure_transfer_not_cancelled(
    cancellation: &watch::Receiver<bool>,
) -> Result<(), RemoteFileError> {
    if *cancellation.borrow() {
        Err(RemoteFileError::TransferCancelled)
    } else {
        Ok(())
    }
}

async fn run_transfer_step<T, E, F>(
    cancellation: &mut watch::Receiver<bool>,
    operation: F,
    failure: RemoteFileError,
) -> Result<T, RemoteFileError>
where
    F: Future<Output = Result<T, E>>,
{
    ensure_transfer_not_cancelled(cancellation)?;
    tokio::select! {
        biased;
        changed = cancellation.changed() => {
            if changed.is_ok() && *cancellation.borrow() {
                Err(RemoteFileError::TransferCancelled)
            } else {
                Err(failure)
            }
        }
        result = operation => result.map_err(|_| failure),
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

struct TransferProgressReporter {
    progress: mpsc::Sender<RemoteFileTransferProgress>,
    transfer_id: String,
    total_bytes: u64,
    observed_bytes: u64,
    observed_at: Instant,
    emitted_at: Instant,
    bytes_per_second: f64,
    has_speed_sample: bool,
}

impl TransferProgressReporter {
    fn new(
        progress: mpsc::Sender<RemoteFileTransferProgress>,
        transfer_id: &str,
        total_bytes: u64,
    ) -> Self {
        let now = Instant::now();
        Self {
            progress,
            transfer_id: transfer_id.to_owned(),
            total_bytes,
            observed_bytes: 0,
            observed_at: now,
            emitted_at: now,
            bytes_per_second: 0.0,
            has_speed_sample: false,
        }
    }

    fn send_initial(&self) {
        let _send_result = self.progress.try_send(self.snapshot(0));
    }

    fn record(&mut self, transferred_bytes: u64) {
        let now = Instant::now();
        let sample_elapsed = now.saturating_duration_since(self.observed_at);
        if sample_elapsed >= PROGRESS_EMIT_INTERVAL || transferred_bytes == self.total_bytes {
            let sample_bytes = transferred_bytes.saturating_sub(self.observed_bytes);
            let elapsed_seconds = sample_elapsed.as_secs_f64();
            if sample_bytes > 0 && elapsed_seconds > 0.0 {
                let instant_speed = sample_bytes as f64 / elapsed_seconds;
                self.bytes_per_second = if self.has_speed_sample {
                    SPEED_EMA_ALPHA * instant_speed
                        + (1.0 - SPEED_EMA_ALPHA) * self.bytes_per_second
                } else {
                    instant_speed
                };
                self.has_speed_sample = true;
            }
            self.observed_bytes = transferred_bytes;
            self.observed_at = now;
        }

        if now.saturating_duration_since(self.emitted_at) >= PROGRESS_EMIT_INTERVAL {
            let _send_result = self.progress.try_send(self.snapshot(transferred_bytes));
            self.emitted_at = now;
        }
    }

    fn send_final(&mut self, transferred_bytes: u64) {
        self.record(transferred_bytes);
        let _send_result = self.progress.try_send(self.snapshot(transferred_bytes));
    }

    fn snapshot(&self, transferred_bytes: u64) -> RemoteFileTransferProgress {
        RemoteFileTransferProgress {
            transfer_id: self.transfer_id.clone(),
            transferred_bytes,
            total_bytes: self.total_bytes,
            bytes_per_second: self
                .bytes_per_second
                .max(0.0)
                .min(JAVASCRIPT_MAX_SAFE_INTEGER as f64) as u64,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RemoteFileError {
    InvalidPath,
    InvalidName,
    InvalidLocalFile,
    InvalidLocalDownloadTarget,
    LocalFileCapabilityChanged,
    LocalUploadFileChanged,
    Unavailable,
    DirectoryUnavailable,
    EntryExists,
    RemoteFileExists,
    CreateFailed,
    RenameFailed,
    DeleteFailed,
    TransferCancelled,
    UploadFailed,
    RemoteDownloadUnavailable,
    RemoteDownloadFileChanged,
    RemoteDownloadFailed,
    LocalDownloadWriteFailed,
    LocalDownloadCommitFailed,
    FileSizeExceedsSafeInteger,
}

impl std::fmt::Display for RemoteFileError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidPath => formatter.write_str("invalid remote path"),
            Self::InvalidName => formatter.write_str("invalid remote file name"),
            Self::InvalidLocalFile => formatter.write_str("local file is unavailable"),
            Self::InvalidLocalDownloadTarget => {
                formatter.write_str("local download target is unavailable")
            }
            Self::LocalFileCapabilityChanged => {
                formatter.write_str("authorized local file changed")
            }
            Self::LocalUploadFileChanged => {
                formatter.write_str("local upload file changed during transfer")
            }
            Self::Unavailable => formatter.write_str("remote file session is unavailable"),
            Self::DirectoryUnavailable => formatter.write_str("remote directory is unavailable"),
            Self::EntryExists => formatter.write_str("remote entry already exists"),
            Self::RemoteFileExists => formatter.write_str("remote file already exists"),
            Self::CreateFailed => formatter.write_str("remote entry creation failed"),
            Self::RenameFailed => formatter.write_str("remote entry rename failed"),
            Self::DeleteFailed => formatter.write_str("remote entry deletion failed"),
            Self::TransferCancelled => formatter.write_str("file transfer was cancelled"),
            Self::UploadFailed => formatter.write_str("remote file upload failed"),
            Self::RemoteDownloadUnavailable => {
                formatter.write_str("remote download source is unavailable")
            }
            Self::RemoteDownloadFileChanged => {
                formatter.write_str("remote file changed during download")
            }
            Self::RemoteDownloadFailed => formatter.write_str("remote file download failed"),
            Self::LocalDownloadWriteFailed => {
                formatter.write_str("downloaded data could not be written locally")
            }
            Self::LocalDownloadCommitFailed => {
                formatter.write_str("downloaded file could not be committed")
            }
            Self::FileSizeExceedsSafeInteger => {
                formatter.write_str("file size exceeds JavaScript's safe integer range")
            }
        }
    }
}

impl std::error::Error for RemoteFileError {}
