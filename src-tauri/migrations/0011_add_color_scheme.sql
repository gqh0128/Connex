CREATE TABLE IF NOT EXISTS app_appearance_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    color_scheme_id TEXT NOT NULL DEFAULT 'pine'
        CHECK (length(color_scheme_id) BETWEEN 1 AND 32),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO app_appearance_settings (id, color_scheme_id)
VALUES (1, 'pine')
ON CONFLICT(id) DO NOTHING;
