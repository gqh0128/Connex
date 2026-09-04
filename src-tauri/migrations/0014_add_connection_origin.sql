ALTER TABLE connection_profiles
    ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('manual', 'ssh_config'));
