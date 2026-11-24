-- HELD for owner review. Requires 003 then 202611240001. Additive only.
ALTER TABLE zoom_recording_deletions ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ;
ALTER TABLE zoom_recording_deletions ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;
ALTER TABLE zoom_recording_deletions ADD COLUMN IF NOT EXISTS restored_by UUID REFERENCES users(id) ON DELETE SET NULL;
UPDATE zoom_recording_deletions SET purge_after=GREATEST(requested_at+INTERVAL '48 hours',NOW()+INTERVAL '48 hours') WHERE purge_after IS NULL;
ALTER TABLE zoom_recording_deletions ALTER COLUMN purge_after SET DEFAULT (NOW()+INTERVAL '48 hours');
ALTER TABLE zoom_recording_deletions ALTER COLUMN purge_after SET NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='zoom_recording_deletions'::regclass AND conname='zoom_recording_retention_minimum') THEN
  ALTER TABLE zoom_recording_deletions ADD CONSTRAINT zoom_recording_retention_minimum CHECK(purge_after>=requested_at+INTERVAL '48 hours');
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS zoom_recording_deletion_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 import_id UUID NOT NULL REFERENCES zoom_recording_imports(id),
 action TEXT NOT NULL CHECK(action IN ('requested','restored','purged')),
 actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zoom_deletion_events_import ON zoom_recording_deletion_events(import_id,created_at);
