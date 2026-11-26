-- Persistent Bugi daily question quota (survives restarts and deploys).
-- One row per question attempt: 'reserved' while Gemini answers, then 'used'.
-- A failed answer deletes its reservation, so failures never consume the quota.
-- Stale reservations (crash mid-request) stop counting after a short window in code.
-- Additive only: a new table; no existing row is modified.
-- Owner approved promotion on 2026-11-26 (local testing first; production only after deployment approval).
CREATE TABLE IF NOT EXISTS bugi_question_usage (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_day DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'used')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bugi_question_usage_user_day
  ON bugi_question_usage (user_id, usage_day);
