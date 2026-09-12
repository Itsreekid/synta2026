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

export default router;
