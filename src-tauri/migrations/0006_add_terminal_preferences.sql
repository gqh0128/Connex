ALTER TABLE app_settings
    ADD COLUMN terminal_semantic_highlighting_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (terminal_semantic_highlighting_enabled IN (0, 1));
