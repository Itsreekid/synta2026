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
import { liveSessionAccess, offerEntitlement, enrollmentAccess, hasExtendedLiveAccess } from "../utils/offerAccess.js";
import { liveFeatures } from "../services/live-features.js";
import { recordingStorage, recordingWorker } from "../services/recording-worker.js";

const router = express.Router();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOIN_EARLY_MS = 10 * 60_000;

const joinPath = id => `/api/live/${encodeURIComponent(id)}/join`;
const signReplay = async url => url && !/^https?:\/\//i.test(url) ? generateSignedUrl(url, 3600) : url;

/** Published Zoom segments beyond the first are exposed as extra replay parts. */
async function attachReplayParts(sessions) {
  if (!liveFeatures.recordingsTable || !sessions.length) return sessions;
  const { rows } = await pool.query(
    `SELECT id, live_session_id, object_key FROM zoom_recording_imports
     WHERE live_session_id = ANY($1) AND status = 'published' AND object_key IS NOT NULL
     ORDER BY recording_start`,
    [sessions.map(session => session.id)]
  );
  const bySession = new Map();
  for (const row of rows) {
    if (!bySession.has(row.live_session_id)) bySession.set(row.live_session_id, []);
    bySession.get(row.live_session_id).push(row);
  }
  return Promise.all(sessions.map(async session => {
    const parts = bySession.get(session.id) || [];
    if (parts.length < 2) return session;
    return {
      ...session,
      replay_parts: await Promise.all(parts.map(async (part, index) => ({
        id: part.id, label: `Partie ${index + 1}`, url: await generateSignedUrl(part.object_key, 3600),
      }))),
    };
  }));
}

