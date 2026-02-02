-- =====================================================
-- SYNTA ACADEMY - COMPATIBLE SCHEMA
-- Works with your existing Users table
-- =====================================================

-- First, let's see what tables might be causing conflicts
-- Run this to check existing tables:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Drop only our new tables if they exist (keeps your Users table)
DROP TABLE IF EXISTS purchases CASCADE;
DROP TABLE IF EXISTS offer_courses CASCADE;
DROP TABLE IF EXISTS offers CASCADE;
DROP TABLE IF EXISTS lesson_progress CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS lessons CASCADE;
DROP TABLE IF EXISTS modules CASCADE;
DROP TABLE IF EXISTS courses CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS check_lesson_access(UUID, UUID);
DROP FUNCTION IF EXISTS update_course_progress(UUID, UUID);

-- =====================================================
-- 1. COURSES TABLE
-- =====================================================
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'bac-info', 'bac-math', 'web-dev', etc.
  level TEXT, -- 'beginner', 'intermediate', 'advanced'
  thumbnail_url TEXT,
  price DECIMAL(10, 2) DEFAULT 0.00,
  is_free BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  instructor_id UUID, -- No FK to Users - we'll handle manually
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 2. MODULES TABLE (Course sections)
-- =====================================================
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 3. LESSONS TABLE
-- =====================================================
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL, -- 'video', 'pdf', 'quiz', 'text'
  duration INTEGER, -- in seconds for videos
  order_index INTEGER NOT NULL,
  
  -- R2 storage keys (NOT full URLs!)
  video_key TEXT, -- e.g., 'courses/bac-info/module1/lesson3/video.mp4'
  pdf_key TEXT,   -- e.g., 'courses/bac-info/module1/lesson3/notes.pdf'
  
  -- Preview settings
  is_preview BOOLEAN DEFAULT false, -- Free preview lessons
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 4. ENROLLMENTS TABLE (User access control)
-- Links to your existing Users table
-- =====================================================
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public."Users"(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  
  -- Enrollment details
  enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- NULL = lifetime access
  
  -- Payment tracking
  payment_id TEXT, -- Reference to payment gateway
  amount_paid DECIMAL(10, 2),
  
  -- Progress tracking
  progress INTEGER DEFAULT 0, -- 0-100%
  completed_lessons INTEGER DEFAULT 0,
  last_accessed TIMESTAMP WITH TIME ZONE,
  
  -- Ensure one enrollment per user per course
  UNIQUE(user_id, course_id)
);

-- =====================================================
-- 5. LESSON PROGRESS TABLE
-- =====================================================
CREATE TABLE lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public."Users"(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  
  -- Progress details
  completed BOOLEAN DEFAULT false,
  progress_percentage INTEGER DEFAULT 0,
  last_position INTEGER, -- For video resume (seconds)
  completed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, lesson_id)
);

-- =====================================================
-- 6. OFFERS TABLE (Special pricing/bundles)
-- =====================================================
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  discount_percentage INTEGER, -- 0-100
  fixed_price DECIMAL(10, 2),
  
  -- Offer validity
  valid_from TIMESTAMP WITH TIME ZONE,
  valid_until TIMESTAMP WITH TIME ZONE,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 7. OFFER_COURSES TABLE (Many-to-many)
-- =====================================================
CREATE TABLE offer_courses (
  offer_id UUID REFERENCES offers(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, course_id)
);

-- =====================================================
-- 8. PURCHASES TABLE (Transaction history)
-- =====================================================
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public."Users"(id),
  
  -- What was purchased
  course_id UUID REFERENCES courses(id),
  offer_id UUID REFERENCES offers(id),
  
  -- Payment details
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'TND',
  payment_method TEXT, -- 'card', 'cash', 'bank_transfer'
  payment_status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
  transaction_id TEXT,
  
  -- Timestamps
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  confirmed_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- INDEXES (Performance optimization)
-- =====================================================
CREATE INDEX idx_courses_category ON courses(category);
CREATE INDEX idx_courses_published ON courses(is_published);
CREATE INDEX idx_modules_course ON modules(course_id);
CREATE INDEX idx_lessons_module ON lessons(module_id);
CREATE INDEX idx_enrollments_user ON enrollments(user_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_lesson_progress_user ON lesson_progress(user_id);
CREATE INDEX idx_purchases_user ON purchases(user_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Courses: Anyone can read published courses
CREATE POLICY "Public courses are viewable by everyone"
  ON courses FOR SELECT
  USING (is_published = true);

-- Modules: Anyone can read modules of published courses
CREATE POLICY "Public modules are viewable"
  ON modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM courses 
      WHERE courses.id = modules.course_id 
      AND courses.is_published = true
    )
  );

-- Lessons: Anyone can read lessons of published courses
CREATE POLICY "Public lessons are viewable"
  ON lessons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM modules m
      JOIN courses c ON c.id = m.course_id
      WHERE m.id = lessons.module_id 
      AND c.is_published = true
    )
  );

-- Enrollments: Users can only see their own enrollments
CREATE POLICY "Users can view their own enrollments"
  ON enrollments FOR SELECT
  USING (user_id = (SELECT id FROM public."Users" WHERE id = enrollments.user_id LIMIT 1));

CREATE POLICY "Users can create their own enrollments"
  ON enrollments FOR INSERT
  WITH CHECK (user_id = (SELECT id FROM public."Users" WHERE id = enrollments.user_id LIMIT 1));

