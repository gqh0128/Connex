ALTER TABLE connection_profiles
    ADD COLUMN has_stored_credential INTEGER NOT NULL DEFAULT 0
    CHECK (has_stored_credential IN (0, 1));
