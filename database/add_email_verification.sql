-- =====================================================
-- SYNTA ACADEMY — Email Verification Migration
-- Adds email_verified, verification_token, token_expires_at
-- to the users table so we can confirm email addresses.
--
-- Run via: psql $DATABASE_URL -f add_email_verification.sql
-- Or paste into Coolify's DB terminal.
-- =====================================================

-- 1. Email verified flag (default false for email/password accounts)
--    Google-authenticated users are considered pre-verified.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- 2. Verification token (hex string, 64 chars)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_token TEXT;

-- 3. Token expiry (24 hours after registration)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

-- 4. Mark all existing Google-linked accounts as already verified
--    (they proved their email through Google's own flow)
UPDATE users
  SET email_verified = true
  WHERE google_id IS NOT NULL;

-- 5. Index for fast token lookups during verification
CREATE INDEX IF NOT EXISTS idx_users_verification_token
  ON users(verification_token)
  WHERE verification_token IS NOT NULL;
