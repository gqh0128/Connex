ALTER TABLE app_settings
    ADD COLUMN terminal_font_weight INTEGER NOT NULL DEFAULT 500
    CHECK (
        terminal_font_weight BETWEEN 100 AND 800
        AND terminal_font_weight % 100 = 0
    );
