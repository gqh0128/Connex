use serde::{Deserialize, Serialize};

use crate::domain::connections::AuthenticationMethod;
use crate::domain::ssh_config::{
    SshConfigCandidateStatus, SshConfigConflictStrategy, SshConfigImportResult, SshConfigPreview,
    SshConfigPreviewItem,
};
use crate::models::connections::AuthenticationMethodDto;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SshConfigConflictStrategyDto {
    Overwrite,
    Skip,
    KeepBoth,
}

impl From<SshConfigConflictStrategyDto> for SshConfigConflictStrategy {
    fn from(strategy: SshConfigConflictStrategyDto) -> Self {
        match strategy {
            SshConfigConflictStrategyDto::Overwrite => Self::Overwrite,
            SshConfigConflictStrategyDto::Skip => Self::Skip,
            SshConfigConflictStrategyDto::KeepBoth => Self::KeepBoth,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSshConfigInput {
    pub fingerprint: String,
    pub selected_keys: Vec<String>,
    pub conflict_strategy: SshConfigConflictStrategyDto,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigPreviewDto {
    pub source_path: String,
    pub fingerprint: String,
    pub items: Vec<SshConfigPreviewItemDto>,
    pub warnings: Vec<String>,
}

impl From<SshConfigPreview> for SshConfigPreviewDto {
    fn from(preview: SshConfigPreview) -> Self {
        Self {
            source_path: preview.source_path,
            fingerprint: preview.fingerprint,
            items: preview.items.into_iter().map(Into::into).collect(),
            warnings: preview.warnings,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SshConfigCandidateStatusDto {
    Ready,
    Conflict,
    Skipped,
}

impl From<SshConfigCandidateStatus> for SshConfigCandidateStatusDto {
    fn from(status: SshConfigCandidateStatus) -> Self {
        match status {
            SshConfigCandidateStatus::Ready => Self::Ready,
            SshConfigCandidateStatus::Conflict => Self::Conflict,
            SshConfigCandidateStatus::Skipped => Self::Skipped,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigPreviewItemDto {
    pub key: String,
    pub alias: String,
    pub host: String,
    pub port: u32,
    pub username: String,
    pub authentication_method: AuthenticationMethodDto,
    pub private_key_path: Option<String>,
    pub source_path: String,
    pub line_number: usize,
    pub status: SshConfigCandidateStatusDto,
    pub existing_connection_id: Option<String>,
    pub reason: Option<String>,
    pub warnings: Vec<String>,
}

impl From<SshConfigPreviewItem> for SshConfigPreviewItemDto {
    fn from(item: SshConfigPreviewItem) -> Self {
        let authentication_method = if item.candidate.private_key_path.is_some() {
            AuthenticationMethod::PrivateKey
        } else {
            AuthenticationMethod::Agent
        };
        Self {
            key: item.candidate.key,
            alias: item.candidate.alias,
            host: item.candidate.host,
            port: item.candidate.port,
            username: item.candidate.username,
            authentication_method: authentication_method.into(),
            private_key_path: item.candidate.private_key_path,
            source_path: item.candidate.source_path,
            line_number: item.candidate.line_number,
            status: item.status.into(),
            existing_connection_id: item.existing_connection_id,
            reason: item.reason,
            warnings: item.candidate.warnings,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigImportResultDto {
    pub imported_count: usize,
    pub overwritten_count: usize,
    pub skipped_count: usize,
    pub duplicated_count: usize,
}

impl From<SshConfigImportResult> for SshConfigImportResultDto {
    fn from(result: SshConfigImportResult) -> Self {
        Self {
            imported_count: result.imported_count,
            overwritten_count: result.overwritten_count,
            skipped_count: result.skipped_count,
            duplicated_count: result.duplicated_count,
        }
    }
}
