// =====================================================
// LIVE SESSIONS API ROUTES
// =====================================================
import express from "express";
import { authApiMiddleware } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { supabaseAdmin } from "../config/supabase.js";
import { createZoomMeeting, deleteZoomMeeting } from "../utils/zoomClient.js";

const router = express.Router();

// ─── STUDENT-FACING ROUTES ────────────────────────────────────────────────────

/**
 * GET /api/live/upcoming
 * Get upcoming live sessions for the current user's enrolled courses.
 * If a session has an offer_id, the user must have purchased that specific offer.
 * FIX #4: Uses authApiMiddleware (returns 401 if not authenticated).
 * FIX #6: Explicit column select — zoom_start_url is NEVER returned.
 */
router.get("/upcoming", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get courses the user is enrolled in, with the offer_id that granted access
    const { data: enrollments, error: enrollError } = await supabaseAdmin
      .from("enrollments")
      .select("course_id, offer_id")
      .eq("user_id", userId);

    if (enrollError) throw enrollError;

    const enrolledCourseIds = enrollments.map((e) => e.course_id);
    if (enrolledCourseIds.length === 0) return res.json([]);

    // Build a map: course_id → Set of offer_ids the user has for that course
    const offerMap = {};
    for (const e of enrollments) {
      if (!offerMap[e.course_id]) offerMap[e.course_id] = new Set();
      if (e.offer_id) offerMap[e.course_id].add(e.offer_id);
    }

    // FIX #6: Explicit columns only — zoom_start_url intentionally excluded
    const { data: sessions, error: sessionError } = await supabaseAdmin
      .from("live_sessions")
      .select(`
        id,
        title,
        description,
        scheduled_at,
        duration_minutes,
        status,
        offer_id,
        zoom_join_url,
        replay_url,
        course:courses(title, thumbnail_url)
      `)
      .in("course_id", enrolledCourseIds)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true });

    if (sessionError) throw sessionError;

    // Filter: if session requires a specific offer, user must have purchased it
    const accessible = sessions.filter((s) => {
      if (!s.offer_id) return true; // No offer restriction — any enrollee can join
      return offerMap[s.course_id]?.has(s.offer_id) ?? false;
    });

    // Strip the offer_id from the response (internal field)
    const response = accessible.map(({ offer_id, ...s }) => s);

    res.json(response);
  } catch (error) {
    console.error("Error fetching live sessions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/live/replays
 * Get past live sessions (replays) for the current user's enrolled courses.
 * FIX #4: Uses authApiMiddleware.
 * FIX #6: Explicit column select.
 */
router.get("/replays", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: enrollments } = await supabaseAdmin
      .from("enrollments")
      .select("course_id")
      .eq("user_id", userId);

    const enrolledCourseIds = enrollments?.map((e) => e.course_id) || [];
    if (enrolledCourseIds.length === 0) return res.json([]);

    // FIX #6: Explicit columns only
    const { data: replays, error } = await supabaseAdmin
      .from("live_sessions")
      .select(`
        id,
        title,
        description,
        scheduled_at,
        duration_minutes,
        replay_url,
        course:courses(title)
      `)
      .in("course_id", enrolledCourseIds)
      .lt("scheduled_at", new Date().toISOString())
      .not("replay_url", "is", null)
      .order("scheduled_at", { ascending: false });

    if (error) throw error;

    res.json(replays);
  } catch (error) {
    console.error("Error fetching replays:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── ADMIN / TEACHER ROUTES ───────────────────────────────────────────────────

/**
 * POST /api/live/schedule
 * Create a new live session + Zoom meeting. Admin only.
 * FIX #1: Protected by requireAdmin middleware.
 * FIX #5: Creates a real Zoom meeting via S2S OAuth.
 *
 * Body: { courseId, title, startTime, durationMinutes }
 */
router.post("/schedule", requireAdmin, async (req, res) => {
  const { courseId, offerId, title, description, startTime, startTimes, durationMinutes = 60 } = req.body;

  // Normalize to an array of times
  const times = startTimes && startTimes.length > 0 ? startTimes : (startTime ? [startTime] : []);

  if (!courseId || !title || times.length === 0) {
    return res.status(400).json({ error: "courseId, title, and at least one startTime are required" });
  }

  try {
    const isRecurring = times.length > 1;
    // Create the Zoom meeting ONCE (Type 3 if recurring, Type 2 if single)
    const { zoom_meeting_id, zoom_join_url, zoom_start_url, zoom_password } =
      await createZoomMeeting({ topic: title, startTime: times[0], durationMinutes, isRecurring });

    // Prepare rows for bulk insert
    const sessionsToInsert = times.map(time => ({
      course_id: courseId,
      offer_id: offerId || null,
      title,
      description: description || null,
      scheduled_at: time,
      duration_minutes: durationMinutes,
      zoom_meeting_id,
      zoom_join_url,
      zoom_start_url, // Stored in DB, never sent to student endpoints
      zoom_password,
      status: "scheduled",
    }));

    // Store in database
    const { data: sessions, error } = await supabaseAdmin
      .from("live_sessions")
      .insert(sessionsToInsert)
      .select("id, title, scheduled_at, zoom_meeting_id, zoom_start_url, zoom_join_url, offer_id");

    if (error) throw error;

    // Return full session data to admin (including zoom_start_url for the host)
    res.status(201).json({ success: true, sessions });
  } catch (error) {
    console.error("Error scheduling live session:", error);
    res.status(500).json({ error: error.message || "Failed to create session" });
  }
});

/**
 * DELETE /api/live/:sessionId
 * Cancel and delete a session + its Zoom meeting. Admin only.
 * FIX #1: Protected by requireAdmin middleware.
 */
router.delete("/:sessionId", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const { data: session, error: fetchError } = await supabaseAdmin
      .from("live_sessions")
      .select("zoom_meeting_id")
      .eq("id", sessionId)
      .single();

    if (fetchError || !session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Delete from Zoom
    if (session.zoom_meeting_id) {
      await deleteZoomMeeting(session.zoom_meeting_id);
    }

    // Delete from DB
    const { error: deleteError } = await supabaseAdmin
      .from("live_sessions")
      .delete()
      .eq("id", sessionId);

    if (deleteError) throw deleteError;

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting live session:", error);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

/**
 * GET /api/live/admin/sessions
 * List all sessions with full data including zoom_start_url. Admin only.
 * FIX #1: Protected by requireAdmin middleware.
 */
router.get("/admin/sessions", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("live_sessions")
      .select(`
        *,
        course:courses(title)
      `)
      .order("scheduled_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Error fetching admin sessions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
