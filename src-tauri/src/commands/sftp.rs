use tauri::State;
use tauri::ipc::Channel;
use tokio::sync::mpsc;

use crate::managers::sessions::SshSessionManager;
use crate::models::error::CommandError;
use crate::models::sftp::{
    RemoteDirectoryDto, RemoteUploadProgressDto, RemoteUploadResultDto, UploadRemoteFileInput,
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
pub async fn upload_remote_file(
    input: UploadRemoteFileInput,
    on_progress: Channel<RemoteUploadProgressDto>,
    sessions: State<'_, SshSessionManager>,
) -> Result<RemoteUploadResultDto, CommandError> {
    let (progress_sender, mut progress_receiver) =
        mpsc::channel::<crate::domain::sftp::RemoteUploadProgress>(TRANSFER_EVENT_QUEUE_CAPACITY);
    tauri::async_runtime::spawn(async move {
        while let Some(progress) = progress_receiver.recv().await {
            if on_progress.send(progress.into()).is_err() {
                break;
            }
        }
    });

    sessions
        .upload_remote_file(
            input.transfer_id,
            &input.session_id,
            &input.local_path,
            &input.remote_directory,
            progress_sender,
        )
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn cancel_remote_file_upload(
    transfer_id: String,
    sessions: State<'_, SshSessionManager>,
) -> Result<(), CommandError> {
    sessions
        .cancel_remote_file_upload(&transfer_id)
        .await
        .map_err(Into::into)
}
