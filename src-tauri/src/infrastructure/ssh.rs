use std::fmt;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use russh::client;
use russh::keys::agent::AgentIdentity;
use russh::keys::agent::client::{AgentClient, AgentStream};
use russh::keys::{HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::{ChannelMsg, Disconnect};
use tokio::net::TcpStream;
use tokio::sync::{Mutex, RwLock, mpsc, oneshot, watch};
use tokio::time::timeout;

use crate::domain::known_hosts::KnownHostKey;
use crate::domain::sessions::{
    HostKeyChallenge, HostKeyDecision, SessionAuthentication, SessionControl, SessionEvent,
    SessionFailure, SessionFailureCode, SessionSnapshot, SessionState, StartSessionRequest,
    TestConnectionRequest,
};
use crate::infrastructure::known_hosts::KnownHostRepository;
use crate::infrastructure::sftp::{
    RemoteFileSession, RemoteFileSessionState, SharedRemoteFileSession,
};

const TCP_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const AUTHENTICATION_TIMEOUT: Duration = Duration::from_secs(120);
const HOST_VERIFICATION_TIMEOUT: Duration = Duration::from_secs(120);
const SFTP_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

pub type SharedSessionSnapshot = Arc<RwLock<SessionSnapshot>>;

pub struct SshSessionRuntime {
    pub snapshot: SharedSessionSnapshot,
    pub remote_files: SharedRemoteFileSession,
    pub controls: mpsc::Receiver<SessionControl>,
    pub host_key_decisions: mpsc::Receiver<HostKeyDecision>,
    pub remote_file_requests: mpsc::Receiver<oneshot::Sender<()>>,
    pub cancellation: watch::Receiver<bool>,
    pub events: mpsc::Sender<SessionEvent>,
}

#[derive(Clone)]
pub struct SshConnector {
    known_hosts: KnownHostRepository,
}

impl SshConnector {
    pub fn new(known_hosts: KnownHostRepository) -> Self {
        Self { known_hosts }
    }

    pub async fn run(
        &self,
        request: StartSessionRequest,
        runtime: SshSessionRuntime,
    ) -> Result<SshSessionEnd, SshTransportError> {
        let SshSessionRuntime {
            snapshot,
            remote_files,
            controls,
            host_key_decisions,
            remote_file_requests,
            cancellation,
            events,
        } = runtime;
        let reporter = SessionReporter::new(snapshot, events);
        let stream = connect_tcp(
            &request.profile.host,
            request.profile.port,
            cancellation.clone(),
        )
        .await?;
        let known_keys = self
            .known_hosts
            .list_for_host(&request.profile.host, request.profile.port)
            .await
            .map_err(|_| SshTransportError::KnownHostStorage)?;
        let accepted_host_key = Arc::new(Mutex::new(None));
        let handler = HostKeyHandler {
            host: request.profile.host.clone(),
            port: request.profile.port,
            known_keys,
            accepted_host_key: accepted_host_key.clone(),
            decisions: host_key_decisions,
            cancellation: cancellation.clone(),
            reporter: reporter.clone(),
        };
        let config = Arc::new(client::Config {
            keepalive_interval: Some(Duration::from_secs(15)),
            keepalive_max: 3,
            nodelay: true,
            ..Default::default()
        });
        let mut session = cancellable(
            cancellation.clone(),
            client::connect_stream(config, stream, handler),
        )
        .await??;

        if let Some(key) = accepted_host_key.lock().await.take() {
            self.known_hosts
                .save(key)
                .await
                .map_err(|_| SshTransportError::KnownHostStorage)?;
        }

        reporter
            .transition(SessionState::Authenticating, None)
            .await?;
        let authenticated = timeout(
            AUTHENTICATION_TIMEOUT,
            cancellable(
                cancellation.clone(),
                authenticate(
                    &mut session,
                    &request.profile.username,
                    request.authentication,
                ),
            ),
        )
        .await
        .map_err(|_| SshTransportError::AuthenticationTimedOut)???;
        if !authenticated {
            return Err(SshTransportError::AuthenticationFailed);
        }

        let mut channel =
            cancellable(cancellation.clone(), session.channel_open_session()).await??;
        cancellable(
            cancellation.clone(),
            channel.request_pty(
                true,
                "xterm-256color",
                request.terminal_size.columns,
                request.terminal_size.rows,
                request.terminal_size.pixel_width,
                request.terminal_size.pixel_height,
                &[],
            ),
        )
        .await??;
        cancellable(cancellation.clone(), channel.request_shell(true)).await??;
        reporter.transition(SessionState::Connected, None).await?;

        tokio::select! {
            shell_result = run_shell_loop(
                &session,
                &mut channel,
                controls,
                cancellation.clone(),
                reporter,
            ) => shell_result,
            _ = run_remote_file_loop(
                &session,
                remote_files,
                remote_file_requests,
                cancellation,
            ) => {
                close_remote_session(&session, &channel).await;
                Ok(SshSessionEnd::Closed)
            }
        }
    }

    pub async fn test(&self, request: TestConnectionRequest) -> Result<(), SshTransportError> {
        let (_cancellation_sender, cancellation) = watch::channel(false);
        let stream = connect_tcp(&request.host, request.port, cancellation).await?;
        let known_keys = self
            .known_hosts
            .list_for_host(&request.host, request.port)
            .await
            .map_err(|_| SshTransportError::KnownHostStorage)?;
        let accepted_host_key = request.accepted_host_key.clone();
        let handler = TestHostKeyHandler {
            known_keys,
            accepted_host_key: accepted_host_key.clone(),
        };
        let config = Arc::new(client::Config {
            nodelay: true,
            ..Default::default()
        });
        let mut session = timeout(
            TCP_CONNECT_TIMEOUT,
            client::connect_stream(config, stream, handler),
        )
        .await
        .map_err(|_| SshTransportError::NetworkUnavailable)??;
        let authenticated = timeout(
            AUTHENTICATION_TIMEOUT,
            authenticate(&mut session, &request.username, request.authentication),
        )
        .await
        .map_err(|_| SshTransportError::AuthenticationTimedOut)??;

        if !authenticated {
            return Err(SshTransportError::AuthenticationFailed);
        }

        if request.should_remember_host_key
            && let Some(challenge) = accepted_host_key
        {
            self.known_hosts
                .save(KnownHostKey {
                    host: request.host,
                    port: request.port,
                    key_algorithm: challenge.key_algorithm,
                    fingerprint_sha256: challenge.fingerprint_sha256,
                })
                .await
                .map_err(|_| SshTransportError::KnownHostStorage)?;
        }

        let _ = session
            .disconnect(
                Disconnect::ByApplication,
                "Connex connection test completed",
                "",
            )
            .await;
        Ok(())
    }
}

async fn run_remote_file_loop(
    session: &client::Handle<HostKeyHandler>,
    remote_files: SharedRemoteFileSession,
    mut requests: mpsc::Receiver<oneshot::Sender<()>>,
    mut cancellation: watch::Receiver<bool>,
) {
    loop {
        tokio::select! {
            _ = cancellation.changed() => return,
            request = requests.recv() => {
                let Some(completion) = request else {
                    return;
                };
                let is_ready = matches!(
                    &*remote_files.read().await,
                    RemoteFileSessionState::Ready(_)
                );

                let should_stop = if is_ready {
                    false
                } else {
                    *remote_files.write().await = RemoteFileSessionState::Connecting;
                    let (next_state, should_stop) =
                        match connect_remote_files(session, cancellation.clone()).await {
                            Ok(next_state) => (next_state, false),
                            Err(_) => (RemoteFileSessionState::Unavailable, true),
                        };
                    *remote_files.write().await = next_state;
                    should_stop
                };

                let _ = completion.send(());
                if should_stop {
                    return;
                }
            }
        }
    }
}

async fn connect_remote_files(
    session: &client::Handle<HostKeyHandler>,
    mut cancellation: watch::Receiver<bool>,
) -> Result<RemoteFileSessionState, SshTransportError> {
    let result = tokio::select! {
        _ = cancellation.changed() => return Err(SshTransportError::Cancelled),
        result = timeout(SFTP_CONNECT_TIMEOUT, open_remote_file_session(session)) => result,
    };

    Ok(match result {
        Ok(Ok(remote_files)) => RemoteFileSessionState::Ready(remote_files),
        Ok(Err(())) | Err(_) => RemoteFileSessionState::Unavailable,
    })
}

async fn open_remote_file_session(
    session: &client::Handle<HostKeyHandler>,
) -> Result<RemoteFileSession, ()> {
    let channel = session.channel_open_session().await.map_err(|_| ())?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|_| ())?;
    RemoteFileSession::connect(channel.into_stream())
        .await
        .map_err(|_| ())
}

