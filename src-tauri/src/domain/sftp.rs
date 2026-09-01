use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, Ordering};

const TRANSFER_PHASE_RUNNING: u8 = 0;
const TRANSFER_PHASE_CANCEL_REQUESTED: u8 = 1;
const TRANSFER_PHASE_COMMITTING: u8 = 2;
const TRANSFER_PHASE_COMPLETED: u8 = 3;

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
pub enum RemoteFileTransferCancelStatus {
    Accepted,
    TooLate,
    NotFound,
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

    pub fn request_cancellation(&self) -> RemoteFileTransferCancelStatus {
        loop {
            match self.phase.load(Ordering::Acquire) {
                TRANSFER_PHASE_RUNNING => {
                    if self
                        .phase
                        .compare_exchange(
                            TRANSFER_PHASE_RUNNING,
                            TRANSFER_PHASE_CANCEL_REQUESTED,
                            Ordering::AcqRel,
                            Ordering::Acquire,
                        )
                        .is_ok()
                    {
                        return RemoteFileTransferCancelStatus::Accepted;
                    }
                }
                TRANSFER_PHASE_CANCEL_REQUESTED => {
                    return RemoteFileTransferCancelStatus::Accepted;
                }
                TRANSFER_PHASE_COMMITTING | TRANSFER_PHASE_COMPLETED => {
                    return RemoteFileTransferCancelStatus::TooLate;
                }
                _ => return RemoteFileTransferCancelStatus::TooLate,
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

    pub fn finish(&self) -> bool {
        loop {
            let phase = self.phase.load(Ordering::Acquire);
            let was_cancelled = phase == TRANSFER_PHASE_CANCEL_REQUESTED;
            if phase == TRANSFER_PHASE_COMPLETED {
                return false;
            }
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
                return was_cancelled;
            }
        }
    }
}

impl Default for RemoteFileTransferLifecycle {
    fn default() -> Self {
        Self::new()
    }
}
