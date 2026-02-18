-- Create quiz_responses table for advanced analytics
CREATE TABLE IF NOT EXISTS quiz_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL, -- Logical ID of the question in the JSON/Frontend
  category TEXT, -- e.g., 'Physics-Motion', 'Math-Algebra'
  selected_option TEXT,
  is_correct BOOLEAN,
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for analysis
CREATE INDEX idx_quiz_responses_user_category ON quiz_responses(user_id, category);
CREATE INDEX idx_quiz_responses_lesson ON quiz_responses(lesson_id);

-- RLS Policies
ALTER TABLE quiz_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own quiz responses"
  ON quiz_responses FOR ALL
  USING (auth.uid() = user_id);

-- View for "Weak Topics"
CREATE OR REPLACE VIEW user_weak_topics AS
SELECT 
  user_id,
  category,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE is_correct = false) as failed_attempts,
  ROUND((COUNT(*) FILTER (WHERE is_correct = true) * 100.0) / COUNT(*), 2) as success_rate
FROM quiz_responses
GROUP BY user_id, category
HAVING COUNT(*) >= 3; -- Analyze after at least 3 attempts
