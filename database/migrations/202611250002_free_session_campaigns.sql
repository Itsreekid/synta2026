-- Free-session campaigns (owner-approved 2026-11-25).
-- Several public placement-quiz links (/session and /session/<slug>), each with its own
-- quiz, class/branch, schedule and Zoom meeting, managed from "Configuration de la Session".
--
-- Additive only: no table, column or row is removed. Existing /session data is moved into a
-- first campaign that stays the default, so the original link, quiz, registrations and
-- results are preserved. Safe to run once through scripts/migrate.js (one transaction).
--
-- Revision 2 (before first successful application): production column types can differ from
-- schema_postgres.sql (e.g. ids, dates or scores stored as text). Keys copy the real types and
-- the backfill reads old values through ::text, so the migration no longer assumes them.

CREATE TABLE free_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT NOT NULL UNIQUE
                   CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 60
                          AND slug NOT IN ('admin', 'api', 'verify', 'status', 'questions', 'submit', 'register')),
  title            TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 150),
  description      TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  subject          TEXT NOT NULL DEFAULT 'Informatique' CHECK (char_length(btrim(subject)) BETWEEN 1 AND 100),
  target_class     TEXT CHECK (target_class IS NULL OR target_class IN ('1ere', '2eme', '3eme', 'bac', 'other')),
  target_branch    TEXT CHECK (target_branch IS NULL OR target_branch IN
                     ('lettres', 'mathematiques', 'informatique', 'sciences', 'technique', 'economie', 'other')),
  scheduled_at     TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 480),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  is_default       BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- /session serves exactly one default campaign.
CREATE UNIQUE INDEX free_sessions_single_default ON free_sessions (is_default) WHERE is_default;

-- Students who completed a campaign quiz. They are the only ones allowed to see and join
-- that campaign's Zoom session. One row per student per campaign (repeated participation
-- across campaigns = several rows). user_id / registration_id copy the real key types.
DO $$
DECLARE
  user_id_type TEXT;
  registration_id_type TEXT;
BEGIN
  SELECT format_type(atttypid, atttypmod) INTO user_id_type
  FROM pg_attribute WHERE attrelid = 'users'::regclass AND attname = 'id';
  SELECT format_type(atttypid, atttypmod) INTO registration_id_type
  FROM pg_attribute WHERE attrelid = 'session_registrations'::regclass AND attname = 'id';
  EXECUTE format($create$
    CREATE TABLE free_session_participants (
      free_session_id UUID NOT NULL REFERENCES free_sessions(id) ON DELETE RESTRICT,
      user_id         %s NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source          TEXT NOT NULL CHECK (source IN ('new_signup', 'existing_student')),
      score           INTEGER CHECK (score IS NULL OR score >= 0),
      total           INTEGER CHECK (total IS NULL OR total >= 0),
      tier            TEXT,
      "group"         TEXT,
      answers         JSONB,
      registration_id %s REFERENCES session_registrations(id) ON DELETE SET NULL,
      joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (free_session_id, user_id)
    )$create$, user_id_type, registration_id_type);
END $$;
CREATE INDEX idx_free_session_participants_user ON free_session_participants (user_id);

-- Quiz questions and pre-account registrations belong to one campaign.
ALTER TABLE session_questions ADD COLUMN free_session_id UUID REFERENCES free_sessions(id) ON DELETE RESTRICT;
ALTER TABLE session_registrations
  ADD COLUMN free_session_id UUID REFERENCES free_sessions(id) ON DELETE RESTRICT,
  ADD COLUMN quiz_total INTEGER CHECK (quiz_total IS NULL OR quiz_total >= 0);
CREATE INDEX idx_session_questions_free_session ON session_questions (free_session_id, order_index);
CREATE INDEX idx_session_registrations_free_session ON session_registrations (free_session_id, created_at);

-- Original signup source. Set once at account creation; joining a campaign later never changes it.
-- NULL = standard registration (/register or Google).
ALTER TABLE users
  ADD COLUMN signup_source TEXT CHECK (signup_source IS NULL OR signup_source = 'free_session'),
  ADD COLUMN signup_free_session_id UUID REFERENCES free_sessions(id) ON DELETE SET NULL;

