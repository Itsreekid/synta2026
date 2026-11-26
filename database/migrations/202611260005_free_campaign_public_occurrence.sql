-- APPROVED for disposable local implementation/testing only; remains HELD.
-- Depends on campaigns, reviewed live-session compatibility, and held guest funnel.
-- Never apply to production or promote without separate explicit approval.
DO $$
BEGIN
  IF to_regclass('free_session_attempts') IS NULL OR to_regclass('free_session_reservations') IS NULL THEN
    RAISE EXCEPTION 'Requires 202611250004_free_session_funnel.sql before public occurrence activation';
  END IF;
END $$;
ALTER TABLE free_sessions ADD COLUMN published_occurrence_id UUID;
ALTER TABLE free_sessions ADD COLUMN target_branches TEXT[];

-- Existing scalar targeting is preserved; subsets use the new list exclusively.
ALTER TABLE free_sessions ADD CONSTRAINT free_campaign_target_branches_valid CHECK (
  target_branches IS NULL OR (
    target_branch IS NULL
    AND cardinality(target_branches) BETWEEN 1 AND 7
    AND array_ndims(target_branches) = 1
    AND array_position(target_branches, NULL) IS NULL
    AND target_branches <@ ARRAY['lettres','mathematiques','informatique','sciences','technique','economie','other']::TEXT[]
  )
);

-- Composite foreign key prevents publishing another campaign's occurrence.
CREATE UNIQUE INDEX live_sessions_campaign_occurrence_identity
  ON live_sessions(free_session_id, id);
ALTER TABLE free_sessions ADD CONSTRAINT free_campaign_published_occurrence_owner
  FOREIGN KEY(id, published_occurrence_id) REFERENCES live_sessions(free_session_id, id);

-- NULL defaults intentionally publish nothing; never infer admin intent or move reservations.
