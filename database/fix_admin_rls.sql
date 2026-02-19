-- =====================================================
-- ADMIN RLS POLICIES FIX
-- Use this to allow admins to see all data
-- =====================================================

-- 1. Helper function to check admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT (role = 'admin')
    FROM public."Users"
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Grant admin access to public."Users"
DROP POLICY IF EXISTS "Admins can view all users" ON public."Users";
CREATE POLICY "Admins can view all users" ON public."Users"
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update users" ON public."Users";
CREATE POLICY "Admins can update users" ON public."Users"
  FOR UPDATE USING (public.is_admin());

-- 3. Grant admin access to public.offers
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage offers" ON public.offers;
CREATE POLICY "Admins can manage offers" ON public.offers
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Everyone can view active offers" ON public.offers;
CREATE POLICY "Everyone can view active offers" ON public.offers
  FOR SELECT USING (is_active = true OR public.is_admin());

-- 4. Grant admin access to public.purchases
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view all purchases" ON public.purchases;
CREATE POLICY "Admins can view all purchases" ON public.purchases
  FOR SELECT USING (public.is_admin());

-- 5. Grant admin access to public.enrollments
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage enrollments" ON public.enrollments;
CREATE POLICY "Admins can manage enrollments" ON public.enrollments
  FOR ALL USING (public.is_admin());

-- 6. Grant admin access to public.courses, modules, lessons
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage courses" ON public.courses;
CREATE POLICY "Admins can manage courses" ON public.courses
  FOR ALL USING (public.is_admin());

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage modules" ON public.modules;
CREATE POLICY "Admins can manage modules" ON public.modules
  FOR ALL USING (public.is_admin());

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage lessons" ON public.lessons;
CREATE POLICY "Admins can manage lessons" ON public.lessons
  FOR ALL USING (public.is_admin());
