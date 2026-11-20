-- Optional extra offers and individual access grants for live sessions.
-- Additive only: existing sessions keep their current course, offer and audience rules.
-- HELD: move into database/migrations/ only with the owner's explicit approval; the next deploy then applies it.
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS additional_offer_ids UUID[],
  ADD COLUMN IF NOT EXISTS granted_student_ids UUID[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_sessions_additional_offers_nonempty') THEN
    ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_additional_offers_nonempty
      CHECK (additional_offer_ids IS NULL OR (cardinality(additional_offer_ids) > 0 AND offer_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_sessions_granted_students_nonempty') THEN
    ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_granted_students_nonempty
      CHECK (cardinality(granted_student_ids) > 0);
  END IF;
END $$;
