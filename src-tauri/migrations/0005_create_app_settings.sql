CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    confirm_before_exit INTEGER NOT NULL DEFAULT 1
        CHECK (confirm_before_exit IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT (
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
);

INSERT INTO app_settings (id, confirm_before_exit)
VALUES (1, 1);
