use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::{Mutex, RwLock, mpsc, oneshot, watch};
use uuid::Uuid;

use crate::domain::connections::ConnectionProfile;
use crate::domain::credentials::SecretString;
use crate::domain::sessions::{
    HostKeyDecision, SessionControl, SessionEvent, SessionSnapshot, SessionState,
    SessionValidationError, StartSessionRequest, TerminalSize,
};
use crate::domain::sftp::{
    FolderTransferFileSelection, FolderTransferSelection, LocalDownloadTargetSelection,
    LocalUploadFileSelection, MAX_FOLDER_TRANSFER_FILES, RemoteDirectory, RemoteDownloadResult,
    RemoteFileTransferControl, RemoteFileTransferControlStatus, RemoteFileTransferFinish,
    RemoteFileTransferLifecycle, RemoteFileTransferProgress, RemoteUploadResult,
};
use crate::infrastructure::sftp::{
    AuthorizedLocalDownloadTarget, AuthorizedLocalUploadFile, AuthorizedRemoteDownloadFile,
    RemoteFileError, RemoteFileSessionState, RemoteFileTransferRuntime, SharedRemoteFileSession,
    authorize_local_download_target, authorize_local_upload_file, authorize_local_upload_folder,
    cleanup_local_download_attempt, prepare_local_download_folder,
};
use crate::infrastructure::ssh::{
    SharedSessionSnapshot, SshConnector, SshSessionEnd, SshSessionRuntime, SshTransportError,
};

const CONTROL_QUEUE_CAPACITY: usize = 64;
const HOST_KEY_QUEUE_CAPACITY: usize = 1;
const REMOTE_FILE_REQUEST_QUEUE_CAPACITY: usize = 4;
const MAX_INPUT_BYTES: usize = 64 * 1024;
const MAX_ACTIVE_TRANSFERS: usize = 3;
const MAX_TRANSFER_ATTACH_BATCH: usize = MAX_FOLDER_TRANSFER_FILES;
const LOCAL_FILE_CAPABILITY_TTL: Duration = Duration::from_secs(30 * 60);
const TRANSFER_ATTEMPT_CLEANUP_TIMEOUT: Duration = Duration::from_secs(2);
const TRANSFER_CLEANUP_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone)]
pub struct SshSessionManager {
    connector: SshConnector,
    sessions: Arc<RwLock<HashMap<String, SessionEntry>>>,
    transfers: Arc<Mutex<HashMap<String, TransferControl>>>,
    local_files: Arc<Mutex<LocalFileCapabilityStore>>,
}

impl SshSessionManager {
    pub fn new(connector: SshConnector) -> Self {
        Self {
            connector,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            transfers: Arc::new(Mutex::new(HashMap::new())),
            local_files: Arc::new(Mutex::new(LocalFileCapabilityStore::default())),
        }
    }

    pub async fn start(
        &self,
        profile: ConnectionProfile,
        credential: Option<SecretString>,
        terminal_size: TerminalSize,
        events: mpsc::Sender<SessionEvent>,
    ) -> Result<SessionSnapshot, SessionManagerError> {
        let session_id = Uuid::new_v4().to_string();
        let request = StartSessionRequest::new(profile, credential, terminal_size)
            .map_err(SessionManagerError::from)?;
        let initial_snapshot = SessionSnapshot::connecting(session_id.clone(), &request.profile);
        let snapshot = Arc::new(RwLock::new(initial_snapshot.clone()));
        let remote_files = Arc::new(RwLock::new(RemoteFileSessionState::Idle));
        let (control_sender, control_receiver) = mpsc::channel(CONTROL_QUEUE_CAPACITY);
        let (host_key_sender, host_key_receiver) = mpsc::channel(HOST_KEY_QUEUE_CAPACITY);
        let (remote_file_request_sender, remote_file_request_receiver) =
            mpsc::channel(REMOTE_FILE_REQUEST_QUEUE_CAPACITY);
        let (cancellation_sender, cancellation_receiver) = watch::channel(false);
        let entry = SessionEntry {
            snapshot: snapshot.clone(),
            remote_files: remote_files.clone(),
            controls: control_sender,
            host_key_decisions: host_key_sender,
            remote_file_requests: remote_file_request_sender,
            cancellation: cancellation_sender,
            events: events.clone(),
        };
        self.sessions
            .write()
            .await
            .insert(session_id.clone(), entry);

        if events
            .send(SessionEvent::Snapshot(initial_snapshot.clone()))
            .await
            .is_err()
        {
            self.sessions.write().await.remove(&session_id);
            return Err(SessionManagerError::Unavailable);
        }

        let connector = self.connector.clone();
        let manager = self.clone();
        tauri::async_runtime::spawn(async move {
            let result = connector
                .run(
                    request,
                    SshSessionRuntime {
                        snapshot: snapshot.clone(),
                        remote_files,
                        controls: control_receiver,
                        host_key_decisions: host_key_receiver,
                        remote_file_requests: remote_file_request_receiver,
                        cancellation: cancellation_receiver,
                        events: events.clone(),
                    },
                )
                .await;

            let final_snapshot = finish_session(&snapshot, result).await;
            manager
                .cancel_and_wait_transfers_for_session(&session_id)
                .await;
            manager.revoke_capabilities_for_session(&session_id).await;
            let _ = events.send(SessionEvent::Snapshot(final_snapshot)).await;
            manager.sessions.write().await.remove(&session_id);
        });

        Ok(initial_snapshot)
    }

    pub async fn get(&self, session_id: &str) -> Result<SessionSnapshot, SessionManagerError> {
        let snapshot = self.entry(session_id).await?.snapshot.read().await.clone();
        Ok(snapshot)
    }

    pub async fn decide_host_key(
        &self,
        session_id: &str,
        decision: HostKeyDecision,
    ) -> Result<(), SessionManagerError> {
        let entry = self.entry(session_id).await?;
        if entry.snapshot.read().await.state != SessionState::VerifyingHost {
            return Err(SessionManagerError::InvalidState);
        }

        entry
            .host_key_decisions
            .try_send(decision)
            .map_err(|_| SessionManagerError::InvalidState)
    }

    pub async fn write(&self, session_id: &str, data: Vec<u8>) -> Result<(), SessionManagerError> {
        if data.is_empty() {
            return Ok(());
        }
        if data.len() > MAX_INPUT_BYTES {
            return Err(SessionManagerError::InvalidInput {
                field: "data",
                message: "单次终端输入不能超过 64 KiB。",
            });
        }

        self.send_connected(session_id, SessionControl::Write(data))
            .await
    }

    pub async fn resize(
        &self,
        session_id: &str,
        size: TerminalSize,
    ) -> Result<(), SessionManagerError> {
        self.send_connected(session_id, SessionControl::Resize(size))
            .await
    }

    pub async fn keepalive(&self, session_id: &str) -> Result<(), SessionManagerError> {
        self.send_connected(session_id, SessionControl::Keepalive)
            .await
    }

