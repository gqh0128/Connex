use std::fmt;
use std::path::Path;

use tokio_rusqlite::Connection;

const MIGRATIONS: &[&str] = &[
    include_str!("../../migrations/0001_create_connections.sql"),
    include_str!("../../migrations/0002_create_known_hosts.sql"),
    include_str!("../../migrations/0003_track_stored_credentials.sql"),
    include_str!("../../migrations/0004_encrypt_connection_credentials.sql"),
    include_str!("../../migrations/0005_create_app_settings.sql"),
    include_str!("../../migrations/0006_add_terminal_preferences.sql"),
];

#[derive(Clone)]
pub struct Database {
    connection: Connection,
}

impl Database {
    pub async fn open(path: impl AsRef<Path>) -> Result<Self, DatabaseError> {
        let connection = Connection::open(path)
            .await
            .map_err(|_| DatabaseError::Unavailable)?;

        connection
            .call(|database| -> tokio_rusqlite::rusqlite::Result<()> {
                database.busy_timeout(std::time::Duration::from_secs(5))?;
                database.pragma_update(None, "foreign_keys", true)?;
                database.pragma_update(None, "journal_mode", "WAL")?;

                let current_version: usize =
                    database.pragma_query_value(None, "user_version", |row| row.get(0))?;
                if current_version > MIGRATIONS.len() {
                    return Err(tokio_rusqlite::rusqlite::Error::InvalidQuery);
                }

                for (index, migration) in MIGRATIONS.iter().enumerate().skip(current_version) {
                    let transaction = database.transaction()?;
                    transaction.execute_batch(migration)?;
                    transaction.pragma_update(None, "user_version", index + 1)?;
                    transaction.commit()?;
                }

                Ok(())
            })
            .await
            .map_err(|_| DatabaseError::Unavailable)?;

        Ok(Self { connection })
    }

    pub(crate) fn connection(&self) -> Connection {
        self.connection.clone()
    }
}

#[derive(Debug)]
pub enum DatabaseError {
    Unavailable,
}

impl fmt::Display for DatabaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("application database is unavailable")
    }
}

impl std::error::Error for DatabaseError {}
