// =====================================================
// COURSES API ROUTES
// =====================================================
import express from "express";
import { authMiddleware, checkCourseEnrollment } from "../middleware/auth.js";
import { supabaseAdmin } from "../config/supabase.js";

const router = express.Router();

/**
 * GET /api/courses
 * Get all published courses
 */
router.get("/", async (req, res) => {
  try {
    const { category, level } = req.query;

    let query = supabaseAdmin
      .from("courses")
      .select("*")
      .eq("is_published", true);

    if (category) query = query.eq("category", category);
    if (level) query = query.eq("level", level);

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: "Failed to fetch courses" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/courses/:courseId
 * Get course details with modules and lessons
 */
router.get("/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;

    // Get course with all modules and lessons
    const { data: course, error } = await supabaseAdmin
      .from("courses")
      .select(`
        *,
        modules (
          id,
          title,
          description,
          order_index,
          lessons (
            id,
            title,
            description,
            type,
            duration,
            order_index,
            is_preview
          )
        )
      `)
      .eq("id", courseId)
      .eq("is_published", true)
      .single();

    if (error || !course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Sort modules and lessons by order_index
    if (course.modules) {
      course.modules.sort((a, b) => a.order_index - b.order_index);
      course.modules.forEach(module => {
        if (module.lessons) {
          module.lessons.sort((a, b) => a.order_index - b.order_index);
        }
      });
    }

    res.json(course);
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/courses/:courseId/enrollment
 * Check if current user is enrolled
 * PROTECTED
 */
router.get("/:courseId/enrollment", authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const isEnrolled = await checkCourseEnrollment(userId, courseId);

    res.json({ enrolled: isEnrolled });
  } catch (error) {
    console.error("Error checking enrollment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/courses/:courseId/progress
 * Get user progress for a course
 * PROTECTED
 */
router.get("/:courseId/progress", authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from("enrollments")
      .select("progress, completed_lessons, enrolled_at, last_accessed")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Enrollment not found" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching progress:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/courses/my-courses
 * Get all courses user is enrolled in
 * PROTECTED
 */
router.get("/user/my-courses", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from("enrollments")
      .select(`
        *,
        courses (
          id,
          title,
          description,
          category,
          level,
          thumbnail_url
        )
      `)
      .eq("user_id", userId)
      .order("enrolled_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: "Failed to fetch courses" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching user courses:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
