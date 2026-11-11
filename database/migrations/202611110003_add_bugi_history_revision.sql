ALTER TABLE users
    ADD COLUMN IF NOT EXISTS bugi_history_revision BIGINT NOT NULL DEFAULT 0
        CHECK (bugi_history_revision >= 0);
