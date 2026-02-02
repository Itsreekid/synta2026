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

-- Allow users to update their own profile data
CREATE POLICY "Users can update their own profile"
  ON public."Users" FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ RLS policies for Users table created successfully!';
  RAISE NOTICE 'Users can now read and update their own balance.';
END $$;
