// =====================================================
// TRACKING API ROUTES
// =====================================================
import express from "express";
import pool from "../config/db.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/**
 * POST /api/tracking/response
 */
router.post("/response", authMiddleware, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const userId = req.user.id;
    const { lessonId, questionId, category, selectedOption, isCorrect, pointsEarned } = req.body;

    await pool.query(
      `INSERT INTO quiz_responses
         (user_id, lesson_id, question_id, category, selected_option, is_correct, points_earned)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, lessonId, questionId, category, selectedOption, isCorrect, pointsEarned || 0]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error saving quiz response:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/tracking/weak-topics
 */
router.get("/weak-topics", authMiddleware, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const userId = req.user.id;

    const result = await pool.query(
      `SELECT * FROM user_weak_topics
       WHERE user_id = $1 AND success_rate <= 60
       ORDER BY success_rate ASC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching weak topics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/tracking/progress
 */
router.post("/progress", authMiddleware, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const userId = req.user.id;
    const { lessonId, progress, courseId } = req.body;

    // Handle marking a specific lesson
    if (lessonId) {
      await pool.query(
        `INSERT INTO lesson_progress (user_id, lesson_id, completed, progress_percentage, updated_at)
         VALUES ($1, $2, true, $3, NOW())
         ON CONFLICT (user_id, lesson_id)
         DO UPDATE SET completed = true, progress_percentage = EXCLUDED.progress_percentage, updated_at = NOW()`,
        [userId, lessonId, progress || 100]
      );
    }
    
    // Optionally handle course level marking if provided (fallback logic)
    if (courseId && !lessonId) {
        // Just acknowledging it for now, normally you'd update course progress in enrollments
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking lesson progress:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * GET /api/tracking/course-progress/:courseId
 */
router.get("/course-progress/:courseId", authMiddleware, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const userId = req.user.id;
    const { courseId } = req.params;

    // Get total lessons in course vs completed lessons
    const result = await pool.query(
      `SELECT 
         COUNT(l.id) as total_lessons,
         COUNT(lp.id) FILTER (WHERE lp.completed = true) as completed_lessons,
         json_agg(l.id) FILTER (WHERE lp.completed = true) as completed_lesson_ids
       FROM lessons l
       JOIN modules m ON l.module_id = m.id
       LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
       WHERE m.course_id = $2`,
      [userId, courseId]
    );

    const stats = result.rows[0];
    const total = parseInt(stats.total_lessons) || 0;
    const completed = parseInt(stats.completed_lessons) || 0;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    const completedIds = stats.completed_lesson_ids || [];

    res.json({ total, completed, percentage, completedIds });
  } catch (error) {
    console.error("Error fetching course progress:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/tracking/lesson-feedback
 */
router.post("/lesson-feedback", authMiddleware, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const userId = req.user.id;
    const { lessonId, reason, additionalNotes } = req.body;

    await pool.query(
      `INSERT INTO lesson_feedback (user_id, lesson_id, reason, additional_notes)
       VALUES ($1, $2, $3, $4)`,
      [userId, lessonId, reason, additionalNotes || null]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error submitting lesson feedback:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
