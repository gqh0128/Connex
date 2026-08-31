ALTER TABLE app_settings
    ADD COLUMN terminal_font_size INTEGER NOT NULL DEFAULT 13
    CHECK (terminal_font_size BETWEEN 9 AND 32);

ALTER TABLE app_settings
    ADD COLUMN terminal_font_size_shortcuts_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (terminal_font_size_shortcuts_enabled IN (0, 1));