async fn connect_tcp(
    host: &str,
    port: u16,
    mut cancellation: watch::Receiver<bool>,
) -> Result<TcpStream, SshTransportError> {
    if *cancellation.borrow() {
        return Err(SshTransportError::Cancelled);
    }

    tokio::select! {
        _ = cancellation.changed() => Err(SshTransportError::Cancelled),
        result = timeout(TCP_CONNECT_TIMEOUT, TcpStream::connect((host, port))) => {
            result
                .map_err(|_| SshTransportError::NetworkUnavailable)?
                .map_err(|_| SshTransportError::NetworkUnavailable)
        }
    }
}

async fn authenticate<Handler>(
    session: &mut client::Handle<Handler>,
    username: &str,
    authentication: SessionAuthentication,
) -> Result<bool, SshTransportError>
where
    Handler: client::Handler<Error = SshTransportError>,
{
    match authentication {
        SessionAuthentication::Password(password) => session
            .authenticate_password(username, password.take())
            .await
            .map(|result| result.success())
            .map_err(SshTransportError::from),
        SessionAuthentication::PrivateKey { path, passphrase } => {
            let key = load_private_key(path, passphrase).await?;
            let hash_algorithm = if key.algorithm().is_rsa() {
                session.best_supported_rsa_hash().await?.flatten()
            } else {
                None
            };
            session
                .authenticate_publickey(
                    username,
                    PrivateKeyWithHashAlg::new(Arc::new(key), hash_algorithm),
                )
                .await
                .map(|result| result.success())
                .map_err(SshTransportError::from)
        }
        SessionAuthentication::Agent => authenticate_with_agent(session, username).await,
    }
}

