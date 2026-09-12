// =====================================================
// ENROLLMENT & PURCHASE API ROUTES
// =====================================================
import express from "express";
import pool from "../config/db.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";

const router = express.Router();

/**
 * POST /api/enrollment/enroll — PROTECTED
 */
router.post("/enroll", authApiMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { courseId, paymentId, amountPaid } = req.body;
    const userId = req.user.id;

    if (!courseId) return res.status(400).json({ error: "Course ID is required" });

    await client.query("BEGIN");

    const courseResult = await client.query(
      `SELECT id, title, price, is_free FROM courses WHERE id = $1 AND is_published = true`,
      [courseId]
    );
    if (courseResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Course not found" });
    }
    const course = courseResult.rows[0];

    const existing = await client.query(
      `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`,
      [userId, courseId]
    );
    if (existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Already enrolled in this course" });
    }

    if (!course.is_free && !paymentId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Payment required for this course" });
    }

    const enrollResult = await client.query(
      `INSERT INTO enrollments (user_id, course_id, payment_id, amount_paid, enrolled_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [userId, courseId, paymentId || null, amountPaid ?? course.price]
    );

    if (!course.is_free) {
      await client.query(
        `INSERT INTO purchases (user_id, course_id, amount, payment_status, transaction_id, purchased_at, confirmed_at)
         VALUES ($1, $2, $3, 'completed', $4, NOW(), NOW())`,
        [userId, courseId, amountPaid ?? course.price, paymentId]
      );
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      enrollment: enrollResult.rows[0],
      message: `Successfully enrolled in ${course.title}`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in enrollment:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/enrollment/free-enroll/:courseId — PROTECTED
 */
router.post("/free-enroll/:courseId", authApiMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const courseResult = await pool.query(
      `SELECT id, title FROM courses WHERE id = $1 AND is_free = true AND is_published = true`,
      [courseId]
    );
    if (courseResult.rowCount === 0) {
      return res.status(404).json({ error: "Free course not found" });
    }

    const existing = await pool.query(
      `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`,
      [userId, courseId]
    );
    if (existing.rowCount > 0) {
      return res.json({ success: true, message: "Already enrolled" });
    }

    await pool.query(
      `INSERT INTO enrollments (user_id, course_id, amount_paid, enrolled_at)
       VALUES ($1, $2, 0, NOW())`,
      [userId, courseId]
    );

    res.json({ success: true, message: `Enrolled in ${courseResult.rows[0].title}` });
  } catch (error) {
    console.error("Error in free enrollment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/enrollment/my-enrollments — PROTECTED
 */
router.get("/my-enrollments", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT e.*, c.id as course_id, c.title, c.description, c.category, c.thumbnail_url
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = $1
       ORDER BY e.enrolled_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching enrollments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/enrollment/offers
 */
router.get("/offers", async (req, res) => {
  try {
    const offersResult = await pool.query(
      `SELECT o.*, array_agg(
         json_build_object('id', c.id, 'title', c.title, 'price', c.price, 'thumbnail_url', c.thumbnail_url)
       ) AS courses
       FROM offers o
       LEFT JOIN offer_courses oc ON oc.offer_id = o.id
       LEFT JOIN courses c ON c.id = oc.course_id
       WHERE o.is_active = true
         AND (o.valid_until IS NULL OR o.valid_until > NOW())
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    );

    res.json(offersResult.rows);
  } catch (error) {
    console.error("Error fetching offers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
