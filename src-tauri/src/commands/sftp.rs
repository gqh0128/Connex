use tauri::State;

use crate::managers::sessions::SshSessionManager;
use crate::models::error::CommandError;
use crate::models::sftp::RemoteDirectoryDto;

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