async fn load_private_key(
    path: String,
    passphrase: Option<crate::domain::credentials::SecretString>,
) -> Result<russh::keys::PrivateKey, SshTransportError> {
    let path = PathBuf::from(path);
    tokio::task::spawn_blocking(move || {
        russh::keys::load_secret_key(path, passphrase.as_ref().map(|value| value.expose()))
    })
    .await
    .map_err(|_| SshTransportError::PrivateKeyUnavailable)?
    .map_err(|_| SshTransportError::PrivateKeyUnavailable)
}

#[cfg(unix)]
async fn authenticate_with_agent<Handler>(
    session: &mut client::Handle<Handler>,
    username: &str,
) -> Result<bool, SshTransportError>
where
    Handler: client::Handler<Error = SshTransportError>,
{
    let mut agent = AgentClient::connect_env()
        .await
        .map_err(|_| SshTransportError::AgentUnavailable)?;
    authenticate_agent_identities(session, username, &mut agent).await
}

#[cfg(windows)]
async fn authenticate_with_agent<Handler>(
    session: &mut client::Handle<Handler>,
    username: &str,
) -> Result<bool, SshTransportError>
where
    Handler: client::Handler<Error = SshTransportError>,
{
    if let Ok(mut agent) = AgentClient::connect_named_pipe(r"\\.\pipe\openssh-ssh-agent").await
        && authenticate_agent_identities(session, username, &mut agent).await?
    {
        return Ok(true);
    }

    let mut pageant = AgentClient::connect_pageant()
        .await
        .map_err(|_| SshTransportError::AgentUnavailable)?;
    authenticate_agent_identities(session, username, &mut pageant).await
}

