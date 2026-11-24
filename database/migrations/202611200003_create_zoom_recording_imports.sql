-- Durable queue and status for importing Zoom cloud recordings (MP4) into private R2.
-- Additive only: no existing table or row is modified. Zoom recordings are never deleted.
-- HELD: move into database/migrations/ only with the owner's explicit approval; the next deploy then applies it.
CREATE TABLE IF NOT EXISTS zoom_recording_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoom_meeting_id TEXT NOT NULL,
  zoom_meeting_uuid TEXT NOT NULL,
  zoom_file_id TEXT NOT NULL UNIQUE,
  recording_type TEXT,
  recording_start TIMESTAMPTZ NOT NULL,
  recording_end TIMESTAMPTZ,
  file_size BIGINT CHECK (file_size IS NULL OR file_size > 0),
  download_url TEXT NOT NULL,
  live_session_id UUID REFERENCES live_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'importing', 'needs_review', 'published', 'failed', 'discarded')),
  review_reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  object_key TEXT,
  multipart_upload_id TEXT,
  bytes_transferred BIGINT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zoom_recording_imports_queue ON zoom_recording_imports (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_zoom_recording_imports_session ON zoom_recording_imports (live_session_id);
CREATE INDEX IF NOT EXISTS idx_zoom_recording_imports_meeting ON zoom_recording_imports (zoom_meeting_uuid);
