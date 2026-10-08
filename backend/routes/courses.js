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
      `SELECT e.id as enrollment_id, e.enrolled_at, e.expires_at, e.status, 
              (e.id IS NOT NULL) as is_enrolled,
              c.id as course_id, c.title, c.description, c.category, c.level, c.thumbnail_url,
              COALESCE(
                (SELECT COUNT(lp.id) FILTER (WHERE lp.completed = true)
                 FROM lessons l2
                 JOIN modules m2 ON l2.module_id = m2.id
                 LEFT JOIN lesson_progress lp ON lp.lesson_id = l2.id AND lp.user_id = $1
                 WHERE m2.course_id = c.id), 0
              ) as dynamic_completed,
              COALESCE(
                (SELECT COUNT(l2.id)
                 FROM lessons l2
                 JOIN modules m2 ON l2.module_id = m2.id
                 WHERE m2.course_id = c.id), 0
              ) as total_lessons
       FROM courses c
       LEFT JOIN enrollments e ON c.id = e.course_id AND e.user_id = $1
       WHERE e.user_id = $1 OR EXISTS (
           SELECT 1 FROM lesson_progress lp 
           JOIN lessons l ON lp.lesson_id = l.id
           JOIN modules m ON l.module_id = m.id
           WHERE m.course_id = c.id AND lp.user_id = $1 AND lp.completed = true
       )
       ORDER BY COALESCE(e.enrolled_at, '2000-01-01') DESC`,
      [userId]
    );

    const rows = result.rows.map(row => {
      const total = parseInt(row.total_lessons) || 0;
      const completed = parseInt(row.dynamic_completed) || 0;
      row.progress = total === 0 ? 0 : Math.round((completed / total) * 100);
      row.completed_lessons = completed;
      return row;
    });

    res.json(rows);
  } catch (error) {
    console.error("Error fetching user courses:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