async fn authenticate_agent_identities<Handler, S>(
    session: &mut client::Handle<Handler>,
    username: &str,
    agent: &mut AgentClient<S>,
) -> Result<bool, SshTransportError>
where
    Handler: client::Handler<Error = SshTransportError>,
    S: AgentStream + Send + Unpin,
{
    let identities = agent
        .request_identities()
        .await
        .map_err(|_| SshTransportError::AgentUnavailable)?;
    if identities.is_empty() {
        return Err(SshTransportError::AgentUnavailable);
    }

    for identity in identities {
        let hash_algorithm = if identity.public_key().algorithm().is_rsa() {
            session.best_supported_rsa_hash().await?.flatten()
        } else {
            None
        };
        let result = match identity {
            AgentIdentity::PublicKey { key, .. } => {
                session
                    .authenticate_publickey_with(username, key, hash_algorithm, agent)
                    .await
            }
            AgentIdentity::Certificate { certificate, .. } => {
                session
                    .authenticate_certificate_with(username, certificate, hash_algorithm, agent)
                    .await
            }
        }
        .map_err(|_| SshTransportError::AgentUnavailable)?;

        if result.success() {
            return Ok(true);
        }
    }

    Ok(false)
}

async fn run_shell_loop(
    session: &client::Handle<HostKeyHandler>,
    channel: &mut russh::Channel<client::Msg>,
    mut controls: mpsc::Receiver<SessionControl>,
    mut cancellation: watch::Receiver<bool>,
    reporter: SessionReporter,
) -> Result<SshSessionEnd, SshTransportError> {
    loop {
        tokio::select! {
            _ = cancellation.changed() => {
                close_remote_session(session, channel).await;
                return Ok(SshSessionEnd::Closed);
            }
            control = controls.recv() => {
                match control {
                    Some(SessionControl::Write(data)) => channel.data_bytes(data).await?,
                    Some(SessionControl::Resize(size)) => {
                        channel
                            .window_change(
                                size.columns,
                                size.rows,
                                size.pixel_width,
                                size.pixel_height,
                            )
                            .await?;
                    }
                    Some(SessionControl::Keepalive) => session.send_keepalive(true).await?,
                    Some(SessionControl::Close) | None => {
                        close_remote_session(session, channel).await;
                        return Ok(SshSessionEnd::Closed);
                    }
                }
            }
            message = channel.wait() => {
                match message {
                    Some(ChannelMsg::Data { data })
                    | Some(ChannelMsg::ExtendedData { data, .. }) => {
                        reporter.output(data.to_vec()).await?;
                    }
                    Some(ChannelMsg::ExitStatus { exit_status }) => {
                        reporter.set_exit_status(exit_status).await?;
                    }
                    Some(ChannelMsg::Failure) => return Err(SshTransportError::ShellUnavailable),
                    Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                        return Ok(SshSessionEnd::Disconnected);
                    }
                    _ => {}
                }
            }
        }
    }
}

async fn close_remote_session(
    session: &client::Handle<HostKeyHandler>,
    channel: &russh::Channel<client::Msg>,
) {
    let _ = channel.eof().await;
    let _ = channel.close().await;
    let _ = session
        .disconnect(Disconnect::ByApplication, "Connex session closed", "")
        .await;
}

async fn cancellable<T, E, F>(
    mut cancellation: watch::Receiver<bool>,
    future: F,
) -> Result<Result<T, E>, SshTransportError>
where
    F: Future<Output = Result<T, E>>,
{
    if *cancellation.borrow() {
        return Err(SshTransportError::Cancelled);
    }

    tokio::select! {
        _ = cancellation.changed() => Err(SshTransportError::Cancelled),
        result = future => Ok(result),
    }
}

#[derive(Clone)]
struct SessionReporter {
    snapshot: SharedSessionSnapshot,
    events: mpsc::Sender<SessionEvent>,
}

impl SessionReporter {
    fn new(snapshot: SharedSessionSnapshot, events: mpsc::Sender<SessionEvent>) -> Self {
        Self { snapshot, events }
    }

    async fn transition(
        &self,
        state: SessionState,
        challenge: Option<HostKeyChallenge>,
    ) -> Result<(), SshTransportError> {
        let snapshot = {
            let mut snapshot = self.snapshot.write().await;
            snapshot.state = state;
            snapshot.host_key_challenge = challenge;
            snapshot.failure = None;
            snapshot.clone()
        };
        self.events
            .send(SessionEvent::Snapshot(snapshot))
            .await
            .map_err(|_| SshTransportError::EventSinkClosed)
    }

    async fn set_exit_status(&self, exit_status: u32) -> Result<(), SshTransportError> {
        let snapshot = {
            let mut snapshot = self.snapshot.write().await;
            snapshot.exit_status = Some(exit_status);
            snapshot.clone()
        };
        self.events
            .send(SessionEvent::Snapshot(snapshot))
            .await
            .map_err(|_| SshTransportError::EventSinkClosed)
    }

