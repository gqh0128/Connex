use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::domain::credentials::SecretString;
use crate::services::backups::{
    BackupConflictStrategy, BackupExportResult, BackupImportResult, BackupPreview,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportConnectionBackupInput {
    pub path: PathBuf,
    pub export_password: String,
    pub include_credentials: bool,
}

impl ExportConnectionBackupInput {
    pub fn into_parts(self) -> (PathBuf, SecretString, bool) {
        (
            self.path,
            SecretString::new(self.export_password),
            self.include_credentials,
        )
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectConnectionBackupInput {
    pub path: PathBuf,
    pub export_password: String,
}

impl InspectConnectionBackupInput {
    pub fn into_parts(self) -> (PathBuf, SecretString) {
        (self.path, SecretString::new(self.export_password))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportConnectionBackupInput {
    pub path: PathBuf,
    pub export_password: String,
    pub conflict_strategy: BackupConflictStrategyDto,
}

impl ImportConnectionBackupInput {
    pub fn into_parts(self) -> (PathBuf, SecretString, BackupConflictStrategy) {
        (
            self.path,
            SecretString::new(self.export_password),
            self.conflict_strategy.into(),
        )
    }
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BackupConflictStrategyDto {
    Overwrite,
    Skip,
    KeepBoth,
}

impl From<BackupConflictStrategyDto> for BackupConflictStrategy {
    fn from(strategy: BackupConflictStrategyDto) -> Self {
        match strategy {
            BackupConflictStrategyDto::Overwrite => Self::Overwrite,
            BackupConflictStrategyDto::Skip => Self::Skip,
            BackupConflictStrategyDto::KeepBoth => Self::KeepBoth,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExportResultDto {
    pub connection_count: u32,
    pub credential_count: u32,
}

impl From<BackupExportResult> for BackupExportResultDto {
    fn from(result: BackupExportResult) -> Self {
        Self {
            connection_count: result.connection_count,
            credential_count: result.credential_count,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreviewDto {
    pub created_at_unix_ms: u64,
    pub connection_count: u32,
    pub credential_count: u32,
    pub conflict_count: u32,
    pub includes_credentials: bool,
}

impl From<BackupPreview> for BackupPreviewDto {
    fn from(preview: BackupPreview) -> Self {
        Self {
            created_at_unix_ms: preview.created_at_unix_ms,
            connection_count: preview.connection_count,
            credential_count: preview.credential_count,
            conflict_count: preview.conflict_count,
            includes_credentials: preview.includes_credentials,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupImportResultDto {
    pub imported_count: u32,
    pub overwritten_count: u32,
    pub skipped_count: u32,
    pub duplicated_count: u32,
}

impl From<BackupImportResult> for BackupImportResultDto {
    fn from(result: BackupImportResult) -> Self {
        Self {
            imported_count: result.imported_count,
            overwritten_count: result.overwritten_count,
            skipped_count: result.skipped_count,
            duplicated_count: result.duplicated_count,
        }
    }
}
