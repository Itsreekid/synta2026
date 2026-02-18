-- Create live_sessions table
CREATE TABLE IF NOT EXISTS live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  join_url TEXT, -- Zoom/Meet link
  replay_url TEXT, -- Link to recording after session
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'live', 'completed', 'cancelled'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for performance
CREATE INDEX idx_live_sessions_course ON live_sessions(course_id);
CREATE INDEX idx_live_sessions_scheduled ON live_sessions(scheduled_at);

-- RLS Policies
ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view live sessions for their enrolled courses"
  ON live_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM enrollments
      WHERE enrollments.user_id = auth.uid()
      AND enrollments.course_id = live_sessions.course_id
    )
  );
