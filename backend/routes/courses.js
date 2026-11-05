// =====================================================
// COURSES API ROUTES
// =====================================================
import express from "express";
import pool from "../config/db.js";
import { authMiddleware, checkCourseEnrollment } from "../middleware/auth.js";
import { generateSignedUrl } from "../utils/r2Utils.js";

const router = express.Router();

router.get("/:courseId/resources", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const access = await checkCourseEnrollment(userId, req.params.courseId);
    if (!access) return res.status(403).json({ error: "Course enrollment required" });
    const result = await pool.query(
      `SELECT l.id, l.title, l.pdf_key, m.title AS module_title
       FROM course_modules cm JOIN modules m ON m.id = cm.module_id
       JOIN lessons l ON l.module_id = m.id
       WHERE cm.course_id = $1 AND l.pdf_key IS NOT NULL
       ORDER BY cm.order_index, l.order_index`,
      [req.params.courseId]
    );
    const resources = await Promise.all(result.rows.map(async (row) => ({
      id: row.id,
      title: row.title,
      chapter: row.module_title,
      url: /^https?:\/\//i.test(row.pdf_key) ? row.pdf_key : await generateSignedUrl(row.pdf_key, 3600),
    })));
    res.json({ resources });
  } catch (error) {
    console.error("Error loading course documents:", error.message);
    res.status(500).json({ error: "Could not load course documents" });
  }
});

/**
 * GET /api/courses
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { category, level } = req.query;
    const userId = req.user?.id || null;

    let sql = `
      SELECT c.*,
        (SELECT COUNT(l.id) FROM lessons l JOIN course_modules cm ON cm.module_id = l.module_id WHERE cm.course_id = c.id AND l.type IS DISTINCT FROM 'quiz')::int AS lessons_count,
        (SELECT COUNT(l.id) FROM lessons l JOIN course_modules cm ON cm.module_id = l.module_id WHERE cm.course_id = c.id AND l.type = 'quiz')::int AS quizzes_count,
        (SELECT COUNT(ls.id) FROM live_sessions ls WHERE ls.course_id = c.id)::int AS lives_count
      FROM courses c
      LEFT JOIN users viewer ON viewer.id = $1
      WHERE c.is_published = true
        AND (
          NOT EXISTS (SELECT 1 FROM offer_courses linked WHERE linked.course_id = c.id)
          OR EXISTS (
            SELECT 1 FROM offer_courses oc
            JOIN offers o ON o.id = oc.offer_id
            WHERE oc.course_id = c.id
              AND o.is_active = true
              AND (o.valid_from IS NULL OR o.valid_from <= NOW())
              AND (o.valid_until IS NULL OR o.valid_until > NOW())
              AND (cardinality(COALESCE(o.target_classes, ARRAY[]::TEXT[])) = 0 OR (
                viewer.class IS NOT NULL AND EXISTS (
                  SELECT 1 FROM unnest(o.target_classes) AS target_class(value)
                  WHERE lower(trim(target_class.value)) = lower(trim(viewer.class))
                )
              ))
              AND (cardinality(COALESCE(o.target_branches, ARRAY[]::TEXT[])) = 0 OR (
                viewer.branch IS NOT NULL AND EXISTS (
                  SELECT 1 FROM unnest(o.target_branches) AS target_branch(value)
                  WHERE lower(trim(target_branch.value)) = lower(trim(viewer.branch))
                )
              ))
          )
          OR EXISTS (
            SELECT 1 FROM enrollments e
            WHERE e.course_id = c.id AND e.user_id = $1
              AND (e.expires_at IS NULL OR e.expires_at > NOW())
          )
        )
    `;
    const params = [userId];

    if (category) {
      params.push(category);
      sql += ` AND c.category = $${params.length}`;
    }
    if (level) {
      params.push(level);
      sql += ` AND c.level = $${params.length}`;
    }

    sql += ` ORDER BY c.created_at DESC`;

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching courses:", error);
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
      `SELECT e.id as enrollment_id, e.enrolled_at, e.expires_at, 
              (e.id IS NOT NULL) as is_enrolled,
              c.id as course_id, c.title, c.description, c.category, c.level, c.thumbnail_url,
              COALESCE(
                (SELECT COUNT(lp.id) FILTER (WHERE lp.completed = true)
                 FROM lessons l2
                 JOIN course_modules cm2 ON l2.module_id = cm2.module_id
                 LEFT JOIN lesson_progress lp ON lp.lesson_id = l2.id AND lp.user_id = $1
                 WHERE cm2.course_id = c.id AND l2.type IS DISTINCT FROM 'quiz'), 0
              ) as dynamic_completed,
              COALESCE(
                (SELECT COUNT(l2.id)
                 FROM lessons l2
                 JOIN course_modules cm2 ON l2.module_id = cm2.module_id
                 WHERE cm2.course_id = c.id AND l2.type IS DISTINCT FROM 'quiz'), 0
              ) as total_lessons
       FROM courses c
       LEFT JOIN enrollments e ON c.id = e.course_id AND e.user_id = $1
         AND (e.expires_at IS NULL OR e.expires_at > NOW())
       WHERE e.user_id = $1
       ORDER BY COALESCE(e.enrolled_at, '2000-01-01'::timestamp) DESC`,
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
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

/**
 * GET /api/courses/:courseId
 */
