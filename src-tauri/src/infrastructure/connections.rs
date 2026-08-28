use std::fmt;

use tokio_rusqlite::{Connection, OptionalExtension, params};

use crate::domain::connections::{AuthenticationMethod, ConnectionDraft, ConnectionProfile};
use crate::infrastructure::database::Database;

#[derive(Clone)]
pub struct ConnectionRepository {
    connection: Connection,
}

impl ConnectionRepository {
    pub fn new(database: Database) -> Self {
        Self {
            connection: database.connection(),
        }
    }

    pub async fn list(&self) -> Result<Vec<ConnectionProfile>, ConnectionRepositoryError> {
        let records = self
            .connection
            .call(
                |database| -> tokio_rusqlite::rusqlite::Result<Vec<ConnectionRecord>> {
                    let mut statement = database.prepare(
                        "SELECT id, name, host, port, username, authentication_method, \
                     private_key_path, has_stored_credential, created_at, updated_at, last_connected_at \
                     FROM connection_profiles \
                     ORDER BY COALESCE(last_connected_at, updated_at) DESC, name COLLATE NOCASE",
                    )?;
                    let records = statement
                        .query_map([], ConnectionRecord::from_row)?
                        .collect::<Result<Vec<_>, _>>()?;

                    Ok(records)
                },
            )
            .await
            .map_err(|_| ConnectionRepositoryError::Storage)?;

        records
            .into_iter()
            .map(ConnectionProfile::try_from)
            .collect()
    }

    pub async fn get(&self, id: String) -> Result<ConnectionProfile, ConnectionRepositoryError> {
        let record = self
            .connection
            .call(move |database| select_by_id(database, &id))
            .await
            .map_err(|_| ConnectionRepositoryError::Storage)?
            .ok_or(ConnectionRepositoryError::NotFound)?;

        ConnectionProfile::try_from(record)
    }

    pub async fn contains(&self, id: String) -> Result<bool, ConnectionRepositoryError> {
        self.connection
            .call(move |database| -> tokio_rusqlite::rusqlite::Result<bool> {
                database.query_row(
                    "SELECT EXISTS(SELECT 1 FROM connection_profiles WHERE id = ?1)",
                    [id],
                    |row| row.get(0),
                )
            })
            .await
            .map_err(|_| ConnectionRepositoryError::Storage)
    }

    pub async fn create(
        &self,
        id: String,
        draft: ConnectionDraft,
        has_stored_credential: bool,
    ) -> Result<ConnectionProfile, ConnectionRepositoryError> {
        let authentication_method = draft.authentication_method.as_storage_value().to_owned();
        let record = self
            .connection
            .call(
                move |database| -> tokio_rusqlite::rusqlite::Result<Option<ConnectionRecord>> {
                    database.execute(
                        "INSERT INTO connection_profiles (\
                        id, name, host, port, username, authentication_method, private_key_path, \
                        has_stored_credential\
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![
                            id,
                            draft.name,
                            draft.host,
                            draft.port,
                            draft.username,
                            authentication_method,
                            draft.private_key_path,
                            has_stored_credential,
                        ],
                    )?;

                    select_by_id(database, &id)
                },
            )
            .await
            .map_err(|_| ConnectionRepositoryError::Storage)?
            .ok_or(ConnectionRepositoryError::NotFound)?;

        ConnectionProfile::try_from(record)
    }

    pub async fn update(
        &self,
        id: String,
        draft: ConnectionDraft,
        has_stored_credential: bool,
    ) -> Result<ConnectionProfile, ConnectionRepositoryError> {
        let authentication_method = draft.authentication_method.as_storage_value().to_owned();
        let record = self
            .connection
            .call(
                move |database| -> tokio_rusqlite::rusqlite::Result<Option<ConnectionRecord>> {
                    let changed = database.execute(
                        "UPDATE connection_profiles SET \
                        name = ?2, host = ?3, port = ?4, username = ?5, \
                        authentication_method = ?6, private_key_path = ?7, \
                        has_stored_credential = ?8, \
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
                     WHERE id = ?1",
                        params![
                            id,
                            draft.name,
                            draft.host,
                            draft.port,
                            draft.username,
                            authentication_method,
                            draft.private_key_path,
                            has_stored_credential,
                        ],
                    )?;

                    if changed == 0 {
                        return Ok(None);
                    }

                    select_by_id(database, &id)
                },
            )
            .await
            .map_err(|_| ConnectionRepositoryError::Storage)?
            .ok_or(ConnectionRepositoryError::NotFound)?;

        ConnectionProfile::try_from(record)
    }

    pub async fn delete(&self, id: String) -> Result<(), ConnectionRepositoryError> {
        let changed = self
            .connection
            .call(move |database| -> tokio_rusqlite::rusqlite::Result<usize> {
                database.execute("DELETE FROM connection_profiles WHERE id = ?1", [id])
            })
            .await
            .map_err(|_| ConnectionRepositoryError::Storage)?;

        if changed == 0 {
            return Err(ConnectionRepositoryError::NotFound);
        }

        Ok(())
    }
}

#[derive(Debug)]
pub enum ConnectionRepositoryError {
    NotFound,
    Storage,
}

impl fmt::Display for ConnectionRepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound => formatter.write_str("connection profile not found"),
            Self::Storage => formatter.write_str("connection storage is unavailable"),
        }
    }
}

impl std::error::Error for ConnectionRepositoryError {}

struct ConnectionRecord {
    id: String,
    name: String,
    host: String,
    port: i64,
    username: String,
    authentication_method: String,
    private_key_path: Option<String>,
    has_stored_credential: bool,
    created_at: String,
    updated_at: String,
    last_connected_at: Option<String>,
}

impl ConnectionRecord {
    fn from_row(row: &tokio_rusqlite::Row<'_>) -> tokio_rusqlite::rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            name: row.get(1)?,
            host: row.get(2)?,
            port: row.get(3)?,
            username: row.get(4)?,
            authentication_method: row.get(5)?,
            private_key_path: row.get(6)?,
            has_stored_credential: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
            last_connected_at: row.get(10)?,
        })
    }
}

impl TryFrom<ConnectionRecord> for ConnectionProfile {
    type Error = ConnectionRepositoryError;

    fn try_from(record: ConnectionRecord) -> Result<Self, Self::Error> {
        let port = u16::try_from(record.port).map_err(|_| ConnectionRepositoryError::Storage)?;
        let authentication_method =
            AuthenticationMethod::from_storage_value(&record.authentication_method)
                .ok_or(ConnectionRepositoryError::Storage)?;

        Ok(Self {
            id: record.id,
            name: record.name,
            host: record.host,
            port,
            username: record.username,
            authentication_method,
            private_key_path: record.private_key_path,
            has_stored_credential: record.has_stored_credential,
            created_at: record.created_at,
            updated_at: record.updated_at,
            last_connected_at: record.last_connected_at,
        })
    }
}

fn select_by_id(
    database: &tokio_rusqlite::rusqlite::Connection,
    id: &str,
) -> tokio_rusqlite::rusqlite::Result<Option<ConnectionRecord>> {
    database
        .query_row(
            "SELECT id, name, host, port, username, authentication_method, \
             private_key_path, has_stored_credential, created_at, updated_at, last_connected_at \
             FROM connection_profiles WHERE id = ?1",
            [id],
            ConnectionRecord::from_row,
        )
        .optional()
}
