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
    const userId = req.user?.id; // May be null for unauthenticated users

    // Get lesson details from database first
    const { data: lesson, error: lessonError } = await supabaseAdmin
      .from("lessons")
      .select("id, title, type, video_key, pdf_key, duration, is_preview, module_id")
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    // Check access: preview lessons are public, others require enrollment
    let hasAccess = lesson.is_preview; // Preview lessons are always accessible

    if (!hasAccess && userId) {
      // Check if user has access to this lesson via enrollment
      hasAccess = await checkLessonAccess(userId, lessonId);
    }
    
    if (!hasAccess) {
      return res.status(403).json({ 
        error: "Access denied. Please enroll in this course first or sign in to access this lesson.",
        isPreview: lesson.is_preview
      });
    }

    // Generate signed URLs for available content
    const response = {
      lessonId: lesson.id,
      title: lesson.title,
      type: lesson.type,
      duration: lesson.duration,
      isPreview: lesson.is_preview
    };

    if (lesson.video_key) {
      response.videoUrl = await generateSignedUrl(lesson.video_key);
    }

    if (lesson.pdf_key) {
      response.pdfUrl = await generateSignedUrl(lesson.pdf_key);
    }

    // Log access (only if user is authenticated)
    if (userId) {
      await supabaseAdmin
        .from("lesson_progress")
        .upsert({
          user_id: userId,
          lesson_id: lessonId,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,lesson_id',
          ignoreDuplicates: false
        });
    }

    res.json(response);
  } catch (error) {
    console.error("Error in lesson content route:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
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

/**
 * GET /api/content/thumbnail/:thumbnailKey
 * Get signed URL for course thumbnail from R2
 * PUBLIC: Anyone can view course thumbnails
 */
router.get("/thumbnail/:thumbnailKey", async (req, res) => {
  try {
    const { thumbnailKey } = req.params;
    
    // Decode the thumbnail key
    const decodedKey = decodeURIComponent(thumbnailKey);
    
    // Generate signed URL for the thumbnail
    const thumbnailUrl = await generateSignedUrl(decodedKey, 3600); // 1 hour expiry for thumbnails
    
    res.json({ 
      url: thumbnailUrl,
      expiresIn: 3600
    });
    
  } catch (error) {
    console.error("Error generating thumbnail URL:", error);
    res.status(500).json({ error: "Failed to generate thumbnail URL" });
  }
});

export default router;