router.get("/:courseId", authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;

    const userId = req.user?.id || null;
    const courseResult = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(l.id) FROM course_modules cm JOIN lessons l ON l.module_id = cm.module_id
          WHERE cm.course_id = c.id AND l.type IS DISTINCT FROM 'quiz')::int AS lessons_count,
         (SELECT COUNT(l.id) FROM course_modules cm JOIN lessons l ON l.module_id = cm.module_id
          WHERE cm.course_id = c.id AND l.type = 'quiz')::int AS quizzes_count
       FROM courses c
       LEFT JOIN users viewer ON viewer.id = $2
       WHERE c.id = $1 AND c.is_published = true
         AND (
           NOT EXISTS (SELECT 1 FROM offer_courses linked WHERE linked.course_id = c.id)
           OR EXISTS (
             SELECT 1 FROM offer_courses oc
             JOIN offers o ON o.id = oc.offer_id
             WHERE oc.course_id = c.id
               AND o.is_active = true
               AND (o.valid_from IS NULL OR o.valid_from <= NOW())
               AND (o.valid_until IS NULL OR o.valid_until > NOW())
               AND (cardinality(COALESCE(o.target_classes, ARRAY[]::TEXT[])) = 0 OR (
                 viewer.class IS NOT NULL AND EXISTS (
                   SELECT 1 FROM unnest(o.target_classes) AS target_class(value)
                   WHERE lower(trim(target_class.value)) = lower(trim(viewer.class))
                 )
               ))
               AND (cardinality(COALESCE(o.target_branches, ARRAY[]::TEXT[])) = 0 OR (
                 viewer.branch IS NOT NULL AND EXISTS (
                   SELECT 1 FROM unnest(o.target_branches) AS target_branch(value)
                   WHERE lower(trim(target_branch.value)) = lower(trim(viewer.branch))
                 )
               ))
           )
           OR EXISTS (
             SELECT 1 FROM enrollments e
             WHERE e.course_id = c.id AND e.user_id = $2
               AND (e.expires_at IS NULL OR e.expires_at > NOW())
           )
         )`,
      [courseId, userId]
    );

    if (courseResult.rowCount === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    const course = courseResult.rows[0];

    const modulesResult = await pool.query(
      `SELECT m.id, m.title, m.description, cm.order_index FROM course_modules cm
       JOIN modules m ON m.id = cm.module_id
       WHERE cm.course_id = $1 ORDER BY cm.order_index ASC`,
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



export default router;
