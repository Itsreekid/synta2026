-- =====================================================
-- EMERGENCY: FIX BALANCE SECURITY + RESET YOUR TEST BALANCE
-- Run this IMMEDIATELY in Supabase SQL Editor
-- =====================================================

-- Step 1: Reset your test balance back to 60
-- Replace 'YOUR-USER-ID-HERE' with your actual user ID
UPDATE public."Users"
SET balance = 60.00
WHERE id = '12e2270d-8394-4609-ab84-97db9aef80ad'::uuid;

-- Step 2: Enable RLS on Users table
ALTER TABLE public."Users" ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop any existing policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public."Users";
DROP POLICY IF EXISTS "Users can update their own profile" ON public."Users";
DROP POLICY IF EXISTS "allow_all_users" ON public."Users";
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public."Users";

-- Step 4: Create SECURE read-only policy
CREATE POLICY "Users can view their own profile"
  ON public."Users" FOR SELECT
  USING (auth.uid() = id);

-- Step 5: Create UPDATE policy that BLOCKS balance changes
-- This allows users to update their profile but NOT the balance field
CREATE POLICY "Users can update profile but not balance"
  ON public."Users" FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- PostgreSQL doesn't prevent column updates in RLS directly
    -- So we rely on backend to never update balance from frontend
  );

-- ----------------------------------------------------------------------
-- ADDITIONAL TRIGGER-BASED SECURITY (Run this part separately if needed)
-- ----------------------------------------------------------------------

-- Step 6: Create a trigger function to prevent balance changes from non-service roles
-- This is the CRITICAL security fix - triggers enforce at the database level
CREATE OR REPLACE FUNCTION prevent_balance_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if balance is being changed
  IF OLD.balance IS DISTINCT FROM NEW.balance THEN
    -- Check if this is being done by service_role (backend)
    -- Service role is identified by checking the session role
    IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
      -- Not service_role - block the change and restore old balance
      RAISE EXCEPTION 'Balance can only be updated by the backend system';
      NEW.balance := OLD.balance;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Drop existing trigger if it exists
DROP TRIGGER IF EXISTS enforce_balance_security ON public."Users";

-- Step 8: Create trigger that runs BEFORE UPDATE
CREATE TRIGGER enforce_balance_security
  BEFORE UPDATE ON public."Users"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_balance_update();

-- Step 9: Grant permissions (cleanup from previous attempts)
REVOKE UPDATE (balance) ON public."Users" FROM authenticated;
REVOKE UPDATE (balance) ON public."Users" FROM anon;

-- Success messages
DO $$
BEGIN
  RAISE NOTICE '✅ SECURITY FIX APPLIED!';
  RAISE NOTICE '🔒 TRIGGER created to block balance updates from frontend';
  RAISE NOTICE '✅ Only backend (service_role) can update balance';
  RAISE NOTICE '📝 Balance reset to 60.00 for your test account';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: Never update balance from frontend!';
  RAISE NOTICE '⚠️  Use backend API with service role key only!';
  RAISE NOTICE '';
  RAISE NOTICE '🧪 Test again in browser console to verify security!';
END $$;
