-- Approved 2026-11-25: additive popup metadata; executed by deployment migration runner.
-- Dependencies: baseline live_sessions and 202611050001_create_notifications.sql.
-- Reuses the existing per-student notification ID as the popup event identity.
-- Existing notifications retain NULL popup metadata and will not open modals.
ALTER TABLE notifications
  ADD COLUMN popup_session_id UUID REFERENCES live_sessions(id) ON DELETE SET NULL,
  ADD COLUMN popup_scheduled_at TIMESTAMPTZ,
  ADD COLUMN popup_acknowledged_at TIMESTAMPTZ;

CREATE INDEX idx_notifications_pending_popup
  ON notifications(user_id, created_at, id)
  WHERE popup_session_id IS NOT NULL AND popup_acknowledged_at IS NULL;