    pub async fn list_remote_directory(
        &self,
        session_id: &str,
        path: Option<&str>,
    ) -> Result<RemoteDirectory, SessionManagerError> {
        self.remote_file_session(session_id)
            .await?
            .list_directory(path)
            .await
            .map_err(SessionManagerError::from)
    }

    pub async fn create_remote_directory(
        &self,
        session_id: &str,
        parent_path: &str,
        name: &str,
    ) -> Result<String, SessionManagerError> {
        self.remote_file_session(session_id)
            .await?
            .create_directory(parent_path, name)
            .await
            .map_err(SessionManagerError::from)
    }

    pub async fn create_remote_file(
        &self,
        session_id: &str,
        parent_path: &str,
        name: &str,
    ) -> Result<String, SessionManagerError> {
        self.remote_file_session(session_id)
            .await?
            .create_file(parent_path, name)
            .await
            .map_err(SessionManagerError::from)
    }

    pub async fn rename_remote_entry(
        &self,
        session_id: &str,
        path: &str,
        new_name: &str,
    ) -> Result<String, SessionManagerError> {
        self.remote_file_session(session_id)
            .await?
            .rename_entry(path, new_name)
            .await
            .map_err(SessionManagerError::from)
    }

    pub async fn delete_remote_entry(
        &self,
        session_id: &str,
        path: &str,
    ) -> Result<(), SessionManagerError> {
        self.remote_file_session(session_id)
            .await?
            .delete_entry(path)
            .await
            .map_err(SessionManagerError::from)
    }

    pub async fn select_local_upload_files(
        &self,
        window: &WebviewWindow,
        session_id: &str,
        remote_directory: &str,
    ) -> Result<Vec<LocalUploadFileSelection>, SessionManagerError> {
        self.ensure_connected(session_id).await?;
        let remote_directory = self
            .remote_file_session(session_id)
            .await?
            .canonicalize_directory_path(remote_directory)
            .await
            .map_err(SessionManagerError::from)?;
        let selected_paths = choose_local_upload_files(window).await?;
        let mut authorized_files = Vec::with_capacity(selected_paths.len());
        for path in selected_paths {
            authorized_files.push(
                authorize_local_upload_file(path)
                    .await
                    .map_err(SessionManagerError::from)?,
            );
        }

        let mut local_files = self.local_files.lock().await;
        local_files.purge_expired();
        let mut pending_destinations = HashSet::new();
        for file in &authorized_files {
            let destination =
                UploadDestination::new(session_id, &remote_directory, &file.metadata().file_name);
            if !pending_destinations.insert(destination.clone())
                || local_files.contains_upload_destination(&destination)
            {
                return Err(SessionManagerError::TransferDestinationBusy);
            }
        }

        let expires_at = Instant::now() + LOCAL_FILE_CAPABILITY_TTL;
        let mut selections = Vec::with_capacity(authorized_files.len());
        for file in authorized_files {
            let transfer_id = Uuid::new_v4().to_string();
            selections.push(LocalUploadFileSelection {
                transfer_id: transfer_id.clone(),
                file_name: file.metadata().file_name.clone(),
                total_bytes: file.metadata().total_bytes,
            });
            local_files.capabilities.insert(
                transfer_id,
                LocalFileCapability {
                    session_id: session_id.to_owned(),
                    expires_at,
                    is_attached: false,
                    is_active: false,
                    is_revoked: false,
                    attempt_id: None,
                    kind: LocalFileCapabilityKind::Upload {
                        remote_directory: remote_directory.clone(),
                        file,
                    },
                },
            );
        }
        let transfer_ids = selections
            .iter()
            .map(|selection| selection.transfer_id.clone())
            .collect::<Vec<_>>();
        drop(local_files);
        if !transfer_ids.is_empty()
            && let Err(error) = self.ensure_connected(session_id).await
        {
            self.discard_local_file_capabilities(&transfer_ids).await;
            return Err(error);
        }
        Ok(selections)
    }

    pub async fn select_local_upload_folder(
        &self,
        window: &WebviewWindow,
        session_id: &str,
        remote_directory: &str,
    ) -> Result<Option<FolderTransferSelection>, SessionManagerError> {
        self.ensure_connected(session_id).await?;
        let remote_files = self.remote_file_session(session_id).await?;
        let remote_directory = remote_files
            .canonicalize_directory_path(remote_directory)
            .await
            .map_err(SessionManagerError::from)?;
        let Some(selected_path) = choose_local_upload_folder(window).await? else {
            return Ok(None);
        };
        let folder = authorize_local_upload_folder(selected_path)
            .await
            .map_err(SessionManagerError::from)?;
        let prepared = remote_files
            .prepare_upload_folder(&remote_directory, folder)
            .await
            .map_err(SessionManagerError::from)?;

        let mut local_files = self.local_files.lock().await;
        local_files.purge_expired();
        let mut pending_destinations = HashSet::with_capacity(prepared.files.len());
        for entry in &prepared.files {
            let destination = UploadDestination::new(
                session_id,
                &entry.remote_directory,
                &entry.file.metadata().file_name,
            );
            if !pending_destinations.insert(destination.clone())
                || local_files.contains_upload_destination(&destination)
            {
                return Err(SessionManagerError::TransferDestinationBusy);
            }
        }

        let expires_at = Instant::now() + LOCAL_FILE_CAPABILITY_TTL;
        let mut selections = Vec::with_capacity(prepared.files.len());
        for entry in prepared.files {
            let transfer_id = Uuid::new_v4().to_string();
            selections.push(FolderTransferFileSelection {
                transfer_id: transfer_id.clone(),
                relative_path: entry.relative_path,
                total_bytes: entry.file.metadata().total_bytes,
            });
            local_files.capabilities.insert(
                transfer_id,
                LocalFileCapability {
                    session_id: session_id.to_owned(),
                    expires_at,
                    is_attached: false,
                    is_active: false,
                    is_revoked: false,
                    attempt_id: None,
                    kind: LocalFileCapabilityKind::Upload {
                        remote_directory: entry.remote_directory,
                        file: entry.file,
                    },
                },
            );
        }
        let transfer_ids = selections
            .iter()
            .map(|selection| selection.transfer_id.clone())
            .collect::<Vec<_>>();
        drop(local_files);
        if !transfer_ids.is_empty()
            && let Err(error) = self.ensure_connected(session_id).await
        {
            self.discard_local_file_capabilities(&transfer_ids).await;
            return Err(error);
        }
        Ok(Some(FolderTransferSelection {
            folder_name: prepared.folder_name,
            files: selections,
        }))
    }

