use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, Ordering};

const TRANSFER_PHASE_RUNNING: u8 = 0;
const TRANSFER_PHASE_PAUSE_REQUESTED: u8 = 1;
const TRANSFER_PHASE_CANCEL_REQUESTED: u8 = 2;
const TRANSFER_PHASE_COMMITTING: u8 = 3;
const TRANSFER_PHASE_COMPLETED: u8 = 4;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RemoteFileKind {
    Directory,
    File,
    Symlink,
    Other,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemoteFileEntry {
    pub name: String,
    pub path: String,
    pub kind: RemoteFileKind,
    pub size: Option<u64>,
    pub modified_at: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemoteDirectory {
    pub path: String,
    pub entries: Vec<RemoteFileEntry>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalUploadFileMetadata {
    pub file_name: String,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalUploadFileSelection {
    pub transfer_id: String,
    pub file_name: String,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalDownloadTargetSelection {
    pub transfer_id: String,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemoteFileTransferProgress {
    pub transfer_id: String,
    pub transferred_bytes: u64,
    pub total_bytes: u64,
    pub bytes_per_second: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemoteUploadResult {
    pub remote_path: String,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemoteDownloadResult {
    pub local_path: PathBuf,
    pub total_bytes: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RemoteFileTransferControlStatus {
    Accepted,
    TooLate,
    NotFound,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RemoteFileTransferControl {
    Running,
    Pause,
    Cancel,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RemoteFileTransferFinish {
    Completed,
    Paused,
    Cancelled,
}

#[derive(Debug)]
pub struct RemoteFileTransferLifecycle {
    phase: AtomicU8,
}

impl RemoteFileTransferLifecycle {
    pub fn new() -> Self {
        Self {
            phase: AtomicU8::new(TRANSFER_PHASE_RUNNING),
        }
    }

    pub fn request_pause(&self) -> RemoteFileTransferControlStatus {
        loop {
            match self.phase.load(Ordering::Acquire) {
                TRANSFER_PHASE_RUNNING => {
                    if self
                        .phase
                        .compare_exchange(
                            TRANSFER_PHASE_RUNNING,
                            TRANSFER_PHASE_PAUSE_REQUESTED,
                            Ordering::AcqRel,
                            Ordering::Acquire,
                        )
                        .is_ok()
                    {
                        return RemoteFileTransferControlStatus::Accepted;
                    }
                }
                TRANSFER_PHASE_PAUSE_REQUESTED => {
                    return RemoteFileTransferControlStatus::Accepted;
                }
                TRANSFER_PHASE_CANCEL_REQUESTED
                | TRANSFER_PHASE_COMMITTING
                | TRANSFER_PHASE_COMPLETED => {
                    return RemoteFileTransferControlStatus::TooLate;
                }
                _ => return RemoteFileTransferControlStatus::TooLate,
            }
        }
    }

    pub fn request_cancellation(&self) -> RemoteFileTransferControlStatus {
        loop {
            match self.phase.load(Ordering::Acquire) {
                TRANSFER_PHASE_RUNNING | TRANSFER_PHASE_PAUSE_REQUESTED => {
                    let phase = self.phase.load(Ordering::Acquire);
                    if !matches!(
                        phase,
                        TRANSFER_PHASE_RUNNING | TRANSFER_PHASE_PAUSE_REQUESTED
                    ) {
                        continue;
                    }
                    if self
                        .phase
                        .compare_exchange(
                            phase,
                            TRANSFER_PHASE_CANCEL_REQUESTED,
                            Ordering::AcqRel,
                            Ordering::Acquire,
                        )
                        .is_ok()
                    {
                        return RemoteFileTransferControlStatus::Accepted;
                    }
                }
                TRANSFER_PHASE_CANCEL_REQUESTED => {
                    return RemoteFileTransferControlStatus::Accepted;
                }
                TRANSFER_PHASE_COMMITTING | TRANSFER_PHASE_COMPLETED => {
                    return RemoteFileTransferControlStatus::TooLate;
                }
                _ => return RemoteFileTransferControlStatus::TooLate,
            }
        }
    }

    pub fn begin_commit(&self) -> bool {
        self.phase
            .compare_exchange(
                TRANSFER_PHASE_RUNNING,
                TRANSFER_PHASE_COMMITTING,
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_ok()
    }

    pub fn finish(&self) -> RemoteFileTransferFinish {
        loop {
            let phase = self.phase.load(Ordering::Acquire);
            if phase == TRANSFER_PHASE_COMPLETED {
                return RemoteFileTransferFinish::Completed;
            }
            let finish = match phase {
                TRANSFER_PHASE_PAUSE_REQUESTED => RemoteFileTransferFinish::Paused,
                TRANSFER_PHASE_CANCEL_REQUESTED => RemoteFileTransferFinish::Cancelled,
                _ => RemoteFileTransferFinish::Completed,
            };
            if self
                .phase
                .compare_exchange(
                    phase,
                    TRANSFER_PHASE_COMPLETED,
                    Ordering::AcqRel,
                    Ordering::Acquire,
                )
                .is_ok()
            {
                return finish;
            }
        }
    }
}

impl Default for RemoteFileTransferLifecycle {
    fn default() -> Self {
        Self::new()
    }
}
