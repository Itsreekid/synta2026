-- PROPOSED / HELD. Review with the owner before execution in any environment.
-- Requires 202611200002_extend_live_session_access.sql first.
-- Legacy rows retain their existing authorization semantics.
ALTER TABLE live_sessions
  ADD COLUMN access_policy TEXT NOT NULL DEFAULT 'legacy'
    CHECK (access_policy IN ('legacy', 'any_selected')),
  ALTER COLUMN course_id DROP NOT NULL;

ALTER TABLE live_sessions ADD CONSTRAINT live_session_policy_shape CHECK (
  (access_policy = 'legacy' AND course_id IS NOT NULL)
  OR (access_policy = 'any_selected' AND course_id IS NULL AND offer_id IS NULL
      AND additional_offer_ids IS NULL AND audience_student_ids IS NULL)
);

CREATE TABLE live_session_courses (
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  PRIMARY KEY (session_id, course_id)
);
CREATE INDEX idx_live_session_courses_course ON live_session_courses(course_id, session_id);

CREATE TABLE live_session_offers (
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE RESTRICT,
  PRIMARY KEY (session_id, offer_id)
);
CREATE INDEX idx_live_session_offers_offer ON live_session_offers(offer_id, session_id);

-- Serialize link mutations before checking the final transaction state.
-- A link's parent identity is immutable; reassignment uses delete + insert.
CREATE FUNCTION lock_live_session_audience() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'Session audience link cannot change its parent';
  END IF;
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;
  PERFORM 1 FROM live_sessions WHERE id = target FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lock_live_session_courses BEFORE INSERT OR UPDATE OR DELETE ON live_session_courses
  FOR EACH ROW EXECUTE FUNCTION lock_live_session_audience();
CREATE TRIGGER lock_live_session_offers BEFORE INSERT OR UPDATE OR DELETE ON live_session_offers
  FOR EACH ROW EXECUTE FUNCTION lock_live_session_audience();

CREATE FUNCTION check_live_session_audience() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; policy TEXT; has_links BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'live_sessions' THEN
    target := NEW.id;
  ELSE
    target := CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;
  END IF;
  SELECT access_policy INTO policy FROM live_sessions WHERE id = target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT EXISTS(SELECT 1 FROM live_session_courses WHERE session_id = target)
      OR EXISTS(SELECT 1 FROM live_session_offers WHERE session_id = target) INTO has_links;
  IF (policy = 'any_selected' AND NOT has_links) OR (policy = 'legacy' AND has_links) THEN
    RAISE EXCEPTION 'Select at least one course or offer for an OR session; legacy sessions retain their original links';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER check_live_session_policy AFTER INSERT OR UPDATE ON live_sessions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_live_session_audience();
CREATE CONSTRAINT TRIGGER check_live_session_courses AFTER INSERT OR UPDATE OR DELETE ON live_session_courses
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_live_session_audience();
CREATE CONSTRAINT TRIGGER check_live_session_offers AFTER INSERT OR UPDATE OR DELETE ON live_session_offers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_live_session_audience();
