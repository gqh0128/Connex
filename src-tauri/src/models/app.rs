use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    pub confirm_before_exit: bool,
    pub color_scheme_id: String,
    pub terminal_semantic_highlighting_enabled: bool,
    pub terminal_font_id: String,
    pub terminal_font_weight: i64,
    pub terminal_font_size: i64,
    pub terminal_line_height: f64,
    pub terminal_font_size_shortcuts_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAppPreferencesInput {
    pub confirm_before_exit: bool,
    pub color_scheme_id: String,
    pub terminal_semantic_highlighting_enabled: bool,
    pub terminal_font_id: String,
    pub terminal_font_weight: i64,
    pub terminal_font_size: i64,
    pub terminal_line_height: f64,
    pub terminal_font_size_shortcuts_enabled: bool,
}
