// =====================================================
// PURCHASE API ROUTES
// =====================================================
import express from "express";
import pool from "../config/db.js";

const router = express.Router();

/**
 * POST /api/purchase/course
 */
router.post("/course", async (req, res) => {
  const client = await pool.connect();
  try {
    const { courseId, userId } = req.body;

    if (!courseId || !userId) {
      return res.status(400).json({ error: "Missing required fields: courseId and userId" });
    }

    await client.query("BEGIN");

    const courseResult = await client.query(
      `SELECT price, title, is_free FROM courses WHERE id = $1`,
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

    if (course.is_free) {
      await client.query(
        `INSERT INTO enrollments (user_id, course_id, amount_paid, enrolled_at)
         VALUES ($1, $2, 0, NOW())`,
        [userId, courseId]
      );
      await client.query("COMMIT");
      return res.json({ success: true, message: "Successfully enrolled in free course" });
    }

    // Paid: check balance and deduct atomically
    const userResult = await client.query(
      `SELECT balance FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

    const currentBalance = parseFloat(userResult.rows[0].balance) || 0;
    const price = parseFloat(course.price);

    if (currentBalance < price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Insufficient balance", currentBalance, requiredAmount: price });
    }

    await client.query(`UPDATE users SET balance = balance - $1 WHERE id = $2`, [price, userId]);

    await client.query(
      `INSERT INTO transactions (user_id, amount, type, description, created_at)
       VALUES ($1, $2, 'debit', $3, NOW())`,
      [userId, price, `Course purchase: ${course.title}`]
    );

    await client.query(
      `INSERT INTO enrollments (user_id, course_id, amount_paid, enrolled_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, courseId, price]
    );

    await client.query("COMMIT");

    res.json({ success: true, message: "Course purchased successfully", newBalance: currentBalance - price });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Purchase error:", error);
    res.status(500).json({ error: error.message || "Failed to purchase course" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/purchase/offer
 */
router.post("/offer", async (req, res) => {
  const client = await pool.connect();
  try {
    const { offerId, userId } = req.body;

    if (!offerId || !userId) {
      return res.status(400).json({ error: "Missing required fields: offerId and userId" });
    }

    await client.query("BEGIN");

    const offerResult = await client.query(
      `SELECT o.*, array_agg(oc.course_id) AS course_ids
       FROM offers o
       LEFT JOIN offer_courses oc ON oc.offer_id = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [offerId]
    );
    if (offerResult.rowCount === 0 || !offerResult.rows[0].is_active) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Offer not found or inactive" });
    }
    const offer = offerResult.rows[0];
    const price = parseFloat(offer.fixed_price || 0);

    // Check and deduct balance atomically
    const userResult = await client.query(
      `SELECT balance FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    const currentBalance = parseFloat(userResult.rows[0]?.balance) || 0;

    if (currentBalance < price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Insufficient balance", currentBalance, requiredAmount: price });
    }

    await client.query(`UPDATE users SET balance = balance - $1 WHERE id = $2`, [price, userId]);

    await client.query(
      `INSERT INTO transactions (user_id, amount, type, description, created_at)
       VALUES ($1, $2, 'debit', $3, NOW())`,
      [userId, price, `Offer purchase: ${offer.title}`]
    );

    // Enroll in all courses in the offer
    const courseIds = (offer.course_ids || []).filter(Boolean);
    for (const courseId of courseIds) {
      await client.query(
        `INSERT INTO enrollments (user_id, course_id, amount_paid, offer_id, enrolled_at)
         VALUES ($1, $2, 0, $3, NOW())
         ON CONFLICT (user_id, course_id) DO NOTHING`,
        [userId, courseId, offerId]
      );
    }

    await client.query("COMMIT");

    res.json({ success: true, message: "Offer purchased successfully", newBalance: currentBalance - price });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Offer purchase error:", error);
    res.status(500).json({ error: error.message || "Failed to purchase offer" });
  } finally {
    client.release();
  }
});

export default router;
