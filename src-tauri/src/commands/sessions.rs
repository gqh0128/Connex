use tauri::State;
use tauri::ipc::{Channel, InvokeResponseBody};
use tokio::sync::mpsc;

use crate::domain::sessions::{HostKeyDecision, SessionEvent, TerminalSize};
use crate::managers::sessions::SshSessionManager;
use crate::models::error::CommandError;
use crate::models::sessions::{
    HostKeyDecisionDto, ResizeSshSessionInput, SessionSnapshotDto, StartSshSessionInput,
};
use crate::services::connections::ConnectionService;

const SESSION_EVENT_QUEUE_CAPACITY: usize = 64;

#[tauri::command]
pub async fn start_ssh_session(
    input: StartSshSessionInput,
    on_state: Channel<SessionSnapshotDto>,
    on_output: Channel<InvokeResponseBody>,
    connections: State<'_, ConnectionService>,
    sessions: State<'_, SshSessionManager>,
) -> Result<SessionSnapshotDto, CommandError> {
    let terminal_size = input.terminal_size().map_err(CommandError::from)?;
    let (profile, credential) = connections
        .get_for_session(input.connection_id)
        .await
        .map_err(CommandError::from)?;
    let (event_sender, mut event_receiver) = mpsc::channel(SESSION_EVENT_QUEUE_CAPACITY);
    let snapshot = sessions
        .start(profile, credential, terminal_size, event_sender)
        .await
        .map_err(CommandError::from)?;

    let manager = sessions.inner().clone();
    let session_id = snapshot.id.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = event_receiver.recv().await {
            let send_result = match event {
                SessionEvent::Snapshot(snapshot) => on_state.send(snapshot.into()),
                SessionEvent::Output(data) => on_output.send(InvokeResponseBody::Raw(data)),
            };
            if send_result.is_err() {
                break;
            }
        }

        let _ = manager.close(&session_id).await;
    });

    Ok(snapshot.into())
}

#[tauri::command]
pub async fn get_ssh_session(
    session_id: String,
    sessions: State<'_, SshSessionManager>,
) -> Result<SessionSnapshotDto, CommandError> {
    sessions
        .get(&session_id)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn decide_ssh_host_key(
    session_id: String,
    decision: HostKeyDecisionDto,
    sessions: State<'_, SshSessionManager>,
) -> Result<(), CommandError> {
    sessions
        .decide_host_key(&session_id, HostKeyDecision::from(decision))
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn send_ssh_input(
    session_id: String,
    data: Vec<u8>,
    sessions: State<'_, SshSessionManager>,
) -> Result<(), CommandError> {
    sessions.write(&session_id, data).await.map_err(Into::into)
}

#[tauri::command]
pub async fn resize_ssh_session(
    session_id: String,
    input: ResizeSshSessionInput,
    sessions: State<'_, SshSessionManager>,
) -> Result<(), CommandError> {
    let size = TerminalSize::try_from(input).map_err(CommandError::from)?;
    sessions.resize(&session_id, size).await.map_err(Into::into)
}

#[tauri::command]
pub async fn keepalive_ssh_session(
    session_id: String,
    sessions: State<'_, SshSessionManager>,
) -> Result<(), CommandError> {
    sessions.keepalive(&session_id).await.map_err(Into::into)
}

#[tauri::command]
pub async fn close_ssh_session(
    session_id: String,
    sessions: State<'_, SshSessionManager>,
) -> Result<(), CommandError> {
    sessions.close(&session_id).await.map_err(Into::into)
}
