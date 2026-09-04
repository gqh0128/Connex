use crate::domain::connections::{AuthenticationMethod, ConnectionDraft};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SshConfigConflictStrategy {
    Overwrite,
    Skip,
    KeepBoth,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SshConfigCandidateStatus {
    Ready,
    Conflict,
    Skipped,
}

#[derive(Clone, Debug)]
pub struct ParsedSshConfigCandidate {
    pub key: String,
    pub alias: String,
    pub host: String,
    pub port: u32,
    pub username: String,
    pub private_key_path: Option<String>,
    pub source_path: String,
    pub line_number: usize,
    pub warnings: Vec<String>,
    pub skipped_reason: Option<String>,
}

impl ParsedSshConfigCandidate {
    pub fn authentication_method(&self) -> AuthenticationMethod {
        if self.private_key_path.is_some() {
            AuthenticationMethod::PrivateKey
        } else {
            AuthenticationMethod::Password
        }
    }
}

#[derive(Clone, Debug)]
pub struct ParsedSshConfig {
    pub source_path: String,
    pub fingerprint: String,
    pub candidates: Vec<ParsedSshConfigCandidate>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct SshConfigPreviewItem {
    pub candidate: ParsedSshConfigCandidate,
    pub status: SshConfigCandidateStatus,
    pub existing_connection_id: Option<String>,
    pub reason: Option<String>,
}

#[derive(Clone, Debug)]
pub struct SshConfigPreview {
    pub source_path: String,
    pub fingerprint: String,
    pub items: Vec<SshConfigPreviewItem>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug)]
pub enum ConnectionImportMutation {
    Create { id: String, draft: ConnectionDraft },
    Overwrite { id: String, draft: ConnectionDraft },
}

#[derive(Clone, Debug, Default)]
pub struct SshConfigImportResult {
    pub imported_count: usize,
    pub overwritten_count: usize,
    pub skipped_count: usize,
    pub duplicated_count: usize,
}
