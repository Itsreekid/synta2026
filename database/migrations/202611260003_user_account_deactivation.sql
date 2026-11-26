-- Student account deactivation (admin): blocks sign-in while keeping every
-- enrollment, transaction, payment and audit row unchanged.
-- Additive only: two nullable columns, no existing row is modified.
-- Owner approved promotion on 2026-11-26 (local testing first; production only after deployment approval).
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_deactivated_at ON users (deactivated_at) WHERE deactivated_at IS NOT NULL;
