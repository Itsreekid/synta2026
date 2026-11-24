-- HELD for owner review. Apply after 202611200003 only, never at route/startup.
-- Additive: retain every legacy import, replay pointer and object key.
CREATE TABLE IF NOT EXISTS zoom_recording_occurrences (
 occurrence_uuid TEXT PRIMARY KEY,
 meeting_id TEXT NOT NULL,
 live_session_id UUID REFERENCES live_sessions(id) ON DELETE SET NULL,
 resolution TEXT NOT NULL CHECK(resolution IN ('matched','ambiguous','unmatched','legacy_conflict','admin')),
 resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
 resolved_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO zoom_recording_occurrences(occurrence_uuid,meeting_id,live_session_id,resolution)
 SELECT zoom_meeting_uuid,MIN(zoom_meeting_id),
 CASE WHEN COUNT(DISTINCT live_session_id)=1 AND COUNT(DISTINCT zoom_meeting_id)=1 THEN MIN(live_session_id::text)::uuid END,
 CASE WHEN COUNT(DISTINCT live_session_id)>1 OR COUNT(DISTINCT zoom_meeting_id)>1 THEN 'legacy_conflict'
      WHEN COUNT(DISTINCT live_session_id)=1 THEN 'matched' ELSE 'unmatched' END
 FROM zoom_recording_imports GROUP BY zoom_meeting_uuid
 ON CONFLICT DO NOTHING;
ALTER TABLE zoom_recording_imports ADD COLUMN IF NOT EXISTS claim_token UUID;
ALTER TABLE zoom_recording_imports ADD COLUMN IF NOT EXISTS delete_requested_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS zoom_recording_transfers (
 token UUID PRIMARY KEY,
 import_id UUID NOT NULL REFERENCES zoom_recording_imports(id),
 object_key TEXT NOT NULL UNIQUE,
 multipart_upload_id TEXT,
 expected_size BIGINT CHECK(expected_size IS NULL OR expected_size>0),
 completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zoom_transfers_import ON zoom_recording_transfers(import_id);
CREATE TABLE IF NOT EXISTS zoom_recording_deletions (
 import_id UUID PRIMARY KEY REFERENCES zoom_recording_imports(id),
 requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
 requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 completed_at TIMESTAMPTZ,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_zoom_deletions_pending ON zoom_recording_deletions(requested_at) WHERE completed_at IS NULL;