    pub async fn select_local_download_target(
        &self,
        window: &WebviewWindow,
        session_id: &str,
        remote_path: &str,
        default_file_name: &str,
    ) -> Result<Option<LocalDownloadTargetSelection>, SessionManagerError> {
        self.ensure_connected(session_id).await?;
        validate_dialog_file_name(default_file_name)?;
        let Some(selected_path) = choose_local_download_target(window, default_file_name).await?
        else {
            return Ok(None);
        };
        let target = authorize_local_download_target(selected_path)
            .await
            .map_err(SessionManagerError::from)?;
        let source = self
            .remote_file_session(session_id)
            .await?
            .authorize_download_file(remote_path)
            .await
            .map_err(SessionManagerError::from)?;
        let total_bytes = source.total_bytes();

        let mut local_files = self.local_files.lock().await;
        local_files.purge_expired();
        if local_files.contains_download_target(target.path()) {
            return Err(SessionManagerError::TransferDestinationBusy);
        }
        let transfer_id = Uuid::new_v4().to_string();
        local_files.capabilities.insert(
            transfer_id.clone(),
            LocalFileCapability {
                session_id: session_id.to_owned(),
                expires_at: Instant::now() + LOCAL_FILE_CAPABILITY_TTL,
                is_attached: false,
                is_active: false,
                is_revoked: false,
                attempt_id: None,
                kind: LocalFileCapabilityKind::Download { source, target },
            },
        );
        drop(local_files);
        if let Err(error) = self.ensure_connected(session_id).await {
            self.discard_local_file_capabilities(std::slice::from_ref(&transfer_id))
                .await;
            return Err(error);
        }
        Ok(Some(LocalDownloadTargetSelection {
            transfer_id,
            total_bytes,
        }))
    }

    pub async fn select_local_download_folder(
        &self,
        window: &WebviewWindow,
        session_id: &str,
        remote_path: &str,
    ) -> Result<Option<FolderTransferSelection>, SessionManagerError> {
        self.ensure_connected(session_id).await?;
        let Some(selected_parent) = choose_local_download_folder(window).await? else {
            return Ok(None);
        };
        let remote_files = self.remote_file_session(session_id).await?;
        let folder = remote_files
            .authorize_download_folder(remote_path)
            .await
            .map_err(SessionManagerError::from)?;
        let prepared = prepare_local_download_folder(selected_parent, folder)
            .await
            .map_err(SessionManagerError::from)?;

        let mut local_files = self.local_files.lock().await;
        local_files.purge_expired();
        let mut pending_targets = HashSet::with_capacity(prepared.files.len());
        for entry in &prepared.files {
            if !pending_targets.insert(entry.target.path().to_path_buf())
                || local_files.contains_download_target(entry.target.path())
            {
                return Err(SessionManagerError::TransferDestinationBusy);
            }
        }

        let expires_at = Instant::now() + LOCAL_FILE_CAPABILITY_TTL;
        let mut selections = Vec::with_capacity(prepared.files.len());
        for entry in prepared.files {
            let transfer_id = Uuid::new_v4().to_string();
            selections.push(FolderTransferFileSelection {
                transfer_id: transfer_id.clone(),
                relative_path: entry.relative_path,
                total_bytes: entry.source.total_bytes(),
            });
            local_files.capabilities.insert(
                transfer_id,
                LocalFileCapability {
                    session_id: session_id.to_owned(),
                    expires_at,
                    is_attached: false,
                    is_active: false,
                    is_revoked: false,
                    attempt_id: None,
                    kind: LocalFileCapabilityKind::Download {
                        source: entry.source,
                        target: entry.target,
                    },
                },
            );
        }
        let transfer_ids = selections
            .iter()
            .map(|selection| selection.transfer_id.clone())
            .collect::<Vec<_>>();
        drop(local_files);
        if !transfer_ids.is_empty()
            && let Err(error) = self.ensure_connected(session_id).await
        {
            self.discard_local_file_capabilities(&transfer_ids).await;
            return Err(error);
        }
        Ok(Some(FolderTransferSelection {
            folder_name: prepared.folder_name,
            files: selections,
        }))
    }

    pub async fn attach_remote_file_transfers(
        &self,
        transfer_ids: &[String],
    ) -> Result<(), SessionManagerError> {
        let transfer_ids = canonical_transfer_ids(transfer_ids)?;
        let mut local_files = self.local_files.lock().await;
        local_files.purge_expired();

        if transfer_ids.iter().any(|transfer_id| {
            local_files
                .capabilities
                .get(transfer_id)
                .is_none_or(|capability| capability.is_revoked)
        }) {
            return Err(SessionManagerError::LocalFileCapabilityUnavailable);
        }

        for transfer_id in transfer_ids {
            if let Some(capability) = local_files.capabilities.get_mut(&transfer_id) {
                capability.is_attached = true;
            }
        }
        Ok(())
    }

    pub async fn upload_remote_file(
        &self,
        transfer_id: String,
        progress: mpsc::Sender<RemoteFileTransferProgress>,
    ) -> Result<RemoteUploadResult, SessionManagerError> {
        let transfer_id = canonical_transfer_id(&transfer_id)?;
        let session_id = self
            .capability_session_id(&transfer_id, LocalFileDirection::Upload)
            .await?;
        let registered = self.register_transfer(&transfer_id, &session_id).await?;
        let (result_sender, result_receiver) = oneshot::channel();
        let manager = self.clone();
        let task_transfer_id = transfer_id.clone();
        tauri::async_runtime::spawn(async move {
            let result = manager
                .execute_upload_transfer(
                    &task_transfer_id,
                    registered.control,
                    registered.lifecycle.clone(),
                    progress,
                )
                .await;
            let finish = registered.lifecycle.finish();
            let result = finalize_transfer_result(result, finish);
            manager
                .finish_local_file_attempt(&task_transfer_id, &result)
                .await;
            let _completion_result = registered.completion.send(true);
            manager.transfers.lock().await.remove(&task_transfer_id);
            let _result = result_sender.send(result);
        });

        result_receiver
            .await
            .map_err(|_| SessionManagerError::Unavailable)?
    }

    pub async fn download_remote_file(
        &self,
        transfer_id: String,
        progress: mpsc::Sender<RemoteFileTransferProgress>,
    ) -> Result<RemoteDownloadResult, SessionManagerError> {
        let transfer_id = canonical_transfer_id(&transfer_id)?;
        let session_id = self
            .capability_session_id(&transfer_id, LocalFileDirection::Download)
            .await?;
        let registered = self.register_transfer(&transfer_id, &session_id).await?;
        let (result_sender, result_receiver) = oneshot::channel();
        let manager = self.clone();
        let task_transfer_id = transfer_id.clone();
        tauri::async_runtime::spawn(async move {
            let result = manager
                .execute_download_transfer(
                    &task_transfer_id,
                    registered.control,
                    registered.lifecycle.clone(),
                    progress,
                )
                .await;
            let finish = registered.lifecycle.finish();
            let result = finalize_transfer_result(result, finish);
            manager
                .finish_local_file_attempt(&task_transfer_id, &result)
                .await;
            let _completion_result = registered.completion.send(true);
            manager.transfers.lock().await.remove(&task_transfer_id);
            let _result = result_sender.send(result);
        });

        result_receiver
            .await
            .map_err(|_| SessionManagerError::Unavailable)?
    }

