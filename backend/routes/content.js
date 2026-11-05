// =====================================================
// CONTENT API ROUTES
// =====================================================
import express from "express";
import pool from "../config/db.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";
import { checkLessonAccess } from "../middleware/auth.js";
import { generateSignedUrl } from "../utils/r2Utils.js";

const router = express.Router();

router.get("/lesson/:lessonId/resources", authApiMiddleware, async (req, res) => {
  try {
    const lessonResult = await pool.query(
      "SELECT id, pdf_key, is_preview FROM lessons WHERE id = $1",
      [req.params.lessonId]
    );
    if (!lessonResult.rowCount) return res.status(404).json({ error: "Lesson not found" });
    const lesson = lessonResult.rows[0];
    const hasAccess = lesson.is_preview || await checkLessonAccess(req.user.id, lesson.id);
    if (!hasAccess) return res.status(403).json({ error: "Lesson access required" });

    const result = await pool.query(
      `SELECT id, title, file_name, object_key, content_type, file_size
       FROM learning_resources WHERE lesson_id = $1 ORDER BY created_at, title`,
      [lesson.id]
    );
    const resources = await Promise.all(result.rows.map(async (resource) => ({
      id: resource.id,
      title: resource.title,
      file_name: resource.file_name,
      content_type: resource.content_type,
      file_size: Number(resource.file_size),
      url: await generateSignedUrl(resource.object_key, 3600, resource.file_name),
    })));
    if (lesson.pdf_key) {
      const fileName = lesson.pdf_key.split("/").pop() || "document.pdf";
      resources.unshift({
        id: `legacy-${lesson.id}`,
        title: "Document du cours",
        file_name: fileName,
        content_type: "application/pdf",
        url: /^https?:\/\//i.test(lesson.pdf_key) ? lesson.pdf_key : await generateSignedUrl(lesson.pdf_key, 3600, fileName),
      });
    }
    res.json({ resources });
  } catch (error) {
    console.error("Error loading lesson practice files:", error.message);
    res.status(500).json({ error: "Could not load lesson files" });
  }
});

/**
 * GET /api/content/lesson/:lessonId — PROTECTED
 */
router.get("/lesson/:lessonId", authApiMiddleware, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user?.id;

    const lessonResult = await pool.query(
      `SELECT id, title, type, video_key, pdf_key, duration, is_preview, module_id, description, content
       FROM lessons WHERE id = $1`,
      [lessonId]
    );

    if (lessonResult.rowCount === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    const lesson = lessonResult.rows[0];
    let hasAccess = lesson.is_preview;

    if (!hasAccess && userId) {
      hasAccess = await checkLessonAccess(userId, lessonId);
    }

    if (!hasAccess) {
      return res.status(403).json({
        error: "Access denied. Please enroll in this course first.",
        isPreview: lesson.is_preview,
      });
    }

    const response = {
      lessonId: lesson.id,
      title: lesson.title,
      type: lesson.type,
      duration: lesson.duration,
      isPreview: lesson.is_preview,
      // Include full lesson object for quiz / content rendering
      lesson: {
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        duration: lesson.duration,
        video_key: lesson.video_key,
        pdf_key: lesson.pdf_key,
        description: lesson.description,
        is_preview: lesson.is_preview,
        content: lesson.content,
      },
    };

    // ── Video URL ─────────────────────────────────────────────────
    if (lesson.video_key) {
      const vk = lesson.video_key;
      try {
        if (vk.startsWith("http://") || vk.startsWith("https://")) {
          // Already a direct URL — return it as-is
          response.videoUrl = vk;
        } else {
          // R2 key — generate a signed URL
          response.videoUrl = await generateSignedUrl(vk);
        }
      } catch (urlErr) {
        console.error("⚠️  Could not generate video URL for key:", vk, urlErr.message);
        // Still return the response — without a video URL
        response.videoError = "Video temporarily unavailable. Please try again.";
      }
    }

    // ── PDF URL ───────────────────────────────────────────────────
    if (lesson.pdf_key) {
      const pk = lesson.pdf_key;
      try {
        if (pk.startsWith("http://") || pk.startsWith("https://")) {
          response.pdfUrl = pk;
        } else {
          response.pdfUrl = await generateSignedUrl(pk);
        }
      } catch (pdfErr) {
        console.error("⚠️  Could not generate PDF URL for key:", pk, pdfErr.message);
      }
    }

    // ── Log lesson access (best-effort — never fail the response) ──
    if (userId) {
      pool.query(
        `INSERT INTO lesson_progress (user_id, lesson_id, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, lesson_id)
         DO UPDATE SET updated_at = NOW()`,
        [userId, lessonId]
      ).catch((dbErr) => {
        console.error("⚠️  Could not log lesson access:", dbErr.message);
      });
    }

    res.json(response);
  } catch (error) {
    console.error("Error in lesson content route:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

/**
 * POST /api/content/lesson/:lessonId/progress — PROTECTED
 */
router.post("/lesson/:lessonId/progress", authApiMiddleware, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { completed, progressPercentage, lastPosition } = req.body;
    const userId = req.user.id;

    await pool.query(
      `INSERT INTO lesson_progress
         (user_id, lesson_id, completed, progress_percentage, last_position, completed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         completed          = EXCLUDED.completed,
         progress_percentage = EXCLUDED.progress_percentage,
         last_position      = EXCLUDED.last_position,
         completed_at       = EXCLUDED.completed_at,
         updated_at         = NOW()`,
      [
        userId,
        lessonId,
        completed || false,
        progressPercentage || 0,
        lastPosition || 0,
        completed ? new Date().toISOString() : null,
      ]
    );

    // Update course-level progress
    const lessonRow = await pool.query(
      `SELECT cm.course_id FROM lessons l JOIN course_modules cm ON cm.module_id = l.module_id WHERE l.id = $1`,
      [lessonId]
    );

    if (lessonRow.rowCount > 0) {
      await pool.query(
        `UPDATE enrollments e SET
           progress = stats.progress,
           last_accessed = NOW()
         FROM (
           SELECT cm.course_id,
                  ROUND(100.0 * COUNT(*) FILTER (WHERE lp.completed = true) / NULLIF(COUNT(*), 0)) AS progress
           FROM course_modules cm
           JOIN lessons l2 ON l2.module_id = cm.module_id
           LEFT JOIN lesson_progress lp ON lp.lesson_id = l2.id AND lp.user_id = $1
           WHERE cm.course_id IN (SELECT course_id FROM course_modules WHERE module_id = (SELECT module_id FROM lessons WHERE id = $2))
             AND l2.type IS DISTINCT FROM 'quiz'
           GROUP BY cm.course_id
         ) stats
         WHERE e.user_id = $1 AND e.course_id = stats.course_id`,
        [userId, lessonId]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating progress:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/content/thumbnail/:thumbnailKey — PUBLIC
 */
router.get("/thumbnail/:thumbnailKey", async (req, res) => {
  try {
    const decodedKey = decodeURIComponent(req.params.thumbnailKey);
    const thumbnailUrl = await generateSignedUrl(decodedKey, 3600);
    res.json({ url: thumbnailUrl, expiresIn: 3600 });
  } catch (error) {
    console.error("Error generating thumbnail URL:", error);
    res.status(500).json({ error: "Failed to generate thumbnail URL" });
  }
});

export default router;
