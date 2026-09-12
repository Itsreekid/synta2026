// =====================================================
// COURSES API ROUTES
// =====================================================
import express from "express";
import pool from "../config/db.js";
import { authMiddleware, checkCourseEnrollment } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /api/courses
 */
router.get("/", async (req, res) => {
  try {
    const { category, level } = req.query;

    let sql = `SELECT * FROM courses WHERE is_published = true`;
    const params = [];

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    if (level) {
      params.push(level);
      sql += ` AND level = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/courses/:courseId
 */
router.get("/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;

    const courseResult = await pool.query(
      `SELECT * FROM courses WHERE id = $1 AND is_published = true`,
      [courseId]
    );

    if (courseResult.rowCount === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    const course = courseResult.rows[0];

    const modulesResult = await pool.query(
      `SELECT id, title, description, order_index FROM modules
       WHERE course_id = $1 ORDER BY order_index ASC`,
      [courseId]
    );

    course.modules = await Promise.all(
      modulesResult.rows.map(async (mod) => {
        const lessonsResult = await pool.query(
          `SELECT id, title, description, type, duration, order_index, is_preview
           FROM lessons WHERE module_id = $1 ORDER BY order_index ASC`,
          [mod.id]
        );
        return { ...mod, lessons: lessonsResult.rows };
      })
    );

    res.json(course);
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/courses/:courseId/enrollment — PROTECTED
 */
router.get("/:courseId/enrollment", authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const isEnrolled = await checkCourseEnrollment(userId, courseId);
    res.json({ enrolled: isEnrolled });
  } catch (error) {
    console.error("Error checking enrollment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/courses/:courseId/progress — PROTECTED
 */
router.get("/:courseId/progress", authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `SELECT progress, completed_lessons, enrolled_at, last_accessed
       FROM enrollments WHERE user_id = $1 AND course_id = $2`,
      [userId, courseId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Enrollment not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching progress:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/courses/user/my-courses — PROTECTED
 */
router.get("/user/my-courses", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `SELECT e.*, c.id as course_id, c.title, c.description, c.category, c.level, c.thumbnail_url
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = $1
       ORDER BY e.enrolled_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching user courses:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
