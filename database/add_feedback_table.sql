-- =====================================================
-- TABLE: lesson_feedback
-- Tracks student feedback on specific lessons
-- =====================================================

CREATE TABLE IF NOT EXISTS lesson_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, -- e.g., 'Je n''ai pas compris l''explication', 'Exercice difficile', etc.
  additional_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_lesson_feedback_lesson_id ON lesson_feedback(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_feedback_user_id ON lesson_feedback(user_id);
