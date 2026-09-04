use tauri::State;

use crate::models::error::CommandError;
use crate::models::ssh_config::{
    ImportSshConfigInput, SshConfigImportResultDto, SshConfigPreviewDto,
};
use crate::services::ssh_config_import::SshConfigImportService;

#[tauri::command]
pub async fn preview_ssh_config_import(
    service: State<'_, SshConfigImportService>,
) -> Result<SshConfigPreviewDto, CommandError> {
    service.preview().await.map(Into::into).map_err(Into::into)
}

#[tauri::command]
pub async fn import_ssh_config(
    input: ImportSshConfigInput,
    service: State<'_, SshConfigImportService>,
) -> Result<SshConfigImportResultDto, CommandError> {
    service
        .import(
            input.fingerprint,
            input.selected_keys,
            input.conflict_strategy.into(),
        )
        .await
        .map(Into::into)
        .map_err(Into::into)
}
