-- ====================================================================
-- FREE SESSION REGISTRATIONS - MIGRATION SCRIPT
-- Run this in the Supabase SQL Editor
-- ====================================================================

-- 1. Create the new tracking table
CREATE TABLE IF NOT EXISTS public.free_session_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public."Users"(id) ON DELETE CASCADE,
    academic_level TEXT,
    assigned_group TEXT,
    quiz_score INTEGER DEFAULT 0,
    quiz_details JSONB,
    registered_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Optional: Add an index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_free_session_user_id ON public.free_session_registrations(user_id);

-- 3. Enable RLS (Row Level Security)
ALTER TABLE public.free_session_registrations ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies
-- Allow admins (or service role) full access
CREATE POLICY "Enable ALL for service-role only" 
ON public.free_session_registrations 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 5. Add filier column to session_registrations (Requested feature update)
ALTER TABLE public.session_registrations ADD COLUMN IF NOT EXISTS filier TEXT;
