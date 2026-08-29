use tauri::State;

use crate::infrastructure::app_settings::AppSettingsRepository;
use crate::models::app::{AppInfo, AppPreferences, UpdateAppPreferencesInput};
use crate::models::error::CommandError;

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: env!("CARGO_PKG_NAME"),
        version: env!("CARGO_PKG_VERSION"),
    }
}

#[tauri::command]
pub async fn get_app_preferences(
    repository: State<'_, AppSettingsRepository>,
) -> Result<AppPreferences, CommandError> {
    repository
        .confirm_before_exit()
        .await
        .map(|confirm_before_exit| AppPreferences {
            confirm_before_exit,
        })
        .map_err(Into::into)
}

#[tauri::command]
pub async fn update_app_preferences(
    input: UpdateAppPreferencesInput,
    repository: State<'_, AppSettingsRepository>,
) -> Result<AppPreferences, CommandError> {
    repository
        .set_confirm_before_exit(input.confirm_before_exit)
        .await
        .map(|()| AppPreferences {
            confirm_before_exit: input.confirm_before_exit,
        })
        .map_err(Into::into)
}
