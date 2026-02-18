// =====================================================
// LIVE SESSIONS API ROUTES
// =====================================================
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { supabaseAdmin } from "../config/supabase.js";

const router = express.Router();

/**
 * GET /api/live/upcoming
 * Get upcoming live sessions for the current user's enrolled courses
 */
router.get("/upcoming", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // First get the courses the user is enrolled in
        const { data: enrollments, error: enrollError } = await supabaseAdmin
            .from("enrollments")
            .select("course_id")
            .eq("user_id", userId);

        if (enrollError) throw enrollError;

        const enrolledCourseIds = enrollments.map(e => e.course_id);

        if (enrolledCourseIds.length === 0) {
            return res.json([]);
        }

        // Now get live sessions for those courses
        const { data: sessions, error: sessionError } = await supabaseAdmin
            .from("live_sessions")
            .select(`
        *,
        course:courses(title, thumbnail_url)
      `)
            .in("course_id", enrolledCourseIds)
            .gte("scheduled_at", new Date().toISOString())
            .order("scheduled_at", { ascending: true });

        if (sessionError) throw sessionError;

        res.json(sessions);
    } catch (error) {
        console.error("Error fetching live sessions:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * GET /api/live/replays
 * Get past live sessions (replays) for the current user's enrolled courses
 */
router.get("/replays", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: enrollments } = await supabaseAdmin
            .from("enrollments")
            .select("course_id")
            .eq("user_id", userId);

        const enrolledCourseIds = enrollments?.map(e => e.course_id) || [];

        if (enrolledCourseIds.length === 0) return res.json([]);

        const { data: replays, error } = await supabaseAdmin
            .from("live_sessions")
            .select(`
        *,
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

export default router;
