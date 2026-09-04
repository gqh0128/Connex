ALTER TABLE app_appearance_settings
    ADD COLUMN interface_scale_percent INTEGER NOT NULL DEFAULT 100
    CHECK (interface_scale_percent IN (80, 90, 100, 110, 125, 150));
