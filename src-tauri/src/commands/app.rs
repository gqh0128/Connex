use tauri::State;

use crate::infrastructure::app_settings::{AppSettingsRepository, StoredAppPreferences};
use crate::models::app::{AppInfo, AppPreferences, UpdateAppPreferencesInput};
use crate::models::error::CommandError;

const TERMINAL_FONT_SIZE_MIN: i64 = 9;
const TERMINAL_FONT_SIZE_MAX: i64 = 32;
const TERMINAL_FONT_WEIGHT_MIN: i64 = 100;
const TERMINAL_FONT_WEIGHT_MAX: i64 = 800;
const TERMINAL_FONT_WEIGHT_STEP: i64 = 100;
const TERMINAL_LINE_HEIGHT_MIN: f64 = 1.0;
const TERMINAL_LINE_HEIGHT_MAX: f64 = 2.0;
const INTERFACE_SCALE_PERCENT_MIN: i64 = 75;
const INTERFACE_SCALE_PERCENT_MAX: i64 = 175;
const INTERFACE_SCALE_PERCENT_STEP: i64 = 5;
const COLOR_SCHEME_IDS: [&str; 6] = [
    "pine",
    "business-blue",
    "graphite",
    "deep-teal",
    "indigo",
    "warm-stone",
];

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
            color_scheme_id: preferences.color_scheme_id,
            interface_scale_percent: preferences.interface_scale_percent,
            terminal_semantic_highlighting_enabled: preferences
                .terminal_semantic_highlighting_enabled,
            terminal_font_id: preferences.terminal_font_id,
            terminal_font_weight: preferences.terminal_font_weight,
            terminal_font_size: preferences.terminal_font_size,
            terminal_line_height: preferences.terminal_line_height,
            terminal_font_size_shortcuts_enabled: preferences.terminal_font_size_shortcuts_enabled,
        })
        .map_err(Into::into)
}

#[tauri::command]
pub async fn update_app_preferences(
    input: UpdateAppPreferencesInput,
    repository: State<'_, AppSettingsRepository>,
) -> Result<AppPreferences, CommandError> {
    if !COLOR_SCHEME_IDS.contains(&input.color_scheme_id.as_str()) {
        return Err(CommandError {
            code: "invalid_color_scheme",
            message: "请选择 Connex 支持的全局配色方案。",
            field: Some("colorSchemeId"),
        });
    }
    if !(INTERFACE_SCALE_PERCENT_MIN..=INTERFACE_SCALE_PERCENT_MAX)
        .contains(&input.interface_scale_percent)
        || input.interface_scale_percent % INTERFACE_SCALE_PERCENT_STEP != 0
    {
        return Err(CommandError {
            code: "invalid_interface_scale",
            message: "请选择 Connex 支持的界面缩放比例。",
            field: Some("interfaceScalePercent"),
        });
    }
    if !(TERMINAL_FONT_WEIGHT_MIN..=TERMINAL_FONT_WEIGHT_MAX).contains(&input.terminal_font_weight)
        || input.terminal_font_weight % TERMINAL_FONT_WEIGHT_STEP != 0
    {
        return Err(CommandError {
            code: "invalid_terminal_font_weight",
            message: "终端字重必须是 100 到 800 之间的整百数值。",
            field: Some("terminalFontWeight"),
        });
    }
    if !(TERMINAL_FONT_SIZE_MIN..=TERMINAL_FONT_SIZE_MAX).contains(&input.terminal_font_size) {
        return Err(CommandError {
            code: "invalid_terminal_font_size",
            message: "终端字号必须在 9 到 32 之间。",
            field: Some("terminalFontSize"),
        });
    }
    if !input.terminal_line_height.is_finite()
        || !(TERMINAL_LINE_HEIGHT_MIN..=TERMINAL_LINE_HEIGHT_MAX)
            .contains(&input.terminal_line_height)
    {
        return Err(CommandError {
            code: "invalid_terminal_line_height",
            message: "终端行距必须在 1.00 到 2.00 之间。",
            field: Some("terminalLineHeight"),
        });
    }

    repository
        .set_preferences(StoredAppPreferences {
            confirm_before_exit: input.confirm_before_exit,
            color_scheme_id: input.color_scheme_id.clone(),
            interface_scale_percent: input.interface_scale_percent,
            terminal_semantic_highlighting_enabled: input.terminal_semantic_highlighting_enabled,
            terminal_font_id: input.terminal_font_id.clone(),
            terminal_font_weight: input.terminal_font_weight,
            terminal_font_size: input.terminal_font_size,
            terminal_line_height: input.terminal_line_height,
            terminal_font_size_shortcuts_enabled: input.terminal_font_size_shortcuts_enabled,
        })
        .await
        .map(|()| AppPreferences {
            confirm_before_exit: input.confirm_before_exit,
            color_scheme_id: input.color_scheme_id,
            interface_scale_percent: input.interface_scale_percent,
            terminal_semantic_highlighting_enabled: input.terminal_semantic_highlighting_enabled,
            terminal_font_id: input.terminal_font_id,
            terminal_font_weight: input.terminal_font_weight,
            terminal_font_size: input.terminal_font_size,
            terminal_line_height: input.terminal_line_height,
            terminal_font_size_shortcuts_enabled: input.terminal_font_size_shortcuts_enabled,
        })
        .map_err(Into::into)
}
