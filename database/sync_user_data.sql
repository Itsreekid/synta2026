-- =====================================================
-- SYNC USER DATA (ALIGNED WITH YOUR SCHEMA)
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Sync existing data from auth.users metadata to public."Users"
UPDATE public."Users" u
SET 
  fullname = COALESCE(fullname, au.raw_user_meta_data->>'full_name'),
  class = COALESCE(class, au.raw_user_meta_data->>'user_class'),
  branch = COALESCE(branch, au.raw_user_meta_data->>'user_branch')
FROM auth.users au
WHERE u.id = au.id;

-- 2. Sync trigger for profile updates
CREATE OR REPLACE FUNCTION public.sync_user_metadata()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public."Users"
  SET 
    fullname = (NEW.raw_user_meta_data->>'full_name'),
    class = (NEW.raw_user_meta_data->>'user_class'),
    branch = (NEW.raw_user_meta_data->>'user_branch')
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_metadata();

-- 3. Trigger for new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user_metadata()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public."Users" (id, email, fullname, class, branch, role)
  VALUES (
    NEW.id, 
    NEW.email, 
    (NEW.raw_user_meta_data->>'full_name'),
    (NEW.raw_user_meta_data->>'user_class'),
    (NEW.raw_user_meta_data->>'user_branch'),
    'student'
  )
  ON CONFLICT (id) DO UPDATE SET
    fullname = EXCLUDED.fullname,
    class = EXCLUDED.class,
    branch = EXCLUDED.branch;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_metadata();