-- A campaign's Zoom meeting is a normal live session without a course, so the existing
-- join endpoint, 5-minute unlock, dashboard card, calendar and reminders are reused.
ALTER TABLE live_sessions ADD COLUMN free_session_id UUID REFERENCES free_sessions(id) ON DELETE RESTRICT;
ALTER TABLE live_sessions ALTER COLUMN course_id DROP NOT NULL;
ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_course_or_free_session
  CHECK (course_id IS NOT NULL OR free_session_id IS NOT NULL);
ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_free_session_shape
  CHECK (free_session_id IS NULL OR (course_id IS NULL AND offer_id IS NULL AND audience_student_ids IS NULL));
-- One upcoming meeting per campaign; finished and cancelled meetings stay as history.
CREATE UNIQUE INDEX live_sessions_one_active_per_free_session
  ON live_sessions (free_session_id) WHERE free_session_id IS NOT NULL AND status IN ('scheduled', 'live');

-- Compatibility with the held multi-audience migration (202611200004). If it was already
-- applied, widen its shape rule so course-less free-session rows remain valid.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_session_policy_shape'
             AND conrelid = 'live_sessions'::regclass) THEN
    ALTER TABLE live_sessions DROP CONSTRAINT live_session_policy_shape;
    ALTER TABLE live_sessions ADD CONSTRAINT live_session_policy_shape CHECK (
      (free_session_id IS NOT NULL AND access_policy = 'legacy')
      OR (access_policy = 'legacy' AND course_id IS NOT NULL)
      OR (access_policy = 'any_selected' AND course_id IS NULL AND offer_id IS NULL
          AND additional_offer_ids IS NULL AND audience_student_ids IS NULL)
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------
-- Backfill: keep the original /session campaign with its quiz, registrations and results.
-- Old values are read through ::text so any production column type works.
-- ---------------------------------------------------------------------------------------
INSERT INTO free_sessions (slug, title, subject, is_default)
VALUES ('decouverte', 'Séance gratuite', 'Informatique', true);

-- Copy the old /session subject and date when readable; otherwise keep the defaults
-- (the admin sets a new date from the campaign page).
DO $$
DECLARE
  old_subject TEXT;
  old_date TEXT;
BEGIN
  IF to_regclass('session_config') IS NULL THEN RETURN; END IF;
  EXECUTE $q$SELECT session_matiere::text, session_date::text FROM session_config WHERE id::text = '1'$q$
    INTO old_subject, old_date;
  IF NULLIF(btrim(old_subject), '') IS NOT NULL THEN
    UPDATE free_sessions SET subject = left(btrim(old_subject), 100) WHERE is_default;
  END IF;
  IF NULLIF(btrim(old_date), '') IS NOT NULL THEN
    BEGIN
      -- Dates saved without a time zone were entered in Tunisia (UTC+1).
      UPDATE free_sessions SET scheduled_at = CASE
        WHEN btrim(old_date) ~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN btrim(old_date)::timestamptz
        ELSE (btrim(old_date) || '+01:00')::timestamptz END
      WHERE is_default;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
      RAISE NOTICE 'Old /session date was not readable; left empty.';
    END;
  END IF;
END $$;

UPDATE session_questions SET free_session_id = (SELECT id FROM free_sessions WHERE is_default)
WHERE free_session_id IS NULL;

UPDATE session_registrations SET free_session_id = (SELECT id FROM free_sessions WHERE is_default)
WHERE free_session_id IS NULL;

-- Accounts already created through /session become participants of the default campaign
-- and keep "free session" as their original signup source.
INSERT INTO free_session_participants
  (free_session_id, user_id, source, score, total, tier, "group", registration_id)
SELECT r.free_session_id, u.id, 'new_signup',
       CASE WHEN btrim(r.score::text) ~ '^[0-9]{1,9}$' THEN btrim(r.score::text)::integer END,
       NULL, r.tier::text, r."group"::text, r.id
FROM session_registrations r
JOIN users u ON u.id::text = r.auth_user_id::text
WHERE r.account_activated::text IN ('true', 't')
ON CONFLICT (free_session_id, user_id) DO NOTHING;

UPDATE users u
SET signup_source = 'free_session', signup_free_session_id = r.free_session_id
FROM session_registrations r
WHERE r.auth_user_id::text = u.id::text AND r.account_activated::text IN ('true', 't')
  AND u.signup_source IS NULL;
