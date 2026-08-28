CREATE TABLE connection_credentials (
    connection_id TEXT PRIMARY KEY NOT NULL,
    algorithm TEXT NOT NULL
        CHECK (algorithm = 'aes-256-gcm-v1'),
    nonce BLOB NOT NULL
        CHECK (length(nonce) = 12),
    ciphertext BLOB NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
);
