use std::fmt;

use tokio_rusqlite::{Connection, params};

use crate::domain::known_hosts::KnownHostKey;
use crate::infrastructure::database::Database;

#[derive(Clone)]
pub struct KnownHostRepository {
    connection: Connection,
}

impl KnownHostRepository {
    pub fn new(database: Database) -> Self {
        Self {
            connection: database.connection(),
        }
    }

    pub async fn list_for_host(
        &self,
        host: &str,
        port: u16,
    ) -> Result<Vec<KnownHostKey>, KnownHostRepositoryError> {
        let host = host.to_owned();
        self.connection
            .call(
                move |database| -> tokio_rusqlite::rusqlite::Result<Vec<KnownHostKey>> {
                    let mut statement = database.prepare(
                        "SELECT host, port, key_algorithm, fingerprint_sha256 \
                         FROM known_host_keys WHERE host = ?1 AND port = ?2 \
                         ORDER BY key_algorithm",
                    )?;
                    statement
                        .query_map(params![host, port], |row| {
                            let stored_port: i64 = row.get(1)?;
                            let port = u16::try_from(stored_port).map_err(|error| {
                                tokio_rusqlite::rusqlite::Error::FromSqlConversionFailure(
                                    1,
                                    tokio_rusqlite::rusqlite::types::Type::Integer,
                                    Box::new(error),
                                )
                            })?;

                            Ok(KnownHostKey {
                                host: row.get(0)?,
                                port,
                                key_algorithm: row.get(2)?,
                                fingerprint_sha256: row.get(3)?,
                            })
                        })?
                        .collect()
                },
            )
            .await
            .map_err(|_| KnownHostRepositoryError::Storage)
    }

    pub async fn save(&self, key: KnownHostKey) -> Result<(), KnownHostRepositoryError> {
        self.connection
            .call(move |database| -> tokio_rusqlite::rusqlite::Result<()> {
                database.execute(
                    "INSERT INTO known_host_keys (host, port, key_algorithm, fingerprint_sha256) \
                     VALUES (?1, ?2, ?3, ?4) \
                     ON CONFLICT(host, port, key_algorithm) DO UPDATE SET \
                     fingerprint_sha256 = excluded.fingerprint_sha256, \
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                    params![
                        key.host,
                        key.port,
                        key.key_algorithm,
                        key.fingerprint_sha256,
                    ],
                )?;
                Ok(())
            })
            .await
            .map_err(|_| KnownHostRepositoryError::Storage)
    }
}

#[derive(Debug)]
pub enum KnownHostRepositoryError {
    Storage,
}

impl fmt::Display for KnownHostRepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("known host storage is unavailable")
    }
}

impl std::error::Error for KnownHostRepositoryError {}
