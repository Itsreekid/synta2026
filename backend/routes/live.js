// =====================================================
// LIVE SESSIONS API ROUTES
// =====================================================
import express from "express";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import pool from "../config/db.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createZoomMeeting, deleteZoomMeeting } from "../utils/zoomClient.js";
import { createR2UploadUrl, generateSignedUrl } from "../utils/r2Utils.js";
import { r2Client, R2_BUCKET } from "../config/r2.js";

const router = express.Router();

async function attachSessionResources(sessions, includeSignedUrls = false) {
  if (!sessions.length) return [];
  const ids = sessions.map(session => session.id);
  const result = await pool.query(
    `SELECT id, live_session_id, title, file_name, object_key, content_type, file_size
     FROM learning_resources WHERE live_session_id = ANY($1) ORDER BY created_at, title`,
    [ids]
  );
  const resourcesBySession = new Map();
  for (const resource of result.rows) {
    if (!resourcesBySession.has(resource.live_session_id)) resourcesBySession.set(resource.live_session_id, []);
    const item = {
      id: resource.id, title: resource.title, file_name: resource.file_name,
      content_type: resource.content_type, file_size: Number(resource.file_size),
    };
    if (includeSignedUrls) {
      item.url = await generateSignedUrl(resource.object_key, 3600, resource.file_name);
      if (String(resource.file_name || '').toLowerCase().endsWith('.pdf')) {
        item.preview_url = await generateSignedUrl(resource.object_key, 3600);
      }
      if (String(resource.file_name || '').toLowerCase().endsWith('.py')) {
        item.code_url = '/api/live/resources/' + encodeURIComponent(resource.id) + '/code';
      }
    }
    resourcesBySession.get(resource.live_session_id).push(item);
  }
  return sessions.map(session => ({ ...session, resources: resourcesBySession.get(session.id) || [] }));
}

/**
 * GET /api/live/course/:courseId — ENROLLED STUDENTS ONLY
 * Returns scheduled sessions and past sessions for the course. Past sessions
 * remain visible while the replay is being prepared.
 */
router.get("/course/:courseId", authApiMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT ls.id, ls.title, ls.description, ls.scheduled_at,
              ls.duration_minutes, ls.status, ls.zoom_join_url, ls.replay_url
       FROM live_sessions ls
       WHERE ls.course_id = $1
         AND EXISTS (
           SELECT 1 FROM enrollments e
           WHERE e.user_id = $2
             AND e.course_id = ls.course_id
             AND (e.expires_at IS NULL OR e.expires_at > NOW())
             AND (ls.offer_id IS NULL OR e.offer_id = ls.offer_id)
         )
       ORDER BY ls.scheduled_at DESC`,
      [courseId, userId]
    );

    const sessions = await Promise.all(result.rows.map(async (session) => ({
      ...session,
      replay_url: session.replay_url && !/^https?:\/\//i.test(session.replay_url)
        ? await generateSignedUrl(session.replay_url, 3600)
        : session.replay_url,
    })));
    res.json(await attachSessionResources(sessions, true));
  } catch (error) {
    console.error("Error fetching course live sessions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/resources/:resourceId/code", authApiMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lr.object_key, lr.file_name, lr.file_size
       FROM learning_resources lr
       JOIN live_sessions ls ON ls.id = lr.live_session_id
       WHERE lr.id = $1
         AND lower(lr.file_name) LIKE '%.py'
         AND EXISTS (
           SELECT 1 FROM enrollments e
           WHERE e.user_id = $2
             AND e.course_id = ls.course_id
             AND (e.expires_at IS NULL OR e.expires_at > NOW())
             AND (ls.offer_id IS NULL OR e.offer_id = ls.offer_id)
         )`,
      [req.params.resourceId, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Python resource not found" });
    const resource = result.rows[0];
    if (Number(resource.file_size) > 1024 * 1024) {
      return res.status(413).json({ error: "This file is too large to open in the editor. Download it instead." });
    }
    const object = await r2Client.send(new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: resource.object_key,
    }));
    if (!object.Body) return res.status(404).json({ error: "File content is unavailable" });
    const code = await object.Body.transformToString("utf-8");
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.type("text/plain").send(code);
  } catch (error) {
    console.error("Could not load session Python resource into editor:", error.message);
    res.status(500).json({ error: "Could not load this Python file" });
  }
});

/**
 * GET /api/live/upcoming — PROTECTED
 */
