CREATE TABLE IF NOT EXISTS learning_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  live_session_id UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learning_resources_single_owner CHECK ((lesson_id IS NOT NULL) <> (live_session_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_learning_resources_lesson ON learning_resources(lesson_id, created_at);
CREATE INDEX IF NOT EXISTS idx_learning_resources_live_session ON learning_resources(live_session_id, created_at);