async function getEligibleStudents(courseId, offerId, studentIds = null) {
  const result = await pool.query(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     WHERE e.course_id = $1 AND u.role = 'user'
       AND ($2::uuid IS NULL OR ${offerEntitlement("u.id", "$2", "e.course_id")})
       AND ${enrollmentAccess("e")}
       AND ($3::uuid[] IS NULL OR u.id = ANY($3))
     ORDER BY u.name, u.email`,
    [courseId, offerId || null, studentIds]
  );
  return result.rows;
}

router.get("/admin/eligible-students", requireAdmin, async (req, res) => {
  const { courseId, offerId } = req.query;
  if (!uuidPattern.test(courseId) || (offerId && !uuidPattern.test(offerId))) {
    return res.status(400).json({ error: "Cours ou offre invalide." });
  }
  try {
    res.json(await getEligibleStudents(courseId, offerId));
  } catch (error) {
    console.error("Error fetching eligible session students:", error.message);
    res.status(500).json({ error: "Impossible de charger les étudiants." });
  }
});

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
              ls.duration_minutes, ls.status, ls.zoom_join_url IS NOT NULL AS has_join_link, ls.replay_url,
              md5(jsonb_build_array(ls.title,ls.description,ls.scheduled_at,ls.duration_minutes,ls.replay_url)::text) AS revision
       FROM live_sessions ls
       WHERE ls.course_id = $1
         AND ${liveSessionAccess("$2")}
       ORDER BY ls.scheduled_at DESC`,
      [courseId, userId]
    );

    const sessions = await Promise.all(result.rows.map(async ({ has_join_link, ...session }) => ({
      ...session,
      join_url: has_join_link ? joinPath(session.id) : null,
      replay_url: await signReplay(session.replay_url),
    })));
    res.json(await attachSessionResources(await attachReplayParts(sessions), true));
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
         AND ${liveSessionAccess("$2")}`,
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

    const sessionResult = await pool.query(
      `SELECT ls.id, ls.title, ls.description, ls.scheduled_at, ls.duration_minutes,
              ls.status, ls.zoom_join_url IS NOT NULL AS has_join_link, ls.replay_url,
              c.title AS course_title, c.thumbnail_url AS course_thumbnail
       FROM live_sessions ls
       JOIN courses c ON c.id = ls.course_id
       WHERE ${liveSessionAccess("$1")}
         AND ls.scheduled_at + make_interval(mins => COALESCE(ls.duration_minutes, 60)) > NOW()
       ORDER BY ls.scheduled_at ASC`,
      [userId]
    );

    const response = await Promise.all(sessionResult.rows.map(async ({ has_join_link, course_title, course_thumbnail, ...s }) => ({
      ...s,
      join_url: has_join_link ? joinPath(s.id) : null,
      replay_url: await signReplay(s.replay_url),
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
              ls.duration_minutes, ls.replay_url, ls.course_id, c.title AS course_title
       FROM live_sessions ls
       JOIN courses c ON c.id = ls.course_id
       WHERE ls.scheduled_at < NOW()
         AND ${liveSessionAccess("$1")}
         AND ls.replay_url IS NOT NULL
       ORDER BY ls.scheduled_at DESC`,
      [userId]
    );

    const replays = await Promise.all(result.rows.map(async ({ course_title, ...s }) => ({
      ...s,
      replay_url: await signReplay(s.replay_url),
      course: { title: course_title },
    })));

    res.json(replays);
  } catch (error) {
    console.error("Error fetching replays:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function joinNotice(res, status, message) {
  res.set("Cache-Control", "private, no-store");
  return res.status(status).type("html").send(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Séance live</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1e293b">` +
    `<p>${message}</p><p><a href="/app/calendar">Retour au calendrier</a></p></body></html>`
  );
}

/**
 * GET /api/live/:sessionId/join — PROTECTED
 * Redirects to Zoom only for authorized students inside the join window.
 */
router.get("/:sessionId/join", authApiMiddleware, async (req, res) => {
  if (!uuidPattern.test(req.params.sessionId)) return joinNotice(res, 404, "Séance introuvable.");
  try {
    const { rows: [session] } = await pool.query(
      `SELECT ls.scheduled_at, ls.duration_minutes, ls.zoom_join_url
       FROM live_sessions ls
       WHERE ls.id = $1 AND ${liveSessionAccess("$2")}`,
      [req.params.sessionId, req.user.id]
    );
    if (!session?.zoom_join_url) return joinNotice(res, 404, "Séance introuvable ou accès non autorisé.");
    const start = new Date(session.scheduled_at).getTime();
    const end = start + Number(session.duration_minutes || 60) * 60_000;
    const now = Date.now();
    if (now < start - JOIN_EARLY_MS) {
      return joinNotice(res, 403, "La séance n’a pas encore commencé. Le lien s’ouvre 10 minutes avant le début.");
    }
    if (now > end) return joinNotice(res, 410, "Cette séance est terminée.");
    res.set("Cache-Control", "private, no-store");
    res.redirect(302, session.zoom_join_url);
  } catch (error) {
    console.error("Error opening live session:", error.code ?? error.name);
    joinNotice(res, 500, "Impossible d’ouvrir la séance. Réessayez.");
  }
});

function uuidList(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || !value.every(id => typeof id === "string" && uuidPattern.test(id))) return null;
  return [...new Set(value.map(id => id.toLowerCase()))];
}

/**
 * POST /api/live/schedule — ADMIN ONLY
 */
