ALTER TABLE app_settings
    ADD COLUMN terminal_line_height REAL NOT NULL DEFAULT 1.10
    CHECK (terminal_line_height BETWEEN 1.00 AND 2.00);