    pub async fn cancel_remote_file_transfer(
        &self,
        transfer_id: &str,
    ) -> Result<RemoteFileTransferControlStatus, SessionManagerError> {
        let transfer_id = canonical_transfer_id(transfer_id)?;
        let transfer = self
            .transfers
            .lock()
            .await
            .get(&transfer_id)
            .map(|control| (control.lifecycle.clone(), control.control.clone()));
        if let Some((lifecycle, control)) = transfer {
            let status = lifecycle.request_cancellation();
            if status == RemoteFileTransferControlStatus::Accepted {
                let _send_result = control.send(RemoteFileTransferControl::Cancel);
            }
            return Ok(status);
        }

        let removed = self.remove_idle_capability(&transfer_id).await;
        if let Some(capability) = removed {
            self.cleanup_transfer_attempt(&capability).await;
            Ok(RemoteFileTransferControlStatus::Accepted)
        } else {
            Ok(RemoteFileTransferControlStatus::NotFound)
        }
    }

    pub async fn pause_remote_file_transfer(
        &self,
        transfer_id: &str,
    ) -> Result<RemoteFileTransferControlStatus, SessionManagerError> {
        let transfer_id = canonical_transfer_id(transfer_id)?;
        let transfer = self
            .transfers
            .lock()
            .await
            .get(&transfer_id)
            .map(|control| (control.lifecycle.clone(), control.control.clone()));
        let Some((lifecycle, control)) = transfer else {
            return Ok(RemoteFileTransferControlStatus::NotFound);
        };
        let status = lifecycle.request_pause();
        if status == RemoteFileTransferControlStatus::Accepted {
            let _send_result = control.send(RemoteFileTransferControl::Pause);
        }
        Ok(status)
    }

    pub async fn close(&self, session_id: &str) -> Result<(), SessionManagerError> {
        let entry = self.entry(session_id).await?;
        let closing_snapshot = {
            let mut snapshot = entry.snapshot.write().await;
            if snapshot.state.is_terminal() || snapshot.state == SessionState::Closing {
                None
            } else {
                snapshot.state = SessionState::Closing;
                snapshot.host_key_challenge = None;
                Some(snapshot.clone())
            }
        };

        self.cancel_and_wait_transfers_for_session(session_id).await;
        self.revoke_capabilities_for_session(session_id).await;
        let Some(closing_snapshot) = closing_snapshot else {
            return Ok(());
        };
        let _send_result = entry
            .events
            .try_send(SessionEvent::Snapshot(closing_snapshot));
        let _ = entry.host_key_decisions.try_send(HostKeyDecision::Reject);
        let _ = entry.controls.try_send(SessionControl::Close);
        let _ = entry.cancellation.send(true);
        Ok(())
    }

    pub async fn close_all(&self) {
        let session_ids = self
            .sessions
            .read()
            .await
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        let mut closing_tasks = Vec::with_capacity(session_ids.len());
        for session_id in session_ids {
            let manager = self.clone();
            closing_tasks.push(tauri::async_runtime::spawn(async move {
                let _close_result = manager.close(&session_id).await;
            }));
        }
        for task in closing_tasks {
            let _join_result = task.await;
        }
    }

    async fn send_connected(
        &self,
        session_id: &str,
        control: SessionControl,
    ) -> Result<(), SessionManagerError> {
        let entry = self.entry(session_id).await?;
        if entry.snapshot.read().await.state != SessionState::Connected {
            return Err(SessionManagerError::InvalidState);
        }
        entry
            .controls
            .send(control)
            .await
            .map_err(|_| SessionManagerError::Unavailable)
    }

    async fn ensure_connected(&self, session_id: &str) -> Result<(), SessionManagerError> {
        let entry = self.entry(session_id).await?;
        if entry.snapshot.read().await.state == SessionState::Connected {
            Ok(())
        } else {
            Err(SessionManagerError::InvalidState)
        }
    }

    async fn capability_session_id(
        &self,
        transfer_id: &str,
        expected_direction: LocalFileDirection,
    ) -> Result<String, SessionManagerError> {
        let mut local_files = self.local_files.lock().await;
        local_files.purge_expired();
        let capability = local_files
            .capabilities
            .get(transfer_id)
            .ok_or(SessionManagerError::LocalFileCapabilityUnavailable)?;
        if capability.direction() != expected_direction
            || capability.is_active
            || capability.is_revoked
        {
            return Err(SessionManagerError::LocalFileCapabilityUnavailable);
        }
        Ok(capability.session_id.clone())
    }

    async fn execute_upload_transfer(
        &self,
        transfer_id: &str,
        mut control: watch::Receiver<RemoteFileTransferControl>,
        lifecycle: Arc<RemoteFileTransferLifecycle>,
        progress: mpsc::Sender<RemoteFileTransferProgress>,
    ) -> Result<RemoteUploadResult, SessionManagerError> {
        let claimed = self.claim_upload_capability(transfer_id).await?;
        let remote_files = self
            .remote_file_session_for_transfer(&claimed.session_id, &mut control)
            .await?;
        remote_files
            .upload_file(
                &claimed.file,
                &claimed.remote_directory,
                RemoteFileTransferRuntime {
                    transfer_id: transfer_id.to_owned(),
                    attempt_id: claimed.attempt_id,
                    control,
                    lifecycle,
                    progress,
                },
            )
            .await
            .map_err(SessionManagerError::from)
    }

    async fn execute_download_transfer(
        &self,
        transfer_id: &str,
        mut control: watch::Receiver<RemoteFileTransferControl>,
        lifecycle: Arc<RemoteFileTransferLifecycle>,
        progress: mpsc::Sender<RemoteFileTransferProgress>,
    ) -> Result<RemoteDownloadResult, SessionManagerError> {
        let claimed = self.claim_download_capability(transfer_id).await?;
        let remote_files = self
            .remote_file_session_for_transfer(&claimed.session_id, &mut control)
            .await?;
        remote_files
            .download_file(
                &claimed.source,
                &claimed.target,
                RemoteFileTransferRuntime {
                    transfer_id: transfer_id.to_owned(),
                    attempt_id: claimed.attempt_id,
                    control,
                    lifecycle,
                    progress,
                },
            )
            .await
            .map_err(SessionManagerError::from)
    }

    async fn claim_upload_capability(
        &self,
        transfer_id: &str,
    ) -> Result<ClaimedUploadCapability, SessionManagerError> {
        let mut local_files = self.local_files.lock().await;
        local_files.purge_expired();
        let capability = local_files
            .capabilities
            .get_mut(transfer_id)
            .ok_or(SessionManagerError::LocalFileCapabilityUnavailable)?;
        if capability.is_active || capability.is_revoked {
            return Err(SessionManagerError::LocalFileCapabilityUnavailable);
        }
        let LocalFileCapabilityKind::Upload {
            remote_directory,
            file,
        } = &capability.kind
        else {
            return Err(SessionManagerError::LocalFileCapabilityUnavailable);
        };
        let claimed = ClaimedUploadCapability {
            session_id: capability.session_id.clone(),
            remote_directory: remote_directory.clone(),
            file: file.clone(),
            attempt_id: capability
                .attempt_id
                .get_or_insert_with(|| Uuid::new_v4().to_string())
                .clone(),
        };
        capability.is_active = true;
        Ok(claimed)
    }

