-- =====================================================
-- ADMIN ROLE SETUP
-- =====================================================

-- 1. Add role column to the Users table
ALTER TABLE public."Users" 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student';

-- 2. Create index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON public."Users"(role);

-- 3. Update existing status/type to role if needed (Optional)
-- UPDATE public."Users" SET role = 'student' WHERE role IS NULL;

-- 4. How to set yourself as admin:
-- Replace 'your-email@example.com' with your actual email
-- UPDATE public."Users" SET role = 'admin' WHERE email = 'your-email@example.com';

-- 5. Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Role column added to Users table!';
  RAISE NOTICE 'Users now support student and admin roles.';
END $$;
