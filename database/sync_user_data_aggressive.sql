-- =====================================================
-- FORCED DATA SYNC (AGGRESSIVE VERSION)
-- Run this in your Supabase SQL Editor
-- =====================================================

-- 1. Explicitly update fullname, class, and branch from metadata
-- This overwrites WHATEVER is currently in the table if metadata exists
UPDATE public."Users" u
SET 
  fullname = COALESCE(
    au.raw_user_meta_data->>'full_name', 
    au.raw_user_meta_data->>'fullname',
    u.fullname -- keep current if metadata is totally missing
  ),
  class = COALESCE(
    au.raw_user_meta_data->>'user_class', 
    au.raw_user_meta_data->>'class'
  ),
  branch = COALESCE(
    au.raw_user_meta_data->>'user_branch', 
    au.raw_user_meta_data->>'branch'
  )
FROM auth.users au
WHERE u.id = au.id;

-- 2. Verify update (this will show you the first 10 users to confirm)
-- SELECT id, email, fullname, class, branch FROM public."Users" LIMIT 10;
