// =====================================================
// PURCHASE API ROUTES
// =====================================================
import express from "express";
import pool from "../config/db.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";
import { matchesOfferTarget, offerEntitlement } from "../utils/offerAccess.js";

const router = express.Router();

/**
 * POST /api/purchase/course
 */
router.post("/course", authApiMiddleware, async (req, res) => {
  let client;
  try {
    const { courseId } = req.body;
    const userId = req.user.id;

    if (!courseId) {
      return res.status(400).json({ error: "Missing required field: courseId" });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const courseResult = await client.query(
      `SELECT price, title, is_free FROM courses WHERE id = $1 AND is_published = true`,
      [courseId]
    );
    if (courseResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Course not found" });
    }
    const course = courseResult.rows[0];

    const userResult = await client.query(
      "SELECT balance FROM users WHERE id = $1 FOR UPDATE", [userId]
    );
    if (!userResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

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

    const currentBalance = parseFloat(userResult.rows[0].balance) || 0;
    const price = parseFloat(course.price);
    if (!Number.isFinite(price) || price <= 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Invalid paid course price" });
    }
    if (currentBalance < price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Insufficient balance", currentBalance, requiredAmount: price });
    }

    const debit = await client.query(
      `UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING balance`, [course.price, userId]
    );

    const ledger = await client.query(
      `INSERT INTO transactions (user_id, amount, type, status, description, created_at)
       VALUES ($1, $2, 'purchase', 'completed', $3, NOW()) RETURNING id`,
      [userId, course.price, `Course purchase: ${course.title}`]
    );

    await client.query(
      `INSERT INTO enrollments (user_id, course_id, amount_paid, payment_id, enrolled_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, courseId, course.price, ledger.rows[0].id]
    );

    await client.query("COMMIT");

    res.json({ success: true, message: "Course purchased successfully", newBalance: Number(debit.rows[0].balance) });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Course purchase failed:", error.code);
    res.status(500).json({ error: "Failed to purchase course" });
  } finally {
    client?.release();
  }
});

/**
 * POST /api/purchase/offer
 */
router.post("/offer", authApiMiddleware, async (req, res) => {
  const { offerId } = req.body || {};
  const userId = req.user.id;
  if (!offerId) return res.status(400).json({ error: "Missing required field: offerId" });

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const userResult = await client.query(
      "SELECT balance, class, branch FROM users WHERE id = $1 FOR UPDATE", [userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

    // The authenticated user and offer form the server-side idempotency key.
    const owned = await client.query(
      `SELECT ${offerEntitlement("$1", "$2")} AS owned`, [userId, offerId]
    );
    const currentBalance = Number(user.balance);
    if (!Number.isFinite(currentBalance)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Wallet balance is invalid" });
    }
    if (owned.rows[0].owned) {
      await client.query("COMMIT");
      return res.json({ success: true, alreadyPurchased: true, newBalance: currentBalance });
    }

    const offerResult = await client.query(
      `SELECT o.*, ARRAY(SELECT oc.course_id FROM offer_courses oc WHERE oc.offer_id = o.id) AS course_ids
       FROM offers o WHERE o.id = $1 AND o.is_active = true
         AND (o.valid_from IS NULL OR o.valid_from <= NOW())
         AND (o.valid_until IS NULL OR o.valid_until > NOW())
       FOR SHARE`, [offerId]
    );
    const offer = offerResult.rows[0];
    if (!offer || !matchesOfferTarget(offer, user)) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Offer unavailable" });
    }
    const price = Number(offer.fixed_price);
    if (!offer.course_ids.length || !Number.isFinite(price) || price < 0 || offer.fixed_price == null) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Offer configuration is incomplete" });
    }
    if (currentBalance < price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Insufficient balance", currentBalance, requiredAmount: price });
    }

    const payment = await client.query(
      `INSERT INTO payments (user_id, offer_id, amount, status)
       VALUES ($1, $2, $3, 'wallet_completed') RETURNING id`, [userId, offerId, offer.fixed_price]
    );
    const debit = await client.query(
      "UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING balance", [offer.fixed_price, userId]
    );
    await client.query(
      `INSERT INTO transactions (user_id, amount, type, status, transaction_code, description)
       VALUES ($1, $2, 'purchase', 'completed', $3, $4)`,
      [userId, offer.fixed_price, `wallet-offer:${payment.rows[0].id}`, `Offer purchase: ${offer.title}`]
    );

    await client.query(
      `INSERT INTO enrollments (user_id, course_id, amount_paid, offer_id)
       SELECT $1, course_id, 0, $3 FROM unnest($2::uuid[]) AS courses(course_id)
       ON CONFLICT (user_id, course_id) DO UPDATE
       SET expires_at = NULL, offer_id = EXCLUDED.offer_id
       WHERE enrollments.expires_at <= NOW()`, [userId, offer.course_ids, offerId]
    );
    await client.query("COMMIT");
    return res.json({ success: true, message: "Offer purchased successfully", newBalance: Number(debit.rows[0].balance) });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Offer purchase failed:", error.code);
    return res.status(500).json({ error: "Failed to purchase offer" });
  } finally {
    client?.release();
  }
});

export default router;