    async fn claim_download_capability(
        &self,
        transfer_id: &str,
    ) -> Result<ClaimedDownloadCapability, SessionManagerError> {
        let mut local_files = self.local_files.lock().await;
        local_files.purge_expired();
        let (session_id, source, target, attempt_id) = {
            let capability = local_files
                .capabilities
                .get(transfer_id)
                .ok_or(SessionManagerError::LocalFileCapabilityUnavailable)?;
            if capability.is_active || capability.is_revoked {
                return Err(SessionManagerError::LocalFileCapabilityUnavailable);
            }
            let LocalFileCapabilityKind::Download { source, target } = &capability.kind else {
                return Err(SessionManagerError::LocalFileCapabilityUnavailable);
            };
            (
                capability.session_id.clone(),
                source.clone(),
                target.clone(),
                capability
                    .attempt_id
                    .clone()
                    .unwrap_or_else(|| Uuid::new_v4().to_string()),
            )
        };
        if !local_files
            .active_download_targets
            .insert(target.path().to_path_buf())
        {
            return Err(SessionManagerError::TransferDestinationBusy);
        }
        let capability = local_files
            .capabilities
            .get_mut(transfer_id)
            .ok_or(SessionManagerError::LocalFileCapabilityUnavailable)?;
        capability.is_active = true;
        capability.attempt_id = Some(attempt_id.clone());
        Ok(ClaimedDownloadCapability {
            session_id,
            source,
            target,
            attempt_id,
        })
    }

    async fn finish_local_file_attempt<T>(
        &self,
        transfer_id: &str,
        result: &Result<T, SessionManagerError>,
    ) {
        let mut local_files = self.local_files.lock().await;
        let Some(capability) = local_files.capabilities.get(transfer_id) else {
            return;
        };
        let download_target = match &capability.kind {
            LocalFileCapabilityKind::Download { target, .. } => Some(target.path().to_path_buf()),
            LocalFileCapabilityKind::Upload { .. } => None,
        };
        let is_paused = matches!(result, Err(SessionManagerError::TransferPaused));
        let should_retain = !capability.is_revoked
            && (is_paused || matches!(result, Err(error) if error.is_retryable_transfer()))
            && (capability.is_attached || capability.expires_at > Instant::now());
        let cleanup =
            (result.is_err() && (!is_paused || !should_retain)).then(|| capability.clone());
        if let Some(target) = download_target {
            local_files.active_download_targets.remove(&target);
        }
        if should_retain {
            if let Some(capability) = local_files.capabilities.get_mut(transfer_id) {
                capability.is_active = false;
                if !is_paused {
                    capability.attempt_id = None;
                }
            }
        } else {
            local_files.capabilities.remove(transfer_id);
        }
        drop(local_files);
        if let Some(capability) = cleanup {
            self.cleanup_transfer_attempt(&capability).await;
        }
    }

    async fn remote_file_session(
        &self,
        session_id: &str,
    ) -> Result<crate::infrastructure::sftp::RemoteFileSession, SessionManagerError> {
        let entry = self.entry(session_id).await?;
        if entry.snapshot.read().await.state != SessionState::Connected {
            return Err(SessionManagerError::InvalidState);
        }

        if let RemoteFileSessionState::Ready(remote_files) = entry.remote_files.read().await.clone()
        {
            return Ok(remote_files);
        }

        let (completion_sender, completion_receiver) = oneshot::channel();
        entry
            .remote_file_requests
            .send(completion_sender)
            .await
            .map_err(|_| SessionManagerError::RemoteFilesUnavailable)?;
        completion_receiver
            .await
            .map_err(|_| SessionManagerError::RemoteFilesUnavailable)?;

        match entry.remote_files.read().await.clone() {
            RemoteFileSessionState::Ready(remote_files) => Ok(remote_files),
            RemoteFileSessionState::Idle
            | RemoteFileSessionState::Connecting
            | RemoteFileSessionState::Unavailable => {
                Err(SessionManagerError::RemoteFilesUnavailable)
            }
        }
    }

    async fn register_transfer(
        &self,
        transfer_id: &str,
        session_id: &str,
    ) -> Result<RegisteredTransfer, SessionManagerError> {
        let (control_sender, control_receiver) = watch::channel(RemoteFileTransferControl::Running);
        let (completion_sender, completion_receiver) = watch::channel(false);
        let lifecycle = Arc::new(RemoteFileTransferLifecycle::new());
        let mut transfers = self.transfers.lock().await;
        if transfers.contains_key(transfer_id) {
            return Err(SessionManagerError::InvalidInput {
                field: "transferId",
                message: "这个传输任务已经存在。",
            });
        }
        if transfers.len() >= MAX_ACTIVE_TRANSFERS {
            return Err(SessionManagerError::TransferConcurrencyLimit);
        }
        transfers.insert(
            transfer_id.to_owned(),
            TransferControl {
                session_id: session_id.to_owned(),
                control: control_sender,
                lifecycle: lifecycle.clone(),
                completion: completion_receiver,
            },
        );
        Ok(RegisteredTransfer {
            control: control_receiver,
            lifecycle,
            completion: completion_sender,
        })
    }

    async fn remote_file_session_for_transfer(
        &self,
        session_id: &str,
        control: &mut watch::Receiver<RemoteFileTransferControl>,
    ) -> Result<crate::infrastructure::sftp::RemoteFileSession, SessionManagerError> {
        match *control.borrow() {
            RemoteFileTransferControl::Running => {}
            RemoteFileTransferControl::Pause => {
                return Err(SessionManagerError::TransferPaused);
            }
            RemoteFileTransferControl::Cancel => {
                return Err(SessionManagerError::TransferCancelled);
            }
        }

        tokio::select! {
            biased;
            changed = control.changed() => {
                match changed {
                    Ok(()) => match *control.borrow() {
                        RemoteFileTransferControl::Running => Err(SessionManagerError::RemoteFilesUnavailable),
                        RemoteFileTransferControl::Pause => Err(SessionManagerError::TransferPaused),
                        RemoteFileTransferControl::Cancel => Err(SessionManagerError::TransferCancelled),
                    },
                    _ => Err(SessionManagerError::RemoteFilesUnavailable),
                }
            }
            result = self.remote_file_session(session_id) => result,
        }
    }

