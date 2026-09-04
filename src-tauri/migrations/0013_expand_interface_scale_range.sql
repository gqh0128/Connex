CREATE TABLE app_appearance_settings_next (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    color_scheme_id TEXT NOT NULL DEFAULT 'pine'
        CHECK (length(color_scheme_id) BETWEEN 1 AND 32),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    interface_scale_percent INTEGER NOT NULL DEFAULT 100
        CHECK (
            interface_scale_percent BETWEEN 75 AND 175
            AND interface_scale_percent % 5 = 0
        )
);

INSERT INTO app_appearance_settings_next (
    id,
    color_scheme_id,
    updated_at,
    interface_scale_percent
)
SELECT
    id,
    color_scheme_id,
    updated_at,
    CASE
        WHEN interface_scale_percent BETWEEN 75 AND 175
            AND interface_scale_percent % 5 = 0
        THEN interface_scale_percent
        ELSE 100
    END
FROM app_appearance_settings;

DROP TABLE app_appearance_settings;
ALTER TABLE app_appearance_settings_next RENAME TO app_appearance_settings;
