ALTER TABLE app_settings
    ADD COLUMN terminal_font_id TEXT NOT NULL DEFAULT 'preset:jetbrains-mono'
    CHECK (length(terminal_font_id) BETWEEN 1 AND 96);

CREATE TABLE terminal_font_files (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
    display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
    stored_file_name TEXT NOT NULL UNIQUE CHECK (length(stored_file_name) BETWEEN 1 AND 128),
    format TEXT NOT NULL CHECK (format IN ('truetype', 'opentype', 'woff', 'woff2')),
    byte_length INTEGER NOT NULL CHECK (byte_length BETWEEN 1 AND 10485760),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