    async fn cancel_and_wait_transfers_for_session(&self, session_id: &str) {
        let mut completions = Vec::new();
        {
            let transfers = self.transfers.lock().await;
            for transfer in transfers.values() {
                if transfer.session_id == session_id {
                    if transfer.lifecycle.request_cancellation()
                        == RemoteFileTransferControlStatus::Accepted
                    {
                        let _send_result = transfer.control.send(RemoteFileTransferControl::Cancel);
                    }
                    completions.push(transfer.completion.clone());
                }
            }
        }

        let deadline = Instant::now() + TRANSFER_CLEANUP_TIMEOUT;
        for mut completion in completions {
            if *completion.borrow() {
                continue;
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            let _wait_result = tokio::time::timeout(remaining, async {
                while !*completion.borrow() {
                    if completion.changed().await.is_err() {
                        break;
                    }
                }
            })
            .await;
        }
    }

    async fn revoke_capabilities_for_session(&self, session_id: &str) {
        let mut local_files = self.local_files.lock().await;
        let transfer_ids = local_files
            .capabilities
            .iter()
            .filter(|(_, capability)| capability.session_id == session_id)
            .map(|(transfer_id, _)| transfer_id.clone())
            .collect::<Vec<_>>();
        let mut removed = Vec::new();
        for transfer_id in transfer_ids {
            let is_active = local_files
                .capabilities
                .get(&transfer_id)
                .is_some_and(|capability| capability.is_active);
            if is_active {
                if let Some(capability) = local_files.capabilities.get_mut(&transfer_id) {
                    // Preserve an inaccessible tombstone and its destination reservation until
                    // an attempt already beyond the bounded shutdown wait actually finishes.
                    capability.is_revoked = true;
                }
                continue;
            }
            if let Some(capability) = local_files.capabilities.remove(&transfer_id) {
                if let LocalFileCapabilityKind::Download { target, .. } = &capability.kind {
                    local_files.active_download_targets.remove(target.path());
                }
                removed.push(capability);
            }
        }
        drop(local_files);
        for capability in removed {
            self.cleanup_transfer_attempt(&capability).await;
        }
    }

    async fn discard_local_file_capabilities(&self, transfer_ids: &[String]) {
        let mut local_files = self.local_files.lock().await;
        for transfer_id in transfer_ids {
            let Some(capability) = local_files.capabilities.remove(transfer_id) else {
                continue;
            };
            if let LocalFileCapabilityKind::Download { target, .. } = capability.kind {
                local_files.active_download_targets.remove(target.path());
            }
        }
    }

    async fn remove_idle_capability(&self, transfer_id: &str) -> Option<LocalFileCapability> {
        let mut local_files = self.local_files.lock().await;
        if local_files
            .capabilities
            .get(transfer_id)
            .is_some_and(|capability| capability.is_active)
        {
            return None;
        }
        let capability = local_files.capabilities.remove(transfer_id)?;
        if let LocalFileCapabilityKind::Download { target, .. } = &capability.kind {
            local_files.active_download_targets.remove(target.path());
        }
        Some(capability)
    }

    async fn cleanup_transfer_attempt(&self, capability: &LocalFileCapability) {
        let Some(attempt_id) = capability.attempt_id.as_deref() else {
            return;
        };
        match &capability.kind {
            LocalFileCapabilityKind::Upload {
                remote_directory, ..
            } => {
                let Ok(entry) = self.entry(&capability.session_id).await else {
                    return;
                };
                let remote_files = entry.remote_files.read().await.clone();
                if let RemoteFileSessionState::Ready(remote_files) = remote_files {
                    let _cleanup_result = tokio::time::timeout(
                        TRANSFER_ATTEMPT_CLEANUP_TIMEOUT,
                        remote_files.cleanup_upload_attempt(remote_directory, attempt_id),
                    )
                    .await;
                }
            }
            LocalFileCapabilityKind::Download { target, .. } => {
                cleanup_local_download_attempt(attempt_id, target).await;
            }
        }
    }

    async fn entry(&self, session_id: &str) -> Result<SessionEntry, SessionManagerError> {
        self.sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or(SessionManagerError::NotFound)
    }
}

async fn choose_local_upload_files(
    window: &WebviewWindow,
) -> Result<Vec<PathBuf>, SessionManagerError> {
    let (selection_sender, selection_receiver) = oneshot::channel();
    window
        .dialog()
        .file()
        .set_parent(window)
        .set_title("选择要上传的文件")
        .pick_files(move |selection| {
            let _send_result = selection_sender.send(selection);
        });
    let selection = selection_receiver
        .await
        .map_err(|_| SessionManagerError::LocalFileSelectionUnavailable)?;
    selection
        .unwrap_or_default()
        .into_iter()
        .map(|path| {
            path.into_path()
                .map_err(|_| SessionManagerError::LocalFileSelectionUnavailable)
        })
        .collect()
}

async fn choose_local_upload_folder(
    window: &WebviewWindow,
) -> Result<Option<PathBuf>, SessionManagerError> {
    choose_local_folder(window, "选择要上传的文件夹").await
}

async fn choose_local_download_folder(
    window: &WebviewWindow,
) -> Result<Option<PathBuf>, SessionManagerError> {
    choose_local_folder(window, "选择文件夹保存位置").await
}

async fn choose_local_folder(
    window: &WebviewWindow,
    title: &'static str,
) -> Result<Option<PathBuf>, SessionManagerError> {
    let (selection_sender, selection_receiver) = oneshot::channel();
    window
        .dialog()
        .file()
        .set_parent(window)
        .set_title(title)
        .pick_folder(move |selection| {
            let _send_result = selection_sender.send(selection);
        });
    selection_receiver
        .await
        .map_err(|_| SessionManagerError::LocalFileSelectionUnavailable)?
        .map(|path| {
            path.into_path()
                .map_err(|_| SessionManagerError::LocalFileSelectionUnavailable)
        })
        .transpose()
}

async fn choose_local_download_target(
    window: &WebviewWindow,
    default_file_name: &str,
) -> Result<Option<PathBuf>, SessionManagerError> {
    let (selection_sender, selection_receiver) = oneshot::channel();
    window
        .dialog()
        .file()
        .set_parent(window)
        .set_title("保存远程文件")
        .set_file_name(default_file_name)
        .save_file(move |selection| {
            let _send_result = selection_sender.send(selection);
        });
    selection_receiver
        .await
        .map_err(|_| SessionManagerError::LocalFileSelectionUnavailable)?
        .map(|path| {
            path.into_path()
                .map_err(|_| SessionManagerError::LocalFileSelectionUnavailable)
        })
        .transpose()
}

fn validate_dialog_file_name(file_name: &str) -> Result<(), SessionManagerError> {
    let path = std::path::Path::new(file_name);
    if file_name.is_empty()
        || file_name.len() > 255
        || file_name.contains('\0')
        || matches!(file_name, "." | "..")
        || path.file_name().and_then(|name| name.to_str()) != Some(file_name)
    {
        return Err(SessionManagerError::InvalidInput {
            field: "defaultFileName",
            message: "默认文件名无效。",
        });
    }
    Ok(())
}

fn canonical_transfer_id(transfer_id: &str) -> Result<String, SessionManagerError> {
    Uuid::parse_str(transfer_id)
        .map(|id| id.to_string())
        .map_err(|_| SessionManagerError::InvalidInput {
            field: "transferId",
            message: "传输任务标识无效。",
        })
}

fn canonical_transfer_ids(transfer_ids: &[String]) -> Result<Vec<String>, SessionManagerError> {
    if transfer_ids.len() > MAX_TRANSFER_ATTACH_BATCH {
        return Err(SessionManagerError::InvalidInput {
            field: "transferIds",
            message: "单次加入传输队列的任务过多。",
        });
    }

    let mut canonical_ids = Vec::with_capacity(transfer_ids.len());
    let mut unique_ids = HashSet::with_capacity(transfer_ids.len());
    for transfer_id in transfer_ids {
        let canonical_id = Uuid::parse_str(transfer_id)
            .map(|id| id.to_string())
            .map_err(|_| SessionManagerError::InvalidInput {
                field: "transferIds",
                message: "传输任务标识无效。",
            })?;
        if !unique_ids.insert(canonical_id.clone()) {
            return Err(SessionManagerError::InvalidInput {
                field: "transferIds",
                message: "传输任务标识不能重复。",
            });
        }
        canonical_ids.push(canonical_id);
    }
    Ok(canonical_ids)
}

#[derive(Default)]
struct LocalFileCapabilityStore {
    capabilities: HashMap<String, LocalFileCapability>,
    active_download_targets: HashSet<PathBuf>,
}

impl LocalFileCapabilityStore {
    fn purge_expired(&mut self) {
        let now = Instant::now();
        self.capabilities.retain(|_, capability| {
            capability.is_active
                || (!capability.is_revoked
                    && (capability.is_attached || capability.expires_at > now))
        });
    }

