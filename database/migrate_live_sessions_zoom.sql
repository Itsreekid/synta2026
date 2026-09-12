-- ====================================================================
-- LIVE SESSIONS SCHEMA UPDATE
-- Run this in the Supabase SQL Editor
-- Adds Zoom fields, offer-based access control, and missing columns
-- ====================================================================

-- 1. Add Zoom meeting fields
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS zoom_meeting_id TEXT,
  ADD COLUMN IF NOT EXISTS zoom_join_url   TEXT,
  ADD COLUMN IF NOT EXISTS zoom_start_url  TEXT,  -- HOST only, never exposed to students
  ADD COLUMN IF NOT EXISTS zoom_password   TEXT;

-- 2. Add offer-based access control
--    If set, only students who purchased this specific offer can join.
--    If NULL, any enrolled student can join.
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL;

-- 3. Rename the old generic join_url column if it exists (safe migration)
-- ALTER TABLE public.live_sessions RENAME COLUMN join_url TO zoom_join_url;

-- 4. Add offer_id tracking to enrollments (tracks which offer granted access)
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL;

-- 5. Update RLS: Students can only see sessions for courses they're enrolled in.
--    The API layer handles the offer_id filtering (more flexible than RLS alone).
DROP POLICY IF EXISTS "Users can view live sessions for their enrolled courses" ON public.live_sessions;

CREATE POLICY "Users can view live sessions for their enrolled courses"
  ON public.live_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE enrollments.user_id = auth.uid()
        AND enrollments.course_id = live_sessions.course_id
    )
  );

-- 6. Admins (service role) have full access — no RLS restriction needed
--    The service role key bypasses RLS by design.

-- 7. Add performance index on offer_id
CREATE INDEX IF NOT EXISTS idx_live_sessions_offer ON public.live_sessions(offer_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_offer   ON public.enrollments(offer_id);