router.post("/schedule", requireAdmin, async (req, res) => {
  const { courseId, offerId, title, description, startTime, startTimes, durationMinutes = 60, audienceStudentIds = null,
    additionalOfferIds = null, grantedStudentIds = null } = req.body || {};
  const dates = startTimes ?? (startTime ? [startTime] : []);
  const extraOffers = uuidList(additionalOfferIds);
  const grantedStudents = uuidList(grantedStudentIds);
  if (!extraOffers || !grantedStudents) {
    return res.status(400).json({ error: "Offres supplémentaires ou étudiants invités invalides." });
  }
  if ((extraOffers.length || grantedStudents.length) && !hasExtendedLiveAccess()) {
    return res.status(409).json({ error: "Les offres multiples et les accès individuels seront disponibles après la mise à jour de la base de données." });
  }
  if (extraOffers.length && !offerId) {
    return res.status(400).json({ error: "Choisissez d’abord l’offre principale." });
  }
  const additional = extraOffers.filter(id => id !== String(offerId).toLowerCase());

  if (!uuidPattern.test(courseId) || (offerId && !uuidPattern.test(offerId)) ||
      typeof title !== "string" || !title.trim() || !Array.isArray(dates) ||
      !dates.length || dates.length > 84 ||
      dates.some(date => typeof date !== "string" || !Number.isFinite(Date.parse(date))) ||
      !Number.isInteger(Number(durationMinutes)) || Number(durationMinutes) < 1) {
    return res.status(400).json({ error: "courseId, title, and at least one startTime are required" });
  }
  const times = [...new Set(dates.map(date => new Date(date).toISOString()))].sort();

  try {
    let audience = null;
    if (audienceStudentIds !== null) {
      if (!Array.isArray(audienceStudentIds) || !audienceStudentIds.length ||
          !audienceStudentIds.every(id => typeof id === "string" && uuidPattern.test(id))) {
        return res.status(400).json({ error: "Sélectionnez au moins un étudiant valide." });
      }
      audience = [...new Set(audienceStudentIds.map(id => id.toLowerCase()))];
      const eligibleStudents = await getEligibleStudents(courseId, offerId, audience);
      if (eligibleStudents.length !== audience.length) {
        return res.status(400).json({ error: "Tous les étudiants sélectionnés doivent être inscrits au cours et à l’offre choisie, le cas échéant." });
      }
    }
    if (additional.length) {
      const found = await pool.query("SELECT COUNT(*)::int AS count FROM offers WHERE id = ANY($1::uuid[])", [additional]);
      if (found.rows[0].count !== additional.length) return res.status(400).json({ error: "Une offre supplémentaire est introuvable." });
    }
    if (grantedStudents.length) {
      const found = await pool.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE id = ANY($1::uuid[]) AND role = 'user'", [grantedStudents]);
      if (found.rows[0].count !== grantedStudents.length) return res.status(400).json({ error: "Un étudiant invité est introuvable." });
    }

    const isRecurring = times.length > 1;
    const { zoom_meeting_id, zoom_join_url, zoom_start_url, zoom_password } =
      await createZoomMeeting({ topic: title, startTime: times[0], durationMinutes, isRecurring });

    const extended = hasExtendedLiveAccess();
    let result;
    try {
      result = await pool.query(
        `INSERT INTO live_sessions
           (course_id, offer_id, title, description, scheduled_at, duration_minutes,
            zoom_meeting_id, zoom_join_url, zoom_start_url, zoom_password, status, audience_student_ids
            ${extended ? ", additional_offer_ids, granted_student_ids" : ""})
         SELECT $1, $2, $3, $4, occurrence, $6, $7, $8, $9, $10, 'scheduled', $11
            ${extended ? ", $12::uuid[], $13::uuid[]" : ""}
         FROM unnest($5::timestamptz[]) AS dates(occurrence)
         RETURNING id, title, scheduled_at, zoom_meeting_id, zoom_join_url, offer_id`,
        [
          courseId, offerId || null, title, description || null,
          times, durationMinutes, zoom_meeting_id, zoom_join_url,
          zoom_start_url, zoom_password, audience,
          ...(extended ? [additional.length ? additional : null, grantedStudents.length ? grantedStudents : null] : []),
        ]
      );
    } catch (error) {
      try {
        await deleteZoomMeeting(zoom_meeting_id);
      } catch (cleanupError) {
        console.error("Error cleaning up unscheduled Zoom meeting:", cleanupError.message);
      }
      throw error;
    }

    res.status(201).json({ success: true, sessions: result.rows });
  } catch (error) {
    console.error("Error scheduling live session:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

/**
 * DELETE /api/live/:sessionId — ADMIN ONLY
 */
router.delete("/:sessionId", requireAdmin, async (req, res) => {
  const { sessionId } = req.params;
  const wholeSeries = req.query.series === "true";
  if (!uuidPattern.test(sessionId)) return res.status(400).json({ error: "Séance invalide." });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT zoom_meeting_id FROM live_sessions WHERE id = $1",
      [sessionId]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Session not found" });
    }

    const meetingId = result.rows[0].zoom_meeting_id;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`zoom-cancel:${meetingId || sessionId}`]);
    const current = await client.query("SELECT status FROM live_sessions WHERE id = $1", [sessionId]);
    if (!wholeSeries && current.rows[0]?.status === "cancelled") {
      await client.query("COMMIT");
      return res.json({ success: true, cancelledIds: [sessionId] });
    }
    const siblings = meetingId ? await client.query(
      `SELECT id FROM live_sessions WHERE zoom_meeting_id = $1 AND id <> $2 AND status <> 'cancelled'
       AND scheduled_at + duration_minutes * INTERVAL '1 minute' > NOW()`,
      [meetingId, sessionId]
    ) : { rows: [] };

    if (meetingId && (wholeSeries || !siblings.rows.length)) {
      try {
        await deleteZoomMeeting(meetingId);
      } catch {
        await client.query("ROLLBACK");
        return res.status(502).json({ error: "Zoom n’a pas confirmé l’annulation. Réessayez." });
      }
    }

    const cancelled = await client.query(
      "UPDATE live_sessions SET status = 'cancelled' WHERE id = ANY($1::uuid[]) RETURNING id",
      [wholeSeries ? [sessionId, ...siblings.rows.map(row => row.id)] : [sessionId]]
    );
    await client.query("COMMIT");
    res.json({ success: true, cancelledIds: cancelled.rows.map(row => row.id) });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Error cancelling live session:", error.code);
    res.status(500).json({ error: "Failed to delete session" });
  } finally {
    client?.release();
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
      `SELECT ls.id, ls.course_id, ls.offer_id, ls.title, ls.description, ls.scheduled_at,
              ls.duration_minutes, ls.status, ls.zoom_meeting_id, ls.replay_url, ls.audience_student_ids,
              ${hasExtendedLiveAccess() ? "ls.additional_offer_ids, ls.granted_student_ids," : ""}
              ls.zoom_start_url IS NOT NULL AS has_host_link, c.title AS course_title
       FROM live_sessions ls
       JOIN courses c ON c.id = ls.course_id
       WHERE ls.status <> 'cancelled'
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

/**
 * GET /api/live/admin/features — ADMIN ONLY
 */
router.get("/admin/features", requireAdmin, (req, res) => {
  res.json({ extendedAccess: hasExtendedLiveAccess(), recordings: liveFeatures.recordingsTable });
});

/**
 * GET /api/live/admin/students?q= — ADMIN ONLY
 * Any student account can be granted individual access to a session.
 */
router.get("/admin/students", requireAdmin, async (req, res) => {
  const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email FROM users
       WHERE role = 'user' AND ($1 = '' OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
       ORDER BY name NULLS LAST, email LIMIT 50`,
      [search]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error searching students:", error.code ?? error.name);
    res.status(500).json({ error: "Impossible de charger les étudiants." });
  }
});

