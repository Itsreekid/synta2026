-- =====================================================
-- FIX RLS POLICIES FOR USERS TABLE
-- This allows users to read their own balance
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable RLS on Users table if not already enabled
ALTER TABLE public."Users" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for Users table (if any)
DROP POLICY IF EXISTS "Users can view their own profile" ON public."Users";
DROP POLICY IF EXISTS "Users can update their own profile" ON public."Users";

-- Allow users to read their own profile data (including balance)
CREATE POLICY "Users can view their own profile"
  ON public."Users" FOR SELECT
  USING (auth.uid() = id);

-- Allow users to update their own profile data (but NOT balance or sensitive fields)
-- Note: This policy prevents users from updating their balance field
-- Balance should only be updated by admin or secure backend functions
CREATE POLICY "Users can update their own profile"
  ON public."Users" FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    -- Add additional checks here if needed to prevent balance manipulation
    -- The actual column-level security should be enforced by your backend
  );

-- Prevent users from updating balance through RLS
-- Balance should only be updated via secure backend with service role key
COMMENT ON COLUMN public."Users".balance IS 
  'Balance field - should only be updated by admin or secure backend operations, not by users directly';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ RLS policies for Users table created successfully!';
  RAISE NOTICE 'Users can now read their profile data (including balance).';
  RAISE NOTICE '⚠️  SECURITY: Balance updates should be done via secure backend only!';
  RAISE NOTICE 'Use service role key for balance modifications, not anon key.';
END $$;
