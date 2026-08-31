use std::fmt;

use tokio_rusqlite::Connection;
use tokio_rusqlite::rusqlite::{OptionalExtension, params};

use crate::domain::terminal_fonts::{TerminalFontFile, TerminalFontFormat};
use crate::infrastructure::database::Database;

#[derive(Clone)]
pub struct TerminalFontRepository {
    connection: Connection,
}

impl TerminalFontRepository {
    pub fn new(database: Database) -> Self {
        Self {
            connection: database.connection(),
        }
    }

    pub async fn list(&self) -> Result<Vec<TerminalFontFile>, TerminalFontRepositoryError> {
        self.connection
            .call(
                |database| -> tokio_rusqlite::rusqlite::Result<Vec<TerminalFontFile>> {
                    let mut statement = database.prepare(
                    "SELECT id, display_name, stored_file_name, format, byte_length, created_at \
                     FROM terminal_font_files ORDER BY created_at ASC, id ASC",
                )?;
                    statement
                        .query_map([], terminal_font_from_row)?
                        .collect::<Result<Vec<_>, _>>()
                },
            )
            .await
            .map_err(|_| TerminalFontRepositoryError::Storage)
    }

    pub async fn find(
        &self,
        id: &str,
    ) -> Result<Option<TerminalFontFile>, TerminalFontRepositoryError> {
        let id = id.to_owned();
        self.connection
            .call(
                move |database| -> tokio_rusqlite::rusqlite::Result<Option<TerminalFontFile>> {
                    database
                        .query_row(
                            "SELECT id, display_name, stored_file_name, format, byte_length, created_at \
                             FROM terminal_font_files WHERE id = ?1",
                            [id],
                            terminal_font_from_row,
                        )
                        .optional()
                },
            )
            .await
            .map_err(|_| TerminalFontRepositoryError::Storage)
    }

    pub async fn insert(&self, font: TerminalFontFile) -> Result<(), TerminalFontRepositoryError> {
        let changed = self
            .connection
            .call(move |database| -> tokio_rusqlite::rusqlite::Result<usize> {
                database.execute(
                    "INSERT INTO terminal_font_files (\
                         id, display_name, stored_file_name, format, byte_length\
                     ) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        font.id,
                        font.display_name,
                        font.stored_file_name,
                        font.format.as_storage(),
                        font.byte_length,
                    ],
                )
            })
            .await
            .map_err(|_| TerminalFontRepositoryError::Storage)?;

        if changed != 1 {
            return Err(TerminalFontRepositoryError::Storage);
        }
        Ok(())
    }

    pub async fn delete(&self, id: &str) -> Result<(), TerminalFontRepositoryError> {
        let id = id.to_owned();
        let changed = self
            .connection
            .call(move |database| -> tokio_rusqlite::rusqlite::Result<usize> {
                database.execute("DELETE FROM terminal_font_files WHERE id = ?1", [id])
            })
            .await
            .map_err(|_| TerminalFontRepositoryError::Storage)?;

        if changed != 1 {
            return Err(TerminalFontRepositoryError::Storage);
        }
        Ok(())
    }
}

fn terminal_font_from_row(
    row: &tokio_rusqlite::rusqlite::Row<'_>,
) -> tokio_rusqlite::rusqlite::Result<TerminalFontFile> {
    let format: String = row.get(3)?;
    let format = TerminalFontFormat::from_storage(&format)
        .ok_or(tokio_rusqlite::rusqlite::Error::InvalidQuery)?;
    let byte_length: i64 = row.get(4)?;
    let byte_length =
        u64::try_from(byte_length).map_err(|_| tokio_rusqlite::rusqlite::Error::InvalidQuery)?;

    Ok(TerminalFontFile {
        id: row.get(0)?,
        display_name: row.get(1)?,
        stored_file_name: row.get(2)?,
        format,
        byte_length,
        created_at: row.get(5)?,
    })
}

#[derive(Debug)]
pub enum TerminalFontRepositoryError {
    Storage,
}

impl fmt::Display for TerminalFontRepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("terminal font storage is unavailable")
    }
}

impl std::error::Error for TerminalFontRepositoryError {}