function requireRecordingsTable(req, res, next) {
  if (!liveFeatures.recordingsTable) {
    return res.status(409).json({ error: "L’import automatique des enregistrements n’est pas encore activé." });
  }
  next();
}

/**
 * GET /api/live/admin/recordings — ADMIN ONLY
 * Import status per Zoom segment, with a short preview link once stored in R2.
 */
router.get("/admin/recordings", requireAdmin, requireRecordingsTable, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, live_session_id, zoom_meeting_id, zoom_meeting_uuid, recording_type, recording_start, recording_end,
              file_size, bytes_transferred, status, review_reason, attempts, last_error, object_key, created_at
       FROM zoom_recording_imports
       WHERE status <> 'discarded' AND created_at > NOW() - INTERVAL '120 days'
       ORDER BY recording_start DESC`
    );
    const stored = new Set(["needs_review", "published"]);
    res.json(await Promise.all(rows.map(async ({ object_key, ...row }) => ({
      ...row,
      preview_url: stored.has(row.status) && object_key ? await generateSignedUrl(object_key, 3600) : null,
    }))));
  } catch (error) {
    console.error("Error listing recording imports:", error.code ?? error.name);
    res.status(500).json({ error: "Impossible de charger les enregistrements." });
  }
});

/**
 * POST /api/live/admin/recordings/:importId/retry — ADMIN ONLY
 */
router.post("/admin/recordings/:importId/retry", requireAdmin, requireRecordingsTable, async (req, res) => {
  if (!uuidPattern.test(req.params.importId)) return res.status(400).json({ error: "Import invalide." });
  try {
    const result = await pool.query(
      `UPDATE zoom_recording_imports
       SET status = 'pending', attempts = 0, next_attempt_at = NOW(), last_error = NULL, updated_at = NOW()
       WHERE id = $1 AND status = 'failed' RETURNING id`,
      [req.params.importId]
    );
    if (!result.rowCount) return res.status(409).json({ error: "Seuls les imports en échec peuvent être relancés." });
    recordingWorker.kick();
    res.json({ success: true });
  } catch (error) {
    console.error("Error retrying recording import:", error.code ?? error.name);
    res.status(500).json({ error: "Impossible de relancer l’import." });
  }
});

/**
 * POST /api/live/admin/recordings/publish — ADMIN ONLY
 * Body: { sessionId, importIds } — the chosen stored segments become the
 * session replay, in recording order. Other segments stay stored for review.
 */
router.post("/admin/recordings/publish", requireAdmin, requireRecordingsTable, async (req, res) => {
  const sessionId = req.body?.sessionId;
  const importIds = uuidList(req.body?.importIds);
  if (!uuidPattern.test(sessionId || "") || !importIds?.length) {
    return res.status(400).json({ error: "Choisissez une séance et au moins un segment." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [session] } = await client.query(
      "SELECT id, zoom_meeting_id FROM live_sessions WHERE id = $1 AND status <> 'cancelled' FOR UPDATE", [sessionId]);
    if (!session) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Séance introuvable." });
    }
    const { rows: chosen } = await client.query(
      `SELECT id, object_key FROM zoom_recording_imports
       WHERE id = ANY($1::uuid[]) AND status IN ('needs_review', 'published') AND object_key IS NOT NULL
         AND zoom_meeting_id = $2 AND (live_session_id IS NULL OR live_session_id = $3)
       ORDER BY recording_start
       FOR UPDATE`,
      [importIds, session.zoom_meeting_id, sessionId]
    );
    if (chosen.length !== importIds.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Un segment choisi n’est pas disponible pour cette séance." });
    }
    await client.query(
      `UPDATE zoom_recording_imports SET status = 'needs_review', review_reason = 'not_selected', updated_at = NOW()
       WHERE live_session_id = $1 AND status = 'published' AND NOT (id = ANY($2::uuid[]))`,
      [sessionId, importIds]
    );
    await client.query(
      `UPDATE zoom_recording_imports
       SET status = 'published', live_session_id = $1, review_reason = NULL, updated_at = NOW()
       WHERE id = ANY($2::uuid[])`,
      [sessionId, importIds]
    );
    await client.query("UPDATE live_sessions SET replay_url = $2 WHERE id = $1", [sessionId, chosen[0].object_key]);
    await client.query("COMMIT");
    res.json({ success: true, published: chosen.map(row => row.id) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error publishing recording:", error.code ?? error.name);
    res.status(500).json({ error: "Impossible de publier le replay." });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/live/admin/recordings/:importId — ADMIN ONLY
 * Deletes an unpublished segment from R2 only. The Zoom cloud recording is kept,
 * and the row stays so the same Zoom file is never imported again.
 */
router.delete("/admin/recordings/:importId", requireAdmin, requireRecordingsTable, async (req, res) => {
  if (!uuidPattern.test(req.params.importId)) return res.status(400).json({ error: "Import invalide." });
  try {
    const { rows: [row] } = await pool.query(
      `UPDATE zoom_recording_imports SET status = 'discarded', updated_at = NOW()
       WHERE id = $1 AND status IN ('needs_review', 'failed')
       RETURNING object_key, multipart_upload_id`,
      [req.params.importId]
    );
    if (!row) return res.status(409).json({ error: "Seuls les segments non publiés peuvent être supprimés." });
    if (row.object_key && row.multipart_upload_id) {
      await recordingStorage.abortMultipart(row.object_key, row.multipart_upload_id).catch(() => {});
    }
    if (row.object_key?.startsWith("live-replays/")) await recordingStorage.delete(row.object_key);
    await pool.query(
      "UPDATE zoom_recording_imports SET object_key = NULL, multipart_upload_id = NULL WHERE id = $1", [req.params.importId]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting recording segment:", error.code ?? error.name);
    res.status(500).json({ error: "Impossible de supprimer le segment." });
  }
});

export default router;
