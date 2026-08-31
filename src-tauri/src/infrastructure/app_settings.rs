use std::fmt;

use tokio_rusqlite::Connection;
use tokio_rusqlite::rusqlite::params;

use crate::infrastructure::database::Database;

pub struct StoredAppPreferences {
    pub confirm_before_exit: bool,
    pub terminal_semantic_highlighting_enabled: bool,
    pub terminal_font_id: String,
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
                        "SELECT confirm_before_exit, terminal_semantic_highlighting_enabled, \
                         terminal_font_id \
                     FROM app_settings WHERE id = 1",
                        [],
                        |row| {
                            Ok(StoredAppPreferences {
                                confirm_before_exit: row.get(0)?,
                                terminal_semantic_highlighting_enabled: row.get(1)?,
                                terminal_font_id: row.get(2)?,
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
        confirm_before_exit: bool,
        terminal_semantic_highlighting_enabled: bool,
        terminal_font_id: String,
    ) -> Result<(), AppSettingsRepositoryError> {
        let changed = self
            .connection
            .call(move |database| -> tokio_rusqlite::rusqlite::Result<usize> {
                database.execute(
                    "UPDATE app_settings SET \
                         confirm_before_exit = ?1, \
                         terminal_semantic_highlighting_enabled = ?2, \
                         terminal_font_id = ?3, \
                         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
                         WHERE id = 1",
                    params![
                        confirm_before_exit,
                        terminal_semantic_highlighting_enabled,
                        terminal_font_id,
                    ],
                )
            })
            .await
            .map_err(|_| AppSettingsRepositoryError::Storage)?;

        if changed != 1 {
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
