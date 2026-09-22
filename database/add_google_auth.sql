-- =====================================================
-- SYNTA ACADEMY — Google OAuth Migration
-- Adds google_id column and makes password_hash nullable
-- so Google-only accounts don't need a password.
--
-- Run via: psql $DATABASE_URL -f add_google_auth.sql
-- Or paste into Coolify's DB terminal.
-- =====================================================

-- 1. Add google_id column for Google OAuth linking
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;

-- 2. Make password_hash nullable (Google users have no password)
ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

-- 3. Index for fast google_id lookups
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
