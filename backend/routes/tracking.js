// =====================================================
// TRACKING API ROUTES
// =====================================================
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { supabaseAdmin } from "../config/supabase.js";

const router = express.Router();

/**
 * POST /api/tracking/response
 * Record a quiz response
 */
router.post("/response", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { lessonId, questionId, category, selectedOption, isCorrect, pointsEarned } = req.body;

        const { error } = await supabaseAdmin
            .from("quiz_responses")
            .insert({
                user_id: userId,
                lesson_id: lessonId,
                question_id: questionId,
                category,
                selected_option: selectedOption,
                is_correct: isCorrect,
                points_earned: pointsEarned || 0
            });

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error("Error saving quiz response:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * GET /api/tracking/weak-topics
 * Get weak topic analysis for the current user
 */
router.get("/weak-topics", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: weakTopics, error } = await supabaseAdmin
            .from("user_weak_topics")
            .select("*")
            .eq("user_id", userId)
            .lte("success_rate", 60) // Topics with less than 60% success
            .order("success_rate", { ascending: true });

        if (error) throw error;

        res.json(weakTopics);
    } catch (error) {
        console.error("Error fetching weak topics:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
