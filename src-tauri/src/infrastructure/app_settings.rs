use std::fmt;

use tokio_rusqlite::Connection;
use tokio_rusqlite::rusqlite::params;

use crate::infrastructure::database::Database;

pub struct StoredAppPreferences {
    pub confirm_before_exit: bool,
    pub color_scheme_id: String,
    pub interface_scale_percent: i64,
    pub terminal_semantic_highlighting_enabled: bool,
    pub terminal_font_id: String,
    pub terminal_font_weight: i64,
    pub terminal_font_size: i64,
    pub terminal_line_height: f64,
    pub terminal_font_size_shortcuts_enabled: bool,
}

#[derive(Clone)]
pub struct AppSettingsRepository {
    connection: Connection,
}

impl AppSettingsRepository {
    pub fn new(database: Database) -> Self {
        Self {
            connection: database.connection(),
        }
    }

    pub async fn preferences(&self) -> Result<StoredAppPreferences, AppSettingsRepositoryError> {
        self.connection
            .call(
                |database| -> tokio_rusqlite::rusqlite::Result<StoredAppPreferences> {
                    database.query_row(
                        "SELECT app.confirm_before_exit, appearance.color_scheme_id, \
                         appearance.interface_scale_percent, \
                         terminal_semantic_highlighting_enabled, terminal_font_id, \
                         terminal_font_weight, terminal_font_size, \
                         terminal_line_height, \
                         terminal_font_size_shortcuts_enabled \
                     FROM app_settings AS app \
                     CROSS JOIN app_appearance_settings AS appearance \
                     WHERE app.id = 1 AND appearance.id = 1",
                        [],
                        |row| {
                            Ok(StoredAppPreferences {
                                confirm_before_exit: row.get(0)?,
                                color_scheme_id: row.get(1)?,
                                interface_scale_percent: row.get(2)?,
                                terminal_semantic_highlighting_enabled: row.get(3)?,
                                terminal_font_id: row.get(4)?,
                                terminal_font_weight: row.get(5)?,
                                terminal_font_size: row.get(6)?,
                                terminal_line_height: row.get(7)?,
                                terminal_font_size_shortcuts_enabled: row.get(8)?,
                            })
                        },
                    )
                },
            )
            .await
            .map_err(|_| AppSettingsRepositoryError::Storage)
    }

    pub async fn set_preferences(
        &self,
        preferences: StoredAppPreferences,
    ) -> Result<(), AppSettingsRepositoryError> {
        let (app_settings_changed, appearance_settings_changed) = self
            .connection
            .call(
                move |database| -> tokio_rusqlite::rusqlite::Result<(usize, usize)> {
                    let transaction = database.transaction()?;
                    let app_settings_changed = transaction.execute(
                        "UPDATE app_settings SET \
                         confirm_before_exit = ?1, \
                         terminal_semantic_highlighting_enabled = ?2, \
                         terminal_font_id = ?3, \
                         terminal_font_weight = ?4, \
                         terminal_font_size = ?5, \
                         terminal_line_height = ?6, \
                         terminal_font_size_shortcuts_enabled = ?7, \
                         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
                         WHERE id = 1",
                        params![
                            preferences.confirm_before_exit,
                            preferences.terminal_semantic_highlighting_enabled,
                            preferences.terminal_font_id,
                            preferences.terminal_font_weight,
                            preferences.terminal_font_size,
                            preferences.terminal_line_height,
                            preferences.terminal_font_size_shortcuts_enabled,
                        ],
                    )?;
                    let appearance_settings_changed = transaction.execute(
                        "UPDATE app_appearance_settings SET \
                         color_scheme_id = ?1, \
                         interface_scale_percent = ?2, \
                         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
                         WHERE id = 1",
                        params![
                            preferences.color_scheme_id,
                            preferences.interface_scale_percent,
                        ],
                    )?;
                    transaction.commit()?;

                    Ok((app_settings_changed, appearance_settings_changed))
                },
            )
            .await
            .map_err(|_| AppSettingsRepositoryError::Storage)?;

        if app_settings_changed != 1 || appearance_settings_changed != 1 {
            return Err(AppSettingsRepositoryError::Storage);
        }

        Ok(())
    }
}

#[derive(Debug)]
pub enum AppSettingsRepositoryError {
    Storage,
}

impl fmt::Display for AppSettingsRepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("application settings storage is unavailable")
    }
}

impl std::error::Error for AppSettingsRepositoryError {}