    fn contains_upload_destination(&self, destination: &UploadDestination) -> bool {
        self.capabilities.values().any(|capability| {
            let LocalFileCapabilityKind::Upload {
                remote_directory,
                file,
            } = &capability.kind
            else {
                return false;
            };
            UploadDestination::new(
                &capability.session_id,
                remote_directory,
                &file.metadata().file_name,
            ) == *destination
        })
    }

    fn contains_download_target(&self, path: &std::path::Path) -> bool {
        self.capabilities.values().any(|capability| {
            matches!(
                &capability.kind,
                LocalFileCapabilityKind::Download { target, .. } if target.path() == path
            )
        })
    }
}

#[derive(Clone)]
struct LocalFileCapability {
    session_id: String,
    expires_at: Instant,
    is_attached: bool,
    is_active: bool,
    is_revoked: bool,
    attempt_id: Option<String>,
    kind: LocalFileCapabilityKind,
}

impl LocalFileCapability {
    fn direction(&self) -> LocalFileDirection {
        match &self.kind {
            LocalFileCapabilityKind::Upload { .. } => LocalFileDirection::Upload,
            LocalFileCapabilityKind::Download { .. } => LocalFileDirection::Download,
        }
    }
}

#[derive(Clone)]
enum LocalFileCapabilityKind {
    Upload {
        remote_directory: String,
        file: AuthorizedLocalUploadFile,
    },
    Download {
        source: AuthorizedRemoteDownloadFile,
        target: AuthorizedLocalDownloadTarget,
    },
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum LocalFileDirection {
    Upload,
    Download,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct UploadDestination {
    session_id: String,
    remote_directory: String,
    file_name: String,
}

impl UploadDestination {
    fn new(session_id: &str, remote_directory: &str, file_name: &str) -> Self {
        let remote_directory = if remote_directory == "/" {
            "/"
        } else {
            remote_directory.trim_end_matches('/')
        };
        Self {
            session_id: session_id.to_owned(),
            remote_directory: remote_directory.to_owned(),
            file_name: file_name.to_owned(),
        }
    }
}

struct ClaimedUploadCapability {
    session_id: String,
    remote_directory: String,
    file: AuthorizedLocalUploadFile,
    attempt_id: String,
}

struct ClaimedDownloadCapability {
    session_id: String,
    source: AuthorizedRemoteDownloadFile,
    target: AuthorizedLocalDownloadTarget,
    attempt_id: String,
}

struct RegisteredTransfer {
    control: watch::Receiver<RemoteFileTransferControl>,
    lifecycle: Arc<RemoteFileTransferLifecycle>,
    completion: watch::Sender<bool>,
}

#[derive(Clone)]
struct SessionEntry {
    snapshot: SharedSessionSnapshot,
    remote_files: SharedRemoteFileSession,
    controls: mpsc::Sender<SessionControl>,
    host_key_decisions: mpsc::Sender<HostKeyDecision>,
    remote_file_requests: mpsc::Sender<oneshot::Sender<()>>,
    cancellation: watch::Sender<bool>,
    events: mpsc::Sender<SessionEvent>,
}

struct TransferControl {
    session_id: String,
    control: watch::Sender<RemoteFileTransferControl>,
    lifecycle: Arc<RemoteFileTransferLifecycle>,
    completion: watch::Receiver<bool>,
}

fn finalize_transfer_result<T>(
    result: Result<T, SessionManagerError>,
    finish: RemoteFileTransferFinish,
) -> Result<T, SessionManagerError> {
    match finish {
        RemoteFileTransferFinish::Completed => result,
        RemoteFileTransferFinish::Paused => Err(SessionManagerError::TransferPaused),
        RemoteFileTransferFinish::Cancelled => Err(SessionManagerError::TransferCancelled),
    }
}

async fn finish_session(
    snapshot: &SharedSessionSnapshot,
    result: Result<SshSessionEnd, SshTransportError>,
) -> SessionSnapshot {
    let mut snapshot = snapshot.write().await;
    let was_closing = snapshot.state == SessionState::Closing;
    if was_closing {
        snapshot.state = SessionState::Closed;
        snapshot.failure = None;
        snapshot.host_key_challenge = None;
        return snapshot.clone();
    }

    match result {
        Ok(SshSessionEnd::Closed) => {
            snapshot.state = SessionState::Closed;
            snapshot.failure = None;
            snapshot.host_key_challenge = None;
        }
        Ok(SshSessionEnd::Disconnected) => {
            snapshot.state = SessionState::Disconnected;
            snapshot.failure = None;
            snapshot.host_key_challenge = None;
        }
        Err(error) => {
            snapshot.state = SessionState::Error;
            snapshot.failure = Some(error.failure());
        }
    }
    snapshot.clone()
}

#[derive(Debug)]
pub enum SessionManagerError {
    InvalidInput {
        field: &'static str,
        message: &'static str,
    },
    NotFound,
    InvalidState,
    Unavailable,
    InvalidRemotePath,
    InvalidRemoteName,
    InvalidLocalFile,
    InvalidLocalDownloadTarget,
    InvalidLocalFolder,
    UnsupportedFolderEntry,
    UnsupportedLocalFolderName,
    FolderTransferTooLarge,
    LocalFolderExists,
    LocalDirectoryCreateFailed,
    LocalFileSelectionUnavailable,
    LocalFileCapabilityUnavailable,
    LocalFileCapabilityChanged,
    LocalUploadFileChanged,
    TransferDestinationBusy,
    TransferConcurrencyLimit,
    RemoteFilesUnavailable,
    RemoteDirectoryUnavailable,
    RemoteEntryExists,
    RemoteFileExists,
    RemoteCreateFailed,
    RemoteRenameFailed,
    RemoteDeleteFailed,
    TransferCancelled,
    TransferPaused,
    TransferResumeInvalid,
    RemoteUploadFailed,
    RemoteDownloadUnavailable,
    RemoteDownloadFileChanged,
    RemoteDownloadFailed,
    LocalDownloadWriteFailed,
    LocalDownloadCommitFailed,
    FileSizeExceedsSafeInteger,
}

impl From<SessionValidationError> for SessionManagerError {
    fn from(error: SessionValidationError) -> Self {
        Self::InvalidInput {
            field: error.field,
            message: error.message,
        }
    }
}

impl From<RemoteFileError> for SessionManagerError {
    fn from(error: RemoteFileError) -> Self {
        match error {
            RemoteFileError::InvalidPath => Self::InvalidRemotePath,
            RemoteFileError::InvalidName => Self::InvalidRemoteName,
            RemoteFileError::InvalidLocalFile => Self::InvalidLocalFile,
            RemoteFileError::InvalidLocalDownloadTarget => Self::InvalidLocalDownloadTarget,
            RemoteFileError::InvalidLocalFolder => Self::InvalidLocalFolder,
            RemoteFileError::UnsupportedFolderEntry => Self::UnsupportedFolderEntry,
            RemoteFileError::UnsupportedLocalFolderName => Self::UnsupportedLocalFolderName,
            RemoteFileError::FolderTransferTooLarge => Self::FolderTransferTooLarge,
            RemoteFileError::LocalFolderExists => Self::LocalFolderExists,
            RemoteFileError::LocalDirectoryCreateFailed => Self::LocalDirectoryCreateFailed,
            RemoteFileError::LocalFileCapabilityChanged => Self::LocalFileCapabilityChanged,
            RemoteFileError::LocalUploadFileChanged => Self::LocalUploadFileChanged,
            RemoteFileError::Unavailable => Self::RemoteFilesUnavailable,
            RemoteFileError::DirectoryUnavailable => Self::RemoteDirectoryUnavailable,
            RemoteFileError::EntryExists => Self::RemoteEntryExists,
            RemoteFileError::RemoteFileExists => Self::RemoteFileExists,
            RemoteFileError::CreateFailed => Self::RemoteCreateFailed,
            RemoteFileError::RenameFailed => Self::RemoteRenameFailed,
            RemoteFileError::DeleteFailed => Self::RemoteDeleteFailed,
            RemoteFileError::TransferCancelled => Self::TransferCancelled,
            RemoteFileError::TransferPaused => Self::TransferPaused,
            RemoteFileError::TransferResumeInvalid => Self::TransferResumeInvalid,
            RemoteFileError::UploadFailed => Self::RemoteUploadFailed,
            RemoteFileError::RemoteDownloadUnavailable => Self::RemoteDownloadUnavailable,
            RemoteFileError::RemoteDownloadFileChanged => Self::RemoteDownloadFileChanged,
            RemoteFileError::RemoteDownloadFailed => Self::RemoteDownloadFailed,
            RemoteFileError::LocalDownloadWriteFailed => Self::LocalDownloadWriteFailed,
            RemoteFileError::LocalDownloadCommitFailed => Self::LocalDownloadCommitFailed,
            RemoteFileError::FileSizeExceedsSafeInteger => Self::FileSizeExceedsSafeInteger,
        }
    }
}

impl std::fmt::Display for SessionManagerError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidInput { .. } => formatter.write_str("invalid SSH session input"),
            Self::NotFound => formatter.write_str("SSH session not found"),
            Self::InvalidState => formatter.write_str("SSH session is not ready for this action"),
            Self::Unavailable => formatter.write_str("SSH session is unavailable"),
            Self::InvalidRemotePath => formatter.write_str("remote path is invalid"),
            Self::InvalidRemoteName => formatter.write_str("remote entry name is invalid"),
            Self::InvalidLocalFile => formatter.write_str("local file is unavailable"),
            Self::InvalidLocalDownloadTarget => {
                formatter.write_str("local download target is unavailable")
            }
            Self::InvalidLocalFolder => formatter.write_str("local folder is unavailable"),
            Self::UnsupportedFolderEntry => {
                formatter.write_str("folder contains an unsupported entry")
            }
            Self::UnsupportedLocalFolderName => {
                formatter.write_str("folder contains a name that cannot be created locally")
            }
            Self::FolderTransferTooLarge => formatter.write_str("folder transfer is too large"),
            Self::LocalFolderExists => formatter.write_str("local folder already exists"),
            Self::LocalDirectoryCreateFailed => {
                formatter.write_str("local directory creation failed")
            }
            Self::LocalFileSelectionUnavailable => {
                formatter.write_str("local file selection is unavailable")
            }
            Self::LocalFileCapabilityUnavailable => {
                formatter.write_str("local file authorization is unavailable")
            }
            Self::LocalFileCapabilityChanged => {
                formatter.write_str("authorized local file changed")
            }
            Self::LocalUploadFileChanged => {
                formatter.write_str("local upload file changed during transfer")
            }
            Self::TransferDestinationBusy => {
                formatter.write_str("file transfer destination is already reserved")
            }
            Self::TransferConcurrencyLimit => {
                formatter.write_str("file transfer concurrency limit reached")
            }
            Self::RemoteFilesUnavailable => formatter.write_str("SFTP session is unavailable"),
            Self::RemoteDirectoryUnavailable => {
                formatter.write_str("remote directory is unavailable")
            }
            Self::RemoteEntryExists => formatter.write_str("remote entry already exists"),
            Self::RemoteFileExists => formatter.write_str("remote file already exists"),
            Self::RemoteCreateFailed => formatter.write_str("remote entry creation failed"),
            Self::RemoteRenameFailed => formatter.write_str("remote entry rename failed"),
            Self::RemoteDeleteFailed => formatter.write_str("remote entry deletion failed"),
            Self::TransferCancelled => formatter.write_str("file transfer was cancelled"),
            Self::TransferPaused => formatter.write_str("file transfer was paused"),
            Self::TransferResumeInvalid => {
                formatter.write_str("file transfer resume data is invalid")
            }
            Self::RemoteUploadFailed => formatter.write_str("remote file upload failed"),
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

impl std::error::Error for SessionManagerError {}

impl SessionManagerError {
    fn is_retryable_transfer(&self) -> bool {
        matches!(
            self,
            Self::RemoteFilesUnavailable
                | Self::RemoteDirectoryUnavailable
                | Self::RemoteUploadFailed
                | Self::RemoteDownloadFailed
        )
    }
}