-- Lesson Progress: Users can manage their own progress
CREATE POLICY "Users can view their own progress"
  ON lesson_progress FOR SELECT
  USING (user_id = (SELECT id FROM public."Users" WHERE id = lesson_progress.user_id LIMIT 1));

CREATE POLICY "Users can update their own progress"
  ON lesson_progress FOR INSERT
  WITH CHECK (user_id = (SELECT id FROM public."Users" WHERE id = lesson_progress.user_id LIMIT 1));

CREATE POLICY "Users can modify their own progress"
  ON lesson_progress FOR UPDATE
  USING (user_id = (SELECT id FROM public."Users" WHERE id = lesson_progress.user_id LIMIT 1));

-- Purchases: Users can view their own purchases
CREATE POLICY "Users can view their own purchases"
  ON purchases FOR SELECT
  USING (user_id = (SELECT id FROM public."Users" WHERE id = purchases.user_id LIMIT 1));

-- =====================================================
-- FUNCTIONS (Helper functions)
-- =====================================================

-- Function to check if user has access to a lesson
CREATE OR REPLACE FUNCTION check_lesson_access(
  p_user_id UUID,
  p_lesson_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_course_id UUID;
  v_is_preview BOOLEAN;
  v_has_enrollment BOOLEAN;
BEGIN
  -- Get course and preview status
  SELECT m.course_id, l.is_preview
  INTO v_course_id, v_is_preview
  FROM lessons l
  JOIN modules m ON l.module_id = m.id
  WHERE l.id = p_lesson_id;
  
  -- Check if it's a preview lesson (free access)
  IF v_is_preview THEN
    RETURN TRUE;
  END IF;
  
  -- Check enrollment
  SELECT EXISTS(
    SELECT 1 FROM enrollments
    WHERE user_id = p_user_id
    AND course_id = v_course_id
    AND (expires_at IS NULL OR expires_at > NOW())
  ) INTO v_has_enrollment;
  
  RETURN v_has_enrollment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update course progress
CREATE OR REPLACE FUNCTION update_course_progress(
  p_user_id UUID,
  p_course_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_total_lessons INTEGER;
  v_completed_lessons INTEGER;
  v_progress INTEGER;
BEGIN
  -- Count total lessons in course
  SELECT COUNT(*)
  INTO v_total_lessons
  FROM lessons l
  JOIN modules m ON l.module_id = m.id
  WHERE m.course_id = p_course_id;
  
  -- Count completed lessons
  SELECT COUNT(*)
  INTO v_completed_lessons
  FROM lesson_progress lp
  JOIN lessons l ON lp.lesson_id = l.id
  JOIN modules m ON l.module_id = m.id
  WHERE lp.user_id = p_user_id
  AND m.course_id = p_course_id
  AND lp.completed = true;
  
  -- Calculate progress
  IF v_total_lessons > 0 THEN
    v_progress := (v_completed_lessons * 100) / v_total_lessons;
  ELSE
    v_progress := 0;
  END IF;
  
  -- Update enrollment
  UPDATE enrollments
  SET progress = v_progress,
      completed_lessons = v_completed_lessons,
      last_accessed = NOW()
  WHERE user_id = p_user_id
  AND course_id = p_course_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- SAMPLE DATA (For testing)
-- =====================================================

-- Insert sample courses
INSERT INTO courses (title, description, category, level, price, is_free, is_published) VALUES
('Programmation Python - Bac Info', 'Cours complet de Python pour le Baccalauréat Informatique', 'bac-info', 'beginner', 150.00, false, true),
('Mathématiques Avancées - Bac Math', 'Mathématiques niveau Bac avec exercices corrigés', 'bac-math', 'intermediate', 120.00, false, true),
('Introduction Gratuite', 'Découvrez Synta Academy', 'general', 'beginner', 0.00, true, true);

-- Add a sample module and lesson
INSERT INTO modules (course_id, title, description, order_index)
SELECT id, 'Module 1: Introduction', 'Découvrez les bases', 1
FROM courses WHERE title = 'Introduction Gratuite';

INSERT INTO lessons (module_id, title, description, type, order_index, is_preview)
SELECT id, 'Leçon 1: Bienvenue', 'Première leçon gratuite', 'video', 1, true
FROM modules WHERE title = 'Module 1: Introduction';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Database schema created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Your existing Users table is preserved.';
  RAISE NOTICE 'New tables created: courses, modules, lessons, enrollments, etc.';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Add Supabase credentials to backend/.env file';
  RAISE NOTICE '2. Update backend/config/supabase.js if needed';
  RAISE NOTICE '3. Start your backend: npm start';
END $$;

-- =====================================================
-- ADD BALANCE COLUMN TO USERS TABLE
-- =====================================================
-- Add balance column to existing Users table if it doesn't exist
ALTER TABLE public."Users" 
ADD COLUMN IF NOT EXISTS balance DECIMAL(10, 2) DEFAULT 0.00;

-- Create index for balance queries
CREATE INDEX IF NOT EXISTS idx_users_balance ON public."Users"(balance);

-- Success notice for balance column
DO $$
BEGIN
  RAISE NOTICE '✅ Balance column added to Users table!';
  RAISE NOTICE 'Users can now have DT (Tunisian Dinar) balance tracking.';
END $$;