    async fn output(&self, data: Vec<u8>) -> Result<(), SshTransportError> {
        self.events
            .send(SessionEvent::Output(data))
            .await
            .map_err(|_| SshTransportError::EventSinkClosed)
    }
}

struct HostKeyHandler {
    host: String,
    port: u16,
    known_keys: Vec<KnownHostKey>,
    accepted_host_key: Arc<Mutex<Option<KnownHostKey>>>,
    decisions: mpsc::Receiver<HostKeyDecision>,
    cancellation: watch::Receiver<bool>,
    reporter: SessionReporter,
}

struct TestHostKeyHandler {
    known_keys: Vec<KnownHostKey>,
    accepted_host_key: Option<HostKeyChallenge>,
}

impl client::Handler for TestHostKeyHandler {
    type Error = SshTransportError;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let public_key = server_public_key.public_key();
        let key_algorithm = public_key.algorithm().as_str().to_owned();
        let fingerprint_sha256 = public_key.fingerprint(HashAlg::Sha256).to_string();

        if let Some(known_key) = self
            .known_keys
            .iter()
            .find(|known_key| known_key.key_algorithm == key_algorithm)
        {
            if known_key.fingerprint_sha256 == fingerprint_sha256 {
                return Ok(true);
            }

            return Err(SshTransportError::HostKeyChanged {
                expected: known_key.fingerprint_sha256.clone(),
                presented: fingerprint_sha256,
            });
        }

        if let Some(accepted_host_key) = &self.accepted_host_key {
            if accepted_host_key.key_algorithm == key_algorithm
                && accepted_host_key.fingerprint_sha256 == fingerprint_sha256
            {
                return Ok(true);
            }

            return Err(SshTransportError::HostKeyChanged {
                expected: accepted_host_key.fingerprint_sha256.clone(),
                presented: fingerprint_sha256,
            });
        }

        Err(SshTransportError::HostKeyUnknown(HostKeyChallenge {
            key_algorithm,
            fingerprint_sha256,
        }))
    }
}

impl client::Handler for HostKeyHandler {
    type Error = SshTransportError;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let public_key = server_public_key.public_key();
        let key_algorithm = public_key.algorithm().as_str().to_owned();
        let fingerprint_sha256 = public_key.fingerprint(HashAlg::Sha256).to_string();

        if let Some(known_key) = self
            .known_keys
            .iter()
            .find(|known_key| known_key.key_algorithm == key_algorithm)
        {
            if known_key.fingerprint_sha256 == fingerprint_sha256 {
                return Ok(true);
            }

            return Err(SshTransportError::HostKeyChanged {
                expected: known_key.fingerprint_sha256.clone(),
                presented: fingerprint_sha256,
            });
        }

        self.reporter
            .transition(
                SessionState::VerifyingHost,
                Some(HostKeyChallenge {
                    key_algorithm: key_algorithm.clone(),
                    fingerprint_sha256: fingerprint_sha256.clone(),
                }),
            )
            .await?;

        let decision = timeout(HOST_VERIFICATION_TIMEOUT, async {
            tokio::select! {
                _ = self.cancellation.changed() => None,
                decision = self.decisions.recv() => decision,
            }
        })
        .await
        .map_err(|_| SshTransportError::HostVerificationTimedOut)?
        .ok_or(SshTransportError::Cancelled)?;

