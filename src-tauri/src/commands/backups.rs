use tauri::State;

use crate::models::backups::{
    BackupExportResultDto, BackupImportResultDto, BackupPreviewDto, ExportConnectionBackupInput,
    ImportConnectionBackupInput, InspectConnectionBackupInput,
};
use crate::models::error::CommandError;
use crate::services::backups::ConnectionBackupService;

#[tauri::command]
pub async fn export_connection_backup(
    input: ExportConnectionBackupInput,
    service: State<'_, ConnectionBackupService>,
) -> Result<BackupExportResultDto, CommandError> {
    let (path, password, include_credentials) = input.into_parts();
    service
        .export(path, password, include_credentials)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn inspect_connection_backup(
    input: InspectConnectionBackupInput,
    service: State<'_, ConnectionBackupService>,
) -> Result<BackupPreviewDto, CommandError> {
    let (path, password) = input.into_parts();
    service
        .inspect(path, password)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn import_connection_backup(
    input: ImportConnectionBackupInput,
    service: State<'_, ConnectionBackupService>,
) -> Result<BackupImportResultDto, CommandError> {
    let (path, password, conflict_strategy) = input.into_parts();
    service
        .import(path, password, conflict_strategy)
        .await
        .map(Into::into)
        .map_err(Into::into)
}
