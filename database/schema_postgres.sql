-- =====================================================
-- SYNTA ACADEMY — SELF-HOSTED POSTGRES SCHEMA
-- Run this on your Coolify Postgres database BEFORE
-- deploying the backend for the first time.
--
-- Run via: psql $DATABASE_URL -f schema_postgres.sql
-- Or paste into Coolify's DB terminal.
-- =====================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
  balance       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  class         TEXT,
  branch        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── COURSES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  level         TEXT,
  price         NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_free       BOOLEAN NOT NULL DEFAULT false,
  is_published  BOOLEAN NOT NULL DEFAULT false,
  thumbnail_url TEXT,
  thumbnail_key TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── MODULES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── LESSONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  type        TEXT,         -- 'video' | 'pdf' | 'quiz'
  video_key   TEXT,
  pdf_key     TEXT,
  duration    INTEGER,      -- seconds
  order_index INTEGER NOT NULL DEFAULT 0,
  is_preview  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── OFFERS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  fixed_price     NUMERIC(10, 2),
  price           NUMERIC(10, 2),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  valid_until     TIMESTAMPTZ,
  target_classes  TEXT[],
  target_branches TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offer_courses (
  offer_id  UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, course_id)
);

-- ─── ENROLLMENTS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  offer_id          UUID REFERENCES offers(id),
  payment_id        TEXT,
  amount_paid       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  progress          NUMERIC(5, 2) NOT NULL DEFAULT 0,  -- percentage
  completed         BOOLEAN NOT NULL DEFAULT false,
  completed_lessons INTEGER NOT NULL DEFAULT 0,
  enrolled_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed     TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  UNIQUE (user_id, course_id)
);

-- ─── PURCHASES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id      UUID REFERENCES courses(id),
  amount         NUMERIC(10, 2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  transaction_id TEXT,
  purchased_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at   TIMESTAMPTZ
);

-- ─── PAYMENTS (offer payments) ───────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_id   UUID REFERENCES offers(id),
  amount     NUMERIC(10, 2) NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── TRANSACTIONS (balance ledger) ────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      NUMERIC(10, 2) NOT NULL,
  type        TEXT NOT NULL,   -- 'credit' | 'debit'
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── LESSON PROGRESS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id           UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed           BOOLEAN NOT NULL DEFAULT false,
  progress_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  last_position       INTEGER NOT NULL DEFAULT 0,  -- seconds
  completed_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, lesson_id)
);

-- ─── LIVE SESSIONS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  offer_id         UUID REFERENCES offers(id),
  title            TEXT NOT NULL,
  description      TEXT,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  status           TEXT NOT NULL DEFAULT 'scheduled',  -- 'scheduled' | 'live' | 'completed'
  zoom_meeting_id  TEXT,
  zoom_join_url    TEXT,
  zoom_start_url   TEXT,  -- NEVER expose to students
  zoom_password    TEXT,
  replay_url       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── QUIZ RESPONSES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id       UUID REFERENCES lessons(id),
  question_id     TEXT,
  category        TEXT,
  selected_option TEXT,
  is_correct      BOOLEAN NOT NULL DEFAULT false,
  points_earned   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── USER WEAK TOPICS (materialized view or table) ───
CREATE TABLE IF NOT EXISTS user_weak_topics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,
  success_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  attempts     INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, category)
);

-- ─── SESSION ONBOARDING TABLES ────────────────────────
CREATE TABLE IF NOT EXISTS session_registrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         TEXT NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  phone             TEXT NOT NULL,
  track             TEXT,
  filier            TEXT,
  score             INTEGER,
  tier              TEXT,           -- 'explorer' | 'challenger' | 'elite'
  "group"           TEXT,           -- 'beginner' | 'advanced'
  completed         BOOLEAN NOT NULL DEFAULT false,
  account_activated BOOLEAN NOT NULL DEFAULT false,
  auth_user_id      UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text           TEXT NOT NULL,
  type           TEXT NOT NULL,    -- 'multiple_choice' | 'drag_drop'
  options        JSONB NOT NULL,
  correct_answer JSONB NOT NULL,
  explanation    TEXT,
  order_index    INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES session_registrations(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES session_questions(id) ON DELETE CASCADE,
  answer          JSONB,
  is_correct      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (registration_id, question_id)
);

CREATE TABLE IF NOT EXISTS session_config (
  id               INTEGER PRIMARY KEY DEFAULT 1,
  session_date     TIMESTAMPTZ,
  session_matiere  TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default session config row
INSERT INTO session_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─── INDEXES (performance) ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_enrollments_user      ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course     ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user   ON lesson_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_course   ON live_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_scheduled ON live_sessions(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user      ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_user    ON quiz_responses(user_id);