        match decision {
            HostKeyDecision::AcceptOnce => Ok(true),
            HostKeyDecision::AcceptAndRemember => {
                *self.accepted_host_key.lock().await = Some(KnownHostKey {
                    host: self.host.clone(),
                    port: self.port,
                    key_algorithm,
                    fingerprint_sha256,
                });
                Ok(true)
            }
            HostKeyDecision::Reject => Err(SshTransportError::HostKeyRejected),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SshSessionEnd {
    Closed,
    Disconnected,
}

#[derive(Debug)]
pub enum SshTransportError {
    Russh(russh::Error),
    NetworkUnavailable,
    KnownHostStorage,
    HostKeyUnknown(HostKeyChallenge),
    HostKeyChanged { expected: String, presented: String },
    HostKeyRejected,
    HostVerificationTimedOut,
    AuthenticationTimedOut,
    AuthenticationFailed,
    AgentUnavailable,
    PrivateKeyUnavailable,
    ShellUnavailable,
    EventSinkClosed,
    Cancelled,
}

impl SshTransportError {
    pub fn failure(&self) -> SessionFailure {
        let (code, message) = match self {
            Self::NetworkUnavailable => (
                SessionFailureCode::NetworkUnavailable,
                "无法连接服务器，请检查地址、端口和网络。".to_owned(),
            ),
            Self::KnownHostStorage => (
                SessionFailureCode::Internal,
                "无法读取或保存可信主机记录。".to_owned(),
            ),
            Self::HostKeyUnknown(_) => (
                SessionFailureCode::HostVerificationFailed,
                "需要先确认服务器主机密钥指纹。".to_owned(),
            ),
            Self::HostKeyChanged {
                expected,
                presented,
            } => (
                SessionFailureCode::HostKeyChanged,
                format!(
                    "服务器主机密钥与已保存记录不一致（已保存 {expected}，当前 {presented}），连接已拒绝。"
                ),
            ),
            Self::HostKeyRejected => (
                SessionFailureCode::HostVerificationFailed,
                "已取消信任该服务器，连接没有继续。".to_owned(),
            ),
            Self::HostVerificationTimedOut => (
                SessionFailureCode::HostVerificationFailed,
                "等待确认服务器指纹超时。".to_owned(),
            ),
            Self::AuthenticationTimedOut => (
                SessionFailureCode::AuthenticationFailed,
                "SSH 认证等待超时。".to_owned(),
            ),
            Self::AuthenticationFailed => (
                SessionFailureCode::AuthenticationFailed,
                "SSH 认证失败，请检查用户名和认证信息。".to_owned(),
            ),
            Self::AgentUnavailable => (
                SessionFailureCode::AgentUnavailable,
                "SSH Agent 不可用，或其中没有服务器接受的密钥。".to_owned(),
            ),
            Self::PrivateKeyUnavailable => (
                SessionFailureCode::PrivateKeyUnavailable,
                "无法读取私钥，请检查文件路径和私钥口令。".to_owned(),
            ),
            Self::ShellUnavailable => (
                SessionFailureCode::ShellUnavailable,
                "服务器拒绝了终端或 Shell 请求。".to_owned(),
            ),
            Self::EventSinkClosed => (
                SessionFailureCode::ConnectionLost,
                "终端页面已经关闭。".to_owned(),
            ),
            Self::Russh(_) => (
                SessionFailureCode::ConnectionLost,
                "SSH 连接意外中断。".to_owned(),
            ),
            Self::Cancelled => (SessionFailureCode::Internal, "SSH 连接已取消。".to_owned()),
        };

        SessionFailure { code, message }
    }
}

impl From<russh::Error> for SshTransportError {
    fn from(error: russh::Error) -> Self {
        Self::Russh(error)
    }
}

impl fmt::Display for SshTransportError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Russh(error) => write!(formatter, "SSH protocol error: {error}"),
            Self::HostKeyUnknown(_) => formatter.write_str("SSH host key is not trusted"),
            Self::HostKeyChanged { .. } => formatter.write_str("SSH host key changed"),
            Self::HostKeyRejected => formatter.write_str("SSH host key rejected"),
            Self::HostVerificationTimedOut => {
                formatter.write_str("SSH host verification timed out")
            }
            Self::AuthenticationTimedOut => formatter.write_str("SSH authentication timed out"),
            Self::AuthenticationFailed => formatter.write_str("SSH authentication failed"),
            Self::AgentUnavailable => formatter.write_str("SSH agent is unavailable"),
            Self::PrivateKeyUnavailable => formatter.write_str("SSH private key is unavailable"),
            Self::ShellUnavailable => formatter.write_str("SSH shell is unavailable"),
            Self::NetworkUnavailable => formatter.write_str("SSH network is unavailable"),
            Self::KnownHostStorage => formatter.write_str("known host storage is unavailable"),
            Self::EventSinkClosed => formatter.write_str("SSH event sink is closed"),
            Self::Cancelled => formatter.write_str("SSH session was cancelled"),
        }
    }
}

impl std::error::Error for SshTransportError {}
