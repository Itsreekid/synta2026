// =====================================================
// LIVE SESSIONS API ROUTES
// =====================================================
import express from "express";
import pool from "../config/db.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createZoomMeeting, deleteZoomMeeting } from "../utils/zoomClient.js";

const router = express.Router();

/**
 * GET /api/live/upcoming — PROTECTED
 */
router.get("/upcoming", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const enrollResult = await pool.query(
      `SELECT course_id, offer_id FROM enrollments WHERE user_id = $1`,
      [userId]
    );

    const enrolledCourseIds = enrollResult.rows.map((e) => e.course_id);
    if (enrolledCourseIds.length === 0) return res.json([]);

    const offerMap = {};
    for (const e of enrollResult.rows) {
      if (!offerMap[e.course_id]) offerMap[e.course_id] = new Set();
      if (e.offer_id) offerMap[e.course_id].add(e.offer_id);
    }

    const sessionResult = await pool.query(
      `SELECT ls.id, ls.title, ls.description, ls.scheduled_at, ls.duration_minutes,
              ls.status, ls.offer_id, ls.zoom_join_url, ls.replay_url,
              ls.course_id,
              c.title AS course_title, c.thumbnail_url AS course_thumbnail
       FROM live_sessions ls
       JOIN courses c ON c.id = ls.course_id
       WHERE ls.course_id = ANY($1)
         AND ls.scheduled_at >= NOW()
       ORDER BY ls.scheduled_at ASC`,
      [enrolledCourseIds]
    );

    const accessible = sessionResult.rows.filter(
      (s) => !s.offer_id || (offerMap[s.course_id]?.has(s.offer_id) ?? false)
    );

    const response = accessible.map(({ offer_id, course_id, course_title, course_thumbnail, ...s }) => ({
      ...s,
      course: { title: course_title, thumbnail_url: course_thumbnail },
    }));

    res.json(response);
  } catch (error) {
    console.error("Error fetching live sessions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/live/replays — PROTECTED
 */
router.get("/replays", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const enrollResult = await pool.query(
      `SELECT course_id FROM enrollments WHERE user_id = $1`,
      [userId]
    );
    const enrolledCourseIds = enrollResult.rows.map((e) => e.course_id);
    if (enrolledCourseIds.length === 0) return res.json([]);

    const result = await pool.query(
      `SELECT ls.id, ls.title, ls.description, ls.scheduled_at,
              ls.duration_minutes, ls.replay_url, c.title AS course_title
       FROM live_sessions ls
       JOIN courses c ON c.id = ls.course_id
       WHERE ls.course_id = ANY($1)
         AND ls.scheduled_at < NOW()
         AND ls.replay_url IS NOT NULL
       ORDER BY ls.scheduled_at DESC`,
      [enrolledCourseIds]
    );

    const replays = result.rows.map(({ course_title, ...s }) => ({
      ...s,
      course: { title: course_title },
    }));

    res.json(replays);
  } catch (error) {
    console.error("Error fetching replays:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/live/schedule — ADMIN ONLY
 */
router.post("/schedule", requireAdmin, async (req, res) => {
  const { courseId, offerId, title, description, startTime, startTimes, durationMinutes = 60 } = req.body;
  const times = startTimes?.length > 0 ? startTimes : startTime ? [startTime] : [];

  if (!courseId || !title || times.length === 0) {
    return res.status(400).json({ error: "courseId, title, and at least one startTime are required" });
  }

  try {
    const isRecurring = times.length > 1;
    const { zoom_meeting_id, zoom_join_url, zoom_start_url, zoom_password } =
      await createZoomMeeting({ topic: title, startTime: times[0], durationMinutes, isRecurring });

    const insertedSessions = [];
    for (const time of times) {
      const result = await pool.query(
        `INSERT INTO live_sessions
           (course_id, offer_id, title, description, scheduled_at, duration_minutes,
            zoom_meeting_id, zoom_join_url, zoom_start_url, zoom_password, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled')
         RETURNING id, title, scheduled_at, zoom_meeting_id, zoom_start_url, zoom_join_url, offer_id`,
        [
          courseId, offerId || null, title, description || null,
          time, durationMinutes, zoom_meeting_id, zoom_join_url,
          zoom_start_url, zoom_password,
        ]
      );
      insertedSessions.push(result.rows[0]);
    }

    res.status(201).json({ success: true, sessions: insertedSessions });
  } catch (error) {
    console.error("Error scheduling live session:", error);
    res.status(500).json({ error: error.message || "Failed to create session" });
  }
});

/**
 * DELETE /api/live/:sessionId — ADMIN ONLY
 */
router.delete("/:sessionId", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  try {
    const result = await pool.query(
      `SELECT zoom_meeting_id FROM live_sessions WHERE id = $1`,
      [sessionId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Session not found" });

    if (result.rows[0].zoom_meeting_id) {
      await deleteZoomMeeting(result.rows[0].zoom_meeting_id);
    }

    await pool.query(`DELETE FROM live_sessions WHERE id = $1`, [sessionId]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting live session:", error);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

/**
 * GET /api/live/admin/sessions — ADMIN ONLY
 */
router.get("/admin/sessions", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ls.*, c.title AS course_title
       FROM live_sessions ls
       JOIN courses c ON c.id = ls.course_id
       ORDER BY ls.scheduled_at DESC`
    );

    const data = result.rows.map(({ course_title, ...s }) => ({
      ...s,
      course: { title: course_title },
    }));

    res.json(data);
  } catch (error) {
    console.error("Error fetching admin sessions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
