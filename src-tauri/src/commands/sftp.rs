use tauri::ipc::Channel;
use tauri::{State, WebviewWindow};
use tokio::sync::mpsc;

use crate::managers::sessions::SshSessionManager;
use crate::models::error::CommandError;
use crate::models::sftp::{
    AttachRemoteFileTransfersInput, DownloadRemoteFileInput, LocalDownloadTargetSelectionDto,
    LocalUploadFileSelectionDto, RemoteDirectoryDto, RemoteDownloadResultDto,
    RemoteFileTransferCancelStatusDto, RemoteFileTransferProgressDto, RemoteUploadResultDto,
    SelectLocalDownloadTargetInput, SelectLocalUploadFilesInput, UploadRemoteFileInput,
};

const TRANSFER_EVENT_QUEUE_CAPACITY: usize = 32;

#[tauri::command]
pub async fn list_remote_directory(
    session_id: String,
    path: Option<String>,
    sessions: State<'_, SshSessionManager>,
) -> Result<RemoteDirectoryDto, CommandError> {
    sessions
        .list_remote_directory(&session_id, path.as_deref())
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn create_remote_directory(
    session_id: String,
    parent_path: String,
    name: String,
    sessions: State<'_, SshSessionManager>,
) -> Result<String, CommandError> {
    sessions
        .create_remote_directory(&session_id, &parent_path, &name)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn create_remote_file(
    session_id: String,
    parent_path: String,
    name: String,
    sessions: State<'_, SshSessionManager>,
) -> Result<String, CommandError> {
    sessions
        .create_remote_file(&session_id, &parent_path, &name)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn rename_remote_entry(
    session_id: String,
    path: String,
    new_name: String,
    sessions: State<'_, SshSessionManager>,
) -> Result<String, CommandError> {
    sessions
        .rename_remote_entry(&session_id, &path, &new_name)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_remote_entry(
    session_id: String,
    path: String,
    sessions: State<'_, SshSessionManager>,
) -> Result<(), CommandError> {
    sessions
        .delete_remote_entry(&session_id, &path)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn select_local_upload_files(
    input: SelectLocalUploadFilesInput,
    window: WebviewWindow,
    sessions: State<'_, SshSessionManager>,
) -> Result<Vec<LocalUploadFileSelectionDto>, CommandError> {
    sessions
        .select_local_upload_files(&window, &input.session_id, &input.remote_directory)
        .await
        .map(|selections| selections.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

#[tauri::command]
pub async fn select_local_download_target(
    input: SelectLocalDownloadTargetInput,
    window: WebviewWindow,
    sessions: State<'_, SshSessionManager>,
) -> Result<Option<LocalDownloadTargetSelectionDto>, CommandError> {
    sessions
        .select_local_download_target(
            &window,
            &input.session_id,
            &input.remote_path,
            &input.default_file_name,
        )
        .await
        .map(|selection| selection.map(Into::into))
        .map_err(Into::into)
}

#[tauri::command]
pub async fn attach_remote_file_transfers(
    input: AttachRemoteFileTransfersInput,
    sessions: State<'_, SshSessionManager>,
) -> Result<(), CommandError> {
    sessions
        .attach_remote_file_transfers(&input.transfer_ids)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn upload_remote_file(
    input: UploadRemoteFileInput,
    on_progress: Channel<RemoteFileTransferProgressDto>,
    sessions: State<'_, SshSessionManager>,
) -> Result<RemoteUploadResultDto, CommandError> {
    let progress_sender = forward_transfer_progress(on_progress);

    sessions
        .upload_remote_file(input.transfer_id, progress_sender)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn download_remote_file(
    input: DownloadRemoteFileInput,
    on_progress: Channel<RemoteFileTransferProgressDto>,
    sessions: State<'_, SshSessionManager>,
) -> Result<RemoteDownloadResultDto, CommandError> {
    let progress_sender = forward_transfer_progress(on_progress);

    sessions
        .download_remote_file(input.transfer_id, progress_sender)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn cancel_remote_file_transfer(
    transfer_id: String,
    sessions: State<'_, SshSessionManager>,
) -> Result<RemoteFileTransferCancelStatusDto, CommandError> {
    sessions
        .cancel_remote_file_transfer(&transfer_id)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

fn forward_transfer_progress(
    on_progress: Channel<RemoteFileTransferProgressDto>,
) -> mpsc::Sender<crate::domain::sftp::RemoteFileTransferProgress> {
    let (progress_sender, mut progress_receiver) = mpsc::channel::<
        crate::domain::sftp::RemoteFileTransferProgress,
    >(TRANSFER_EVENT_QUEUE_CAPACITY);
    tauri::async_runtime::spawn(async move {
        while let Some(progress) = progress_receiver.recv().await {
            if on_progress.send(progress.into()).is_err() {
                break;
            }
        }
    });
    progress_sender
}
