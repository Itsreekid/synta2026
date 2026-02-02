-- =====================================================
-- SECURE COURSES TABLE - PREVENT PRICE MANIPULATION
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Enable RLS on courses table (if not already enabled)
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policies for courses
DROP POLICY IF EXISTS "Public courses are viewable" ON public.courses;
DROP POLICY IF EXISTS "Anyone can view published courses" ON public.courses;
DROP POLICY IF EXISTS "Only backend can modify courses" ON public.courses;
DROP POLICY IF EXISTS "Enable all for service_role" ON public.courses;

-- Step 3: Create read-only policy for published courses
-- Users can view published courses but cannot modify them
CREATE POLICY "Anyone can view published courses"
  ON public.courses FOR SELECT
  USING (is_published = true);

-- Step 4: Prevent users from inserting, updating, or deleting courses
-- Only service_role (backend) should be able to do this
CREATE POLICY "Only backend can modify courses"
  ON public.courses FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ----------------------------------------------------------------------
-- TRIGGER-BASED SECURITY FOR COURSES
-- ----------------------------------------------------------------------

-- Step 5: Create trigger function to prevent price/critical field manipulation
CREATE OR REPLACE FUNCTION prevent_course_critical_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if any critical field is being changed
  IF (
    OLD.price IS DISTINCT FROM NEW.price OR
    OLD.is_free IS DISTINCT FROM NEW.is_free OR
    OLD.is_published IS DISTINCT FROM NEW.is_published
  ) THEN
    -- Check if this is being done by service_role (backend)
    IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
      -- Not service_role - block the change and restore old values
      RAISE EXCEPTION 'Course price, is_free, and is_published can only be updated by the backend system';
      NEW.price := OLD.price;
      NEW.is_free := OLD.is_free;
      NEW.is_published := OLD.is_published;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Drop existing trigger if it exists
DROP TRIGGER IF EXISTS enforce_course_security ON public.courses;

-- Step 7: Create trigger that runs BEFORE UPDATE
CREATE TRIGGER enforce_course_security
  BEFORE UPDATE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_course_critical_updates();

-- Step 8: Prevent INSERT of courses by users
CREATE OR REPLACE FUNCTION prevent_course_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Only service_role can insert courses
  IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Only backend can create courses';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Create INSERT trigger
DROP TRIGGER IF EXISTS enforce_course_insert_security ON public.courses;

CREATE TRIGGER enforce_course_insert_security
  BEFORE INSERT ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_course_insert();

-- Step 10: Prevent DELETE of courses by users
CREATE OR REPLACE FUNCTION prevent_course_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only service_role can delete courses
  IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Only backend can delete courses';
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Create DELETE trigger
DROP TRIGGER IF EXISTS enforce_course_delete_security ON public.courses;

CREATE TRIGGER enforce_course_delete_security
  BEFORE DELETE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_course_delete();

-- ----------------------------------------------------------------------
-- ADDITIONAL SECURITY FOR OTHER TABLES
-- ----------------------------------------------------------------------

-- Secure modules table
CREATE OR REPLACE FUNCTION prevent_module_manipulation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Only backend can modify modules';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_module_security_insert ON public.modules;
DROP TRIGGER IF EXISTS enforce_module_security_update ON public.modules;
DROP TRIGGER IF EXISTS enforce_module_security_delete ON public.modules;

CREATE TRIGGER enforce_module_security_insert
  BEFORE INSERT ON public.modules
  FOR EACH ROW EXECUTE FUNCTION prevent_module_manipulation();

CREATE TRIGGER enforce_module_security_update
  BEFORE UPDATE ON public.modules
  FOR EACH ROW EXECUTE FUNCTION prevent_module_manipulation();

CREATE TRIGGER enforce_module_security_delete
  BEFORE DELETE ON public.modules
  FOR EACH ROW EXECUTE FUNCTION prevent_module_manipulation();

-- Secure lessons table
CREATE OR REPLACE FUNCTION prevent_lesson_manipulation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Only backend can modify lessons';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_lesson_security_insert ON public.lessons;
DROP TRIGGER IF EXISTS enforce_lesson_security_update ON public.lessons;
DROP TRIGGER IF EXISTS enforce_lesson_security_delete ON public.lessons;

CREATE TRIGGER enforce_lesson_security_insert
  BEFORE INSERT ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION prevent_lesson_manipulation();

CREATE TRIGGER enforce_lesson_security_update
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION prevent_lesson_manipulation();

CREATE TRIGGER enforce_lesson_security_delete
  BEFORE DELETE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION prevent_lesson_manipulation();

-- Success messages
DO $$
BEGIN
  RAISE NOTICE '✅ COURSE SECURITY APPLIED!';
  RAISE NOTICE '🔒 Users CANNOT modify course prices, is_free, or is_published';
  RAISE NOTICE '🔒 Users CANNOT create, update, or delete courses';
  RAISE NOTICE '🔒 Users CANNOT modify modules or lessons';
  RAISE NOTICE '✅ Only backend (service_role) can manage course content';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Test the security using the provided console tests!';
END $$;