router.get("/upcoming", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const enrollResult = await pool.query(
      `SELECT course_id, offer_id FROM enrollments
       WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
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

    const response = await Promise.all(accessible.map(async ({ offer_id, course_id, course_title, course_thumbnail, ...s }) => ({
      ...s,
      replay_url: s.replay_url && !/^https?:\/\//i.test(s.replay_url) ? await generateSignedUrl(s.replay_url, 3600) : s.replay_url,
      course: { title: course_title, thumbnail_url: course_thumbnail },
    })));

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

    const result = await pool.query(
      `SELECT DISTINCT ls.id, ls.title, ls.description, ls.scheduled_at,
              ls.duration_minutes, ls.replay_url, c.title AS course_title
       FROM live_sessions ls
       JOIN courses c ON c.id = ls.course_id
       JOIN enrollments e ON e.course_id = ls.course_id AND e.user_id = $1
         AND (e.expires_at IS NULL OR e.expires_at > NOW())
         AND (ls.offer_id IS NULL OR ls.offer_id = e.offer_id)
       WHERE ls.scheduled_at < NOW()
         AND ls.replay_url IS NOT NULL
       ORDER BY ls.scheduled_at DESC`,
      [userId]
    );

    const replays = await Promise.all(result.rows.map(async ({ course_title, ...s }) => ({
      ...s,
      replay_url: !/^https?:\/\//i.test(s.replay_url) ? await generateSignedUrl(s.replay_url, 3600) : s.replay_url,
      course: { title: course_title },
    })));

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
 * PATCH /api/live/:sessionId/replay — ADMIN ONLY
 * Attach or clear the recording link after a live session.
 */
router.patch("/:sessionId/replay", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  const replayKey = typeof req.body?.replayKey === "string" ? req.body.replayKey.trim() : "";
  if (replayKey) {
    if (!replayKey.startsWith(`live-replays/${sessionId}/`) || replayKey.includes("..")) {
      return res.status(400).json({ error: "Invalid replay upload key" });
    }
    try {
      const result = await pool.query(
        `UPDATE live_sessions SET replay_url = $1 WHERE id = $2 RETURNING id, replay_url`,
        [replayKey, sessionId]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Session not found" });
      return res.json({ success: true, ...result.rows[0] });
    } catch (error) {
      console.error("Error attaching live replay:", error.message);
      return res.status(500).json({ error: "Failed to attach replay" });
    }
  }
  const rawReplayUrl = typeof req.body?.replayUrl === "string" ? req.body.replayUrl.trim() : "";
  let replayUrl = null;

  if (rawReplayUrl) {
    try {
      const parsedUrl = new URL(rawReplayUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Invalid protocol");
      replayUrl = parsedUrl.toString();
    } catch {
      return res.status(400).json({ error: "Replay URL must be a valid HTTP or HTTPS URL" });
    }
  }

  try {
    const result = await pool.query(
      `UPDATE live_sessions SET replay_url = $1 WHERE id = $2 RETURNING id, replay_url`,
      [replayUrl, sessionId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Session not found" });
    res.json({ success: true, ...result.rows[0] });
  } catch (error) {
    console.error("Error updating live session replay:", error);
    res.status(500).json({ error: "Failed to update replay link" });
  }
});

router.post("/:sessionId/replay-upload-url", requireAdmin, async (req, res) => {
  const { fileName, contentType, size } = req.body || {};
  if (!new Set(["video/mp4", "video/webm", "video/quicktime"]).has(contentType)) {
    return res.status(400).json({ error: "Upload an MP4, WebM, or MOV video" });
  }
  if (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > 1024 * 1024 * 1024) {
    return res.status(400).json({ error: "Replay file must be 1 GB or less" });
  }
  try {
    const session = await pool.query("SELECT id FROM live_sessions WHERE id = $1", [req.params.sessionId]);
    if (!session.rowCount) return res.status(404).json({ error: "Session not found" });
    const safeName = String(fileName || "replay").normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    const key = `live-replays/${req.params.sessionId}/${Date.now()}-${safeName}`;
    const uploadUrl = await createR2UploadUrl(key, contentType, 900);
    res.json({ uploadUrl, key });
  } catch (error) {
    console.error("Could not prepare replay upload:", error.message);
    res.status(500).json({ error: "Could not prepare replay upload" });
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

    res.json(await attachSessionResources(data));
  } catch (error) {
    console.error("Error fetching admin sessions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
