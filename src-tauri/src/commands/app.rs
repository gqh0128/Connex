use tauri::State;

use crate::infrastructure::app_settings::AppSettingsRepository;
use crate::models::app::{AppInfo, AppPreferences, UpdateAppPreferencesInput};
use crate::models::error::CommandError;

const TERMINAL_FONT_SIZE_MIN: i64 = 9;
const TERMINAL_FONT_SIZE_MAX: i64 = 32;

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
        .preferences()
        .await
        .map(|preferences| AppPreferences {
            confirm_before_exit: preferences.confirm_before_exit,
            terminal_semantic_highlighting_enabled: preferences
                .terminal_semantic_highlighting_enabled,
            terminal_font_id: preferences.terminal_font_id,
            terminal_font_size: preferences.terminal_font_size,
            terminal_font_size_shortcuts_enabled: preferences.terminal_font_size_shortcuts_enabled,
        })
        .map_err(Into::into)
}

#[tauri::command]
pub async fn update_app_preferences(
    input: UpdateAppPreferencesInput,
    repository: State<'_, AppSettingsRepository>,
) -> Result<AppPreferences, CommandError> {
    if !(TERMINAL_FONT_SIZE_MIN..=TERMINAL_FONT_SIZE_MAX).contains(&input.terminal_font_size) {
        return Err(CommandError {
            code: "invalid_terminal_font_size",
            message: "终端字号必须在 9 到 32 之间。",
            field: Some("terminalFontSize"),
        });
    }

    repository
        .set_preferences(
            input.confirm_before_exit,
            input.terminal_semantic_highlighting_enabled,
            input.terminal_font_id.clone(),
            input.terminal_font_size,
            input.terminal_font_size_shortcuts_enabled,
        )
        .await
        .map(|()| AppPreferences {
            confirm_before_exit: input.confirm_before_exit,
            terminal_semantic_highlighting_enabled: input.terminal_semantic_highlighting_enabled,
            terminal_font_id: input.terminal_font_id,
            terminal_font_size: input.terminal_font_size,
            terminal_font_size_shortcuts_enabled: input.terminal_font_size_shortcuts_enabled,
        })
        .map_err(Into::into)
}
