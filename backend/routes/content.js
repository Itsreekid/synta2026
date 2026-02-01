// =====================================================
// CONTENT API ROUTES (Main access control logic)
// =====================================================
import express from "express";
import { authMiddleware, checkLessonAccess } from "../middleware/auth.js";
import { generateSignedUrl } from "../utils/r2Utils.js";
import { supabaseAdmin } from "../config/supabase.js";

const router = express.Router();

/**
 * GET /api/content/lesson/:lessonId
 * Get signed URL for lesson content (video/PDF)
 * PROTECTED: Requires authentication and enrollment
 */
router.get("/lesson/:lessonId", authMiddleware, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user.id;

    // 1. Check if user has access to this lesson
    const hasAccess = await checkLessonAccess(userId, lessonId);
    
    if (!hasAccess) {
      return res.status(403).json({ 
        error: "Access denied. Please enroll in this course first." 
      });
    }

    // 2. Get lesson details from database
    const { data: lesson, error } = await supabaseAdmin
      .from("lessons")
      .select("id, title, type, video_key, pdf_key, duration")
      .eq("id", lessonId)
      .single();

    if (error || !lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    // 3. Generate signed URLs for available content
    const response = {
      lessonId: lesson.id,
      title: lesson.title,
      type: lesson.type,
      duration: lesson.duration,
    };

    if (lesson.video_key) {
      response.videoUrl = await generateSignedUrl(lesson.video_key);
    }

    if (lesson.pdf_key) {
      response.pdfUrl = await generateSignedUrl(lesson.pdf_key);
    }

    // 4. Log access (optional - for analytics)
    await supabaseAdmin
      .from("lesson_progress")
      .upsert({
        user_id: userId,
        lesson_id: lessonId,
        updated_at: new Date().toISOString(),
      });

    res.json(response);
  } catch (error) {
    console.error("Error in lesson content route:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/content/lesson/:lessonId/progress
 * Update lesson progress
 */
router.post("/lesson/:lessonId/progress", authMiddleware, async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { completed, progressPercentage, lastPosition } = req.body;
    const userId = req.user.id;

    // Update progress
    const { error } = await supabaseAdmin
      .from("lesson_progress")
      .upsert({
        user_id: userId,
        lesson_id: lessonId,
        completed: completed || false,
        progress_percentage: progressPercentage || 0,
        last_position: lastPosition || 0,
        completed_at: completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      return res.status(500).json({ error: "Failed to update progress" });
    }

    // Update course-level progress
    const { data: lesson } = await supabaseAdmin
      .from("lessons")
      .select("module_id, modules(course_id)")
      .eq("id", lessonId)
      .single();

    if (lesson?.modules?.course_id) {
      await supabaseAdmin.rpc("update_course_progress", {
        p_user_id: userId,
        p_course_id: lesson.modules.course_id,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating progress:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
