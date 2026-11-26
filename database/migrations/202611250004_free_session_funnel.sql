-- Owner approved local implementation/testing 2026-11-26. HELD: no production promotion/execution.
-- Requires free campaigns 202611250002 and a separately reviewed free/OR compatibility fix.
-- Reuses live_sessions as occurrences. No historical membership/result backfill.
ALTER TABLE free_sessions ADD COLUMN allow_result_reuse BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN diagnostic_rules JSONB NOT NULL DEFAULT '{"intermediate":50,"advanced":80}'::jsonb
 CHECK (jsonb_typeof(diagnostic_rules)='object'
   AND diagnostic_rules ? 'intermediate' AND diagnostic_rules ? 'advanced'
   AND jsonb_typeof(diagnostic_rules->'intermediate')='number'
   AND jsonb_typeof(diagnostic_rules->'advanced')='number'
   AND (diagnostic_rules->>'intermediate')::numeric BETWEEN 1 AND 99
   AND (diagnostic_rules->>'advanced')::numeric BETWEEN 2 AND 100
   AND (diagnostic_rules->>'intermediate')::numeric < (diagnostic_rules->>'advanced')::numeric);
ALTER TABLE live_sessions ADD COLUMN free_reservation_required BOOLEAN NOT NULL DEFAULT false;

DO $$
DECLARE user_type TEXT; registration_type TEXT;
BEGIN
 SELECT format_type(atttypid,atttypmod) INTO user_type FROM pg_attribute WHERE attrelid='users'::regclass AND attname='id';
 SELECT format_type(atttypid,atttypmod) INTO registration_type FROM pg_attribute WHERE attrelid='session_registrations'::regclass AND attname='id';
 EXECUTE format($sql$CREATE TABLE free_session_attempts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id UUID NOT NULL REFERENCES free_sessions(id),
 token_hash TEXT NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 user_id %s REFERENCES users(id), registration_id %s REFERENCES session_registrations(id),
 question_snapshot JSONB NOT NULL CHECK(jsonb_typeof(question_snapshot)='array'), answers JSONB,
 score INTEGER, total INTEGER NOT NULL CHECK(total>0), level TEXT CHECK(level IN ('beginner','intermediate','advanced')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL,
 claim_expires_at TIMESTAMPTZ NOT NULL, submitted_at TIMESTAMPTZ, claimed_at TIMESTAMPTZ,
 CHECK(expires_at>created_at AND claim_expires_at>=expires_at),
 CHECK(score IS NULL OR score BETWEEN 0 AND total),
 CHECK((submitted_at IS NULL AND score IS NULL AND level IS NULL) OR (submitted_at IS NOT NULL AND score IS NOT NULL AND level IS NOT NULL)),
 CHECK(claimed_at IS NULL OR (user_id IS NOT NULL AND submitted_at IS NOT NULL))
 )$sql$,user_type,registration_type);
 EXECUTE format($sql$CREATE TABLE free_session_reservations (
 live_session_id UUID NOT NULL REFERENCES live_sessions(id), user_id %s NOT NULL REFERENCES users(id),
 attempt_id UUID REFERENCES free_session_attempts(id), status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','cancelled')),
 reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(), cancelled_at TIMESTAMPTZ,
 PRIMARY KEY(live_session_id,user_id), CHECK((status='cancelled')=(cancelled_at IS NOT NULL))
 )$sql$,user_type);
 EXECUTE format($sql$CREATE TABLE free_session_occurrence_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), live_session_id UUID NOT NULL REFERENCES live_sessions(id),
 actor_id %s NOT NULL REFERENCES users(id), event_type TEXT NOT NULL CHECK(event_type IN ('created','rescheduled','cancelled')),
 previous_details JSONB, next_details JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )$sql$,user_type);
END $$;
CREATE INDEX idx_free_attempts_user_campaign ON free_session_attempts(user_id,campaign_id,created_at);
CREATE INDEX idx_free_reservations_user ON free_session_reservations(user_id,live_session_id);
-- Retain old sessions/results; enable multiple independently scheduled occurrences.
DROP INDEX live_sessions_one_active_per_free_session;
CREATE INDEX idx_free_occurrence_schedule ON live_sessions(free_session_id,scheduled_at) WHERE free_session_id IS NOT NULL;
-- Once-only ownership cannot be reassigned after claim, including by crafted API writes.
CREATE FUNCTION protect_free_attempt_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id)
 OR (OLD.registration_id IS NOT NULL AND NEW.registration_id IS DISTINCT FROM OLD.registration_id)
 OR (OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at) THEN
 RAISE EXCEPTION 'Attempt owner is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.submitted_at IS NOT NULL AND (NEW.question_snapshot IS DISTINCT FROM OLD.question_snapshot OR NEW.answers IS DISTINCT FROM OLD.answers
 OR NEW.score IS DISTINCT FROM OLD.score OR NEW.total IS DISTINCT FROM OLD.total OR NEW.level IS DISTINCT FROM OLD.level OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at) THEN
 RAISE EXCEPTION 'Submitted result is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_free_attempt_owner BEFORE UPDATE ON free_session_attempts FOR EACH ROW EXECUTE FUNCTION protect_free_attempt_owner();

CREATE FUNCTION protect_free_occurrence_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Occurrence events are append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER protect_free_occurrence_history BEFORE UPDATE OR DELETE ON free_session_occurrence_events FOR EACH ROW EXECUTE FUNCTION protect_free_occurrence_history();
