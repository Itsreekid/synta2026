ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS content JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN lessons.content IS 'Structured lesson payload; interactive quizzes use {version: 1, questions: [...] }';
