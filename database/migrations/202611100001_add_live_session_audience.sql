ALTER TABLE live_sessions
  ADD COLUMN audience_student_ids UUID[],
  ADD CONSTRAINT live_sessions_audience_nonempty
    CHECK (cardinality(audience_student_ids) > 0);
