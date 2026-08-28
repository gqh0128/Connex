use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{RwLock, mpsc, watch};
use uuid::Uuid;

use crate::domain::connections::ConnectionProfile;
use crate::domain::credentials::SecretString;
use crate::domain::sessions::{
    HostKeyDecision, SessionControl, SessionEvent, SessionSnapshot, SessionState,
    SessionValidationError, StartSessionRequest, TerminalSize,
};
use crate::infrastructure::ssh::{
    SharedSessionSnapshot, SshConnector, SshSessionEnd, SshTransportError,
};

const CONTROL_QUEUE_CAPACITY: usize = 64;
const HOST_KEY_QUEUE_CAPACITY: usize = 1;
const MAX_INPUT_BYTES: usize = 64 * 1024;

#[derive(Clone)]
pub struct SshSessionManager {
    connector: SshConnector,
    sessions: Arc<RwLock<HashMap<String, SessionEntry>>>,
}

impl SshSessionManager {
    pub fn new(connector: SshConnector) -> Self {
        Self {
            connector,
            sessions: Arc::new(RwLock::new(HashMap::new())),
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
        let (control_sender, control_receiver) = mpsc::channel(CONTROL_QUEUE_CAPACITY);
        let (host_key_sender, host_key_receiver) = mpsc::channel(HOST_KEY_QUEUE_CAPACITY);
        let (cancellation_sender, cancellation_receiver) = watch::channel(false);
        let entry = SessionEntry {
            snapshot: snapshot.clone(),
            controls: control_sender,
            host_key_decisions: host_key_sender,
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
        let sessions = self.sessions.clone();
        tauri::async_runtime::spawn(async move {
            let result = connector
                .run(
                    request,
                    snapshot.clone(),
                    control_receiver,
                    host_key_receiver,
                    cancellation_receiver,
                    events.clone(),
                )
                .await;

            let final_snapshot = finish_session(&snapshot, result).await;
            let _ = events.send(SessionEvent::Snapshot(final_snapshot)).await;
            sessions.write().await.remove(&session_id);
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

    pub async fn close(&self, session_id: &str) -> Result<(), SessionManagerError> {
        let entry = self.entry(session_id).await?;
        let closing_snapshot = {
            let mut snapshot = entry.snapshot.write().await;
            if snapshot.state.is_terminal() || snapshot.state == SessionState::Closing {
                return Ok(());
            }
            snapshot.state = SessionState::Closing;
            snapshot.host_key_challenge = None;
            snapshot.clone()
        };

        let _ = entry
            .events
            .send(SessionEvent::Snapshot(closing_snapshot))
            .await;
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
        for session_id in session_ids {
            let _ = self.close(&session_id).await;
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

    async fn entry(&self, session_id: &str) -> Result<SessionEntry, SessionManagerError> {
        self.sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or(SessionManagerError::NotFound)
    }
}

#[derive(Clone)]
struct SessionEntry {
    snapshot: SharedSessionSnapshot,
    controls: mpsc::Sender<SessionControl>,
    host_key_decisions: mpsc::Sender<HostKeyDecision>,
    cancellation: watch::Sender<bool>,
    events: mpsc::Sender<SessionEvent>,
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
}

impl From<SessionValidationError> for SessionManagerError {
    fn from(error: SessionValidationError) -> Self {
        Self::InvalidInput {
            field: error.field,
            message: error.message,
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
        }
    }
}

impl std::error::Error for SessionManagerError {}
