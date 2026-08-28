CREATE TABLE connection_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    host TEXT NOT NULL CHECK (length(host) BETWEEN 1 AND 255),
    port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
    username TEXT NOT NULL CHECK (length(username) BETWEEN 1 AND 128),
    authentication_method TEXT NOT NULL CHECK (
        authentication_method IN ('password', 'private_key', 'agent')
    ),
    private_key_path TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_connected_at TEXT
);

CREATE INDEX connection_profiles_activity_idx
    ON connection_profiles (last_connected_at DESC, updated_at DESC);
