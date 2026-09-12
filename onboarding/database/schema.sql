-- =====================================================
-- Synta Academy — VIP Onboarding Schema
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Session Registrations
CREATE TABLE IF NOT EXISTS session_registrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  phone       TEXT NOT NULL,
  track       TEXT CHECK (track IN ('2eme', '3eme', 'bac')),
  score       INTEGER DEFAULT 0,
  tier        TEXT CHECK (tier IN ('explorer', 'challenger', 'elite')) DEFAULT 'explorer',
  completed   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE session_registrations ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (used by Next.js API routes)
CREATE POLICY "Service role full access on registrations"
  ON session_registrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Session Questions (Admin-managed)
CREATE TYPE question_type AS ENUM ('multiple_choice', 'drag_drop', 'short_input');

CREATE TABLE IF NOT EXISTS session_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text           TEXT NOT NULL,
  type           question_type NOT NULL DEFAULT 'multiple_choice',
  options        JSONB NOT NULL DEFAULT '[]',
  correct_answer JSONB NOT NULL DEFAULT '""',
  explanation    TEXT,
  order_index    INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE session_questions ENABLE ROW LEVEL SECURITY;

-- Public can read active questions (fetched by the wizard)
CREATE POLICY "Public can read active questions"
  ON session_questions
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Service role can do everything (admin panel)
CREATE POLICY "Service role full access on questions"
  ON session_questions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Session Submissions (per-question answers)
CREATE TABLE IF NOT EXISTS session_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES session_registrations(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES session_questions(id) ON DELETE CASCADE,
  answer          JSONB NOT NULL,
  is_correct      BOOLEAN DEFAULT false,
  submitted_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(registration_id, question_id)
);

ALTER TABLE session_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on submissions"
  ON session_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_session_registrations_email ON session_registrations(email);
CREATE INDEX IF NOT EXISTS idx_session_questions_order ON session_questions(order_index) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_session_submissions_reg ON session_submissions(registration_id);

-- 5. Seed sample questions
INSERT INTO session_questions (text, type, options, correct_answer, order_index, is_active) VALUES
(
  'What is the output of: print(2 ** 3)?',
  'multiple_choice',
  '[
    {"id": "a", "label": "6"},
    {"id": "b", "label": "8"},
    {"id": "c", "label": "9"},
    {"id": "d", "label": "23"}
  ]',
  '"b"',
  1,
  true
),
(
  'Arrange these steps to correctly describe how a FOR loop works:',
  'drag_drop',
  '[
    {"id": "1", "label": "Check the condition"},
    {"id": "2", "label": "Initialize the counter"},
    {"id": "3", "label": "Execute the loop body"},
    {"id": "4", "label": "Increment the counter"}
  ]',
  '["2", "1", "3", "4"]',
  2,
  true
),
(
  'Which data structure uses LIFO (Last In, First Out)?',
  'multiple_choice',
  '[
    {"id": "a", "label": "Queue"},
    {"id": "b", "label": "Stack"},
    {"id": "c", "label": "Array"},
    {"id": "d", "label": "Tree"}
  ]',
  '"b"',
  3,
  true
);
