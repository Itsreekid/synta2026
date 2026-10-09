import express from "express";
import pool from "../config/db.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = express.Router();
const SALT_ROUNDS = 12;

/**
 * GET /api/admin/overview-stats
 */
router.get("/api/admin/overview-stats", requireAdmin, async (req, res) => {
  try {
    const studentResult = await pool.query(`SELECT count(*) FROM users WHERE role = 'user'`);
    const offerResult = await pool.query(`SELECT count(*) FROM offers`);
    const revenueResult = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM purchases WHERE payment_status = 'completed'`);
    
    return res.json({
      success: true,
      students: parseInt(studentResult.rows[0].count, 10),
      offers: parseInt(offerResult.rows[0].count, 10),
      revenue: parseFloat(revenueResult.rows[0].total).toFixed(2)
    });
  } catch (err) {
    console.error("Error in overview-stats:", err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * GET /api/admin/offers
 */
router.get("/api/admin/offers", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM offers ORDER BY created_at DESC`);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Error fetching offers:", err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * POST /api/admin/offers
 */
let offersSchemaReady = false;
async function ensureOffersSchema() {
  if (!offersSchemaReady) {
    try {
      await pool.query(`
        ALTER TABLE offers
        ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5, 2),
        ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb
      `);
      offersSchemaReady = true;
    } catch (err) {
      console.error("Error updating offers schema", err);
    }
  }
}

router.post("/api/admin/offers", requireAdmin, async (req, res) => {
  try {
    const { id, title, description, fixed_price, discount_percentage, is_active, target_classes, target_branches, valid_from, valid_until, features } = req.body;
    
    await ensureOffersSchema();
    
    const parsedDiscount = discount_percentage ? parseFloat(discount_percentage) : null;
    const parsedValidFrom = valid_from ? new Date(valid_from) : null;
    const parsedValidUntil = valid_until ? new Date(valid_until) : null;
    const classesArray = Array.isArray(target_classes) ? target_classes : [];
    const branchesArray = Array.isArray(target_branches) ? target_branches : [];

    if (id) {
      // Update
      await pool.query(
        `UPDATE offers SET title=$1, description=$2, fixed_price=$3, discount_percentage=$4, is_active=$5, target_classes=$6, target_branches=$7, valid_from=$8, valid_until=$9, features=$10 WHERE id=$11`,
        [title, description, fixed_price, parsedDiscount, is_active, classesArray, branchesArray, parsedValidFrom, parsedValidUntil, JSON.stringify(features || []), id]
      );
    } else {
      // Insert
      await pool.query(
        `INSERT INTO offers (title, description, fixed_price, discount_percentage, is_active, target_classes, target_branches, valid_from, valid_until, features) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [title, description, fixed_price, parsedDiscount, is_active, classesArray, branchesArray, parsedValidFrom, parsedValidUntil, JSON.stringify(features || [])]
      );
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("Error managing offer:", err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * GET /api/admin/students
 */
router.get("/api/admin/students", requireAdmin, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, searchTerm = "", classFilter = "", branchFilter = "" } = req.query;
    
    let queryStr = `SELECT id, name as fullname, email, phone as number, class, branch, balance, created_at FROM users WHERE role = 'user'`;
    let countStr = `SELECT count(*) FROM users WHERE role = 'user'`;
    let params = [];
    let paramIndex = 1;
    
    if (searchTerm) {
      const term = `%${searchTerm}%`;
      queryStr += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      countStr += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(term);
      paramIndex++;
    }
    
    if (classFilter) {
      queryStr += ` AND class = $${paramIndex}`;
      countStr += ` AND class = $${paramIndex}`;
      params.push(classFilter);
      paramIndex++;
    }
    
    if (branchFilter) {
      queryStr += ` AND branch = $${paramIndex}`;
      countStr += ` AND branch = $${paramIndex}`;
      params.push(branchFilter);
      paramIndex++;
    }
    
    // Execute count
    const countResult = await pool.query(countStr, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);
    
    // Pagination
    const limit = parseInt(pageSize, 10);
    const offset = (parseInt(page, 10) - 1) * limit;
    
    queryStr += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(queryStr, params);
    
    return res.json({ success: true, data: result.rows, count: totalCount });
  } catch (err) {
    console.error("Error fetching students:", err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * POST /api/admin/change-student-password
 */
router.post("/api/admin/change-student-password", requireAdmin, async (req, res) => {
  try {
    const { studentId, newPassword } = req.body;
    if (!studentId || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: "Invalid parameters" });
    }
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2 AND role = 'user'`, [hash, studentId]);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error changing password:", err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

let usersSchemaReady = false;
async function ensureUsersSchema() {
  if (!usersSchemaReady) {
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS debt NUMERIC(10,2) DEFAULT 0`);
      usersSchemaReady = true;
    } catch (err) {
      console.error("Error updating users schema", err);
    }
  }
}

/**
 * GET /api/admin/student/:id
 */
router.get("/api/admin/student/:id", requireAdmin, async (req, res) => {
  try {
    await ensureUsersSchema();
    const studentRes = await pool.query(`SELECT id, name, email, phone, class, branch, balance, debt, created_at FROM users WHERE id = $1 AND role = 'user'`, [req.params.id]);
    if (studentRes.rowCount === 0) return res.status(404).json({ success: false, error: "Student not found" });

    const offersRes = await pool.query(
      `SELECT o.id, o.title, e.enrolled_at 
       FROM enrollments e 
       JOIN offers o ON e.offer_id = o.id 
       WHERE e.user_id = $1`, 
      [req.params.id]
    );

    return res.json({ success: true, student: studentRes.rows[0], offers: offersRes.rows });
  } catch (err) {
    console.error("Error fetching student details:", err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * DELETE /api/admin/student/:id
 */
router.delete("/api/admin/student/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM users WHERE id = $1 AND role = 'user'`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting student:", err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * POST /api/admin/student/:id/generate-token
 */
router.post("/api/admin/student/:id/generate-token", requireAdmin, async (req, res) => {
  try {
    const studentRes = await pool.query(`SELECT id, role FROM users WHERE id = $1 AND role = 'user'`, [req.params.id]);
    if (studentRes.rowCount === 0) return res.status(404).json({ success: false, error: "Student not found" });

    const token = jwt.sign(
      { id: req.params.id, magic: true },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );

    return res.json({ success: true, url: `/api/auth/magic-login?token=${token}` });
  } catch (err) {
    console.error("Error generating token:", err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * GET /api/admin/active-offers
 */
router.get("/api/admin/active-offers", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, title, fixed_price FROM offers WHERE is_active = true ORDER BY created_at DESC`);
    return res.json({ success: true, offers: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * POST /api/admin/student/:id/enroll-partial
 */
router.post("/api/admin/student/:id/enroll-partial", requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureUsersSchema();
    const { offerId, amountPaid, isExternal } = req.body;
    const userId = req.params.id;

    if (!offerId || amountPaid === undefined) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    await client.query("BEGIN");

    const offerResult = await client.query(
      `SELECT o.*, array_agg(oc.course_id) AS course_ids FROM offers o LEFT JOIN offer_courses oc ON oc.offer_id = o.id WHERE o.id = $1 GROUP BY o.id`,
      [offerId]
    );

    if (offerResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Offer not found" });
    }

    const offer = offerResult.rows[0];
    const price = parseFloat(offer.fixed_price || 0);
    const paid = parseFloat(amountPaid);

    if (paid < 0 || paid > price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "Invalid amount paid" });
    }

    const userResult = await client.query(`SELECT balance FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    const balance = parseFloat(userResult.rows[0].balance || 0);

    const debtAmount = price - paid;

    if (!isExternal) {
      if (balance < paid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, error: "Solde insuffisant pour cette tranche" });
      }
      await client.query(`UPDATE users SET balance = balance - $1, debt = COALESCE(debt, 0) + $2 WHERE id = $3`, [paid, debtAmount, userId]);
    } else {
      await client.query(`UPDATE users SET debt = COALESCE(debt, 0) + $1 WHERE id = $2`, [debtAmount, userId]);
    }

    await client.query(
      `INSERT INTO transactions (user_id, amount, type, status, description, created_at) VALUES ($1, $2, 'purchase', 'completed', $3, NOW())`,
      [userId, paid, isExternal ? `Paiement externe partiel (Tranche) pour l'offre: ${offer.title}` : `Paiement partiel (Tranche) pour l'offre: ${offer.title}`]
    );

    const courseIds = (offer.course_ids || []).filter(Boolean);
    for (const courseId of courseIds) {
      await client.query(
        `INSERT INTO enrollments (user_id, course_id, amount_paid, offer_id, enrolled_at) VALUES ($1, $2, 0, $3, NOW()) ON CONFLICT (user_id, course_id) DO NOTHING`,
        [userId, courseId, offerId]
      );
    }

    await client.query("COMMIT");
    return res.json({ success: true, newDebt: debtAmount });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Enroll partial error:", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/admin/student/:id/pay-debt
 */
router.post("/api/admin/student/:id/pay-debt", requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureUsersSchema();
    const { amount, isExternal } = req.body;
    const userId = req.params.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid amount" });
    }

    await client.query("BEGIN");
    
    const userResult = await client.query(`SELECT balance, debt FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const balance = parseFloat(userResult.rows[0].balance || 0);
    const debt = parseFloat(userResult.rows[0].debt || 0);
    const paid = parseFloat(amount);

    if (paid > debt) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "Amount exceeds debt" });
    }

    if (!isExternal) {
      if (balance < paid) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, error: "Solde insuffisant" });
      }
      await client.query(`UPDATE users SET balance = balance - $1, debt = debt - $1 WHERE id = $2`, [paid, userId]);
    } else {
      await client.query(`UPDATE users SET debt = debt - $1 WHERE id = $2`, [paid, userId]);
    }

    await client.query(
      `INSERT INTO transactions (user_id, amount, type, status, description, created_at) VALUES ($1, $2, 'purchase', 'completed', $3, NOW())`,
      [userId, paid, isExternal ? `Paiement externe du reste de la dette` : `Paiement du reste de la dette`]
    );

    await client.query("COMMIT");
    return res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Pay debt error:", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  } finally {
    client.release();
  }
});

/**
 * GET /api/admin/courses — list all courses (no is_published filter)
 */
router.get("/api/admin/courses", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.title, c.description, c.category, c.level, c.price, c.is_free, c.is_published, c.thumbnail_url, c.created_at,
              COALESCE(array_agg(oc.offer_id) FILTER (WHERE oc.offer_id IS NOT NULL), '{}') AS offers_ids
       FROM courses c
       LEFT JOIN offer_courses oc ON oc.course_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Error fetching courses:", err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * POST /api/admin/courses — create or update a course
 * Body: { id?, title, description, category, level, price, is_free, is_published, thumbnail_url, offers_ids }
 */
router.post("/api/admin/courses", requireAdmin, async (req, res) => {
  try {
    const { id, title, description, category, level, price, is_free, is_published, thumbnail_url, offers_ids } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: "Le titre est requis" });
    }

    let courseId = id;

    if (id) {
      // Update existing course
      await pool.query(
        `UPDATE courses
         SET title=$1, description=$2, category=$3, level=$4, price=$5,
             is_free=$6, is_published=$7, thumbnail_url=$8
         WHERE id=$9`,
        [title, description, category, level, parseFloat(price) || 0, !!is_free, !!is_published, thumbnail_url, id]
      );
    } else {
      // Create new course
      const result = await pool.query(
        `INSERT INTO courses (title, description, category, level, price, is_free, is_published, thumbnail_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [title, description, category, level, parseFloat(price) || 0, !!is_free, !!is_published, thumbnail_url]
      );
      courseId = result.rows[0].id;
    }

    // Update associated offers
    if (Array.isArray(offers_ids)) {
      await pool.query(`DELETE FROM offer_courses WHERE course_id = $1`, [courseId]);
      for (const oid of offers_ids) {
        if (!oid) continue;
        await pool.query(
          `INSERT INTO offer_courses (offer_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [oid, courseId]
        );

        // Retroactively enroll users who bought this offer
        await pool.query(
          `INSERT INTO enrollments (user_id, course_id, amount_paid, offer_id, enrolled_at)
           SELECT DISTINCT user_id, $1, 0, $2, NOW()
           FROM enrollments
           WHERE offer_id = $2
           ON CONFLICT (user_id, course_id) DO NOTHING`,
          [courseId, oid]
        );
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Error managing course:", err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// =====================================================
// PAYMENTS (deposit requests in `transactions`)
// =====================================================

/**
 * GET /api/admin/payments
 * Query: status (pending|completed|rejected|all), search, page, pageSize
 * Returns rows joined with the student's name/email/phone + summary counters.
 */
router.get("/api/admin/payments", requireAdmin, async (req, res) => {
  try {
    const { status = "pending", search = "", page = 1, pageSize = 15 } = req.query;
    const where = [];
    const params = [];

    if (status && status !== "all") {
      // 'completed' and 'approved' are both "confirmed" in this table
      if (status === "completed") {
        where.push(`t.status IN ('completed', 'approved')`);
      } else if (status === "rejected") {
        where.push(`t.status IN ('rejected', 'cancelled')`);
      } else {
        params.push(status);
        where.push(`t.status = $${params.length}`);
      }
    }
    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      where.push(`(u.name ILIKE $${i} OR u.email ILIKE $${i} OR u.phone ILIKE $${i} OR t.transaction_code ILIKE $${i})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.min(parseInt(pageSize, 10) || 15, 100);
    const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

    const [rows, count, summary] = await Promise.all([
      pool.query(
        `SELECT t.id, t.amount, t.type, t.status, t.payment_method, t.transaction_code,
                t.description, t.created_at, t.processed_at, t.receipt_url,
                u.id AS user_id, u.name AS user_name, u.email AS user_email,
                u.phone AS user_phone, u.balance AS user_balance, u.class AS user_class, u.branch AS user_branch
           FROM transactions t
           JOIN users u ON u.id = t.user_id
           ${whereSql}
          ORDER BY t.created_at DESC
          LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
      pool.query(`SELECT count(*) FROM transactions t JOIN users u ON u.id = t.user_id ${whereSql}`, params),
      pool.query(
        `SELECT
           count(*) FILTER (WHERE t.status = 'pending')                               AS pending_count,
           COALESCE(sum(t.amount) FILTER (WHERE t.status = 'pending'), 0)             AS pending_amount,
           count(*) FILTER (WHERE t.status IN ('completed','approved')
                              AND t.processed_at >= date_trunc('day', NOW()))         AS confirmed_today,
           COALESCE(sum(t.amount) FILTER (WHERE t.status IN ('completed','approved')
                              AND t.processed_at >= date_trunc('month', NOW())), 0)   AS confirmed_month_amount
         FROM transactions t JOIN users u ON u.id = t.user_id`
      ),
    ]);

    return res.json({
      success: true,
      data: rows.rows,
      count: parseInt(count.rows[0].count, 10),
      summary: summary.rows[0],
    });
  } catch (err) {
    console.error("Error fetching payments:", err.code, err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * GET /api/admin/payments/:id/receipt
 * Proxies the receipt image from R2 so the bucket can remain private.
 */
router.get("/api/admin/payments/:id/receipt", requireAdmin, async (req, res) => {
  try {
    const txRes = await pool.query(`SELECT receipt_url FROM transactions WHERE id = $1`, [req.params.id]);
    const receipt_url = txRes.rows[0]?.receipt_url;
    
    if (!receipt_url) {
      return res.status(404).send("Receipt not found");
    }

    // If it's a data URI (base64 fallback), just return the base64 string directly
    if (receipt_url.startsWith("data:image/")) {
      const matches = receipt_url.match(/^data:(.+);base64,(.+)$/);
      if (matches) {
        const img = Buffer.from(matches[2], "base64");
        res.writeHead(200, { "Content-Type": matches[1], "Content-Length": img.length });
        return res.end(img);
      }
    }

    // Otherwise, extract the key from the stored URL
    // Stored as: https://pub-db0...r2.dev/receipts/user-timestamp.png
    let key = receipt_url;
    if (receipt_url.includes("/receipts/")) {
      key = "receipts/" + receipt_url.split("/receipts/")[1];
    }

    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { r2Client, R2_BUCKET } = await import("../config/r2.js");

    const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
    const s3Item = await r2Client.send(command);

    res.set("Content-Type", s3Item.ContentType);
    res.set("Content-Length", s3Item.ContentLength);
    s3Item.Body.pipe(res);
  } catch (err) {
    console.error("Error fetching receipt:", err);
    return res.status(500).send("Error fetching receipt");
  }
});

/**
 * POST /api/admin/payments/:id/confirm
 * Marks a pending deposit as completed and credits the student's balance.
 * Runs in a single DB transaction with row locks so a double-click can never
 * credit twice. Works whether or not the DB trigger
 * `tr_on_transaction_confirmed` is installed (it checks if the trigger already
 * credited the balance and only credits manually if it didn't).
 */
router.post("/api/admin/payments/:id/confirm", requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const txRes = await client.query(
      `SELECT id, user_id, amount, type, status FROM transactions WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    const tx = txRes.rows[0];
    if (!tx) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Transaction introuvable" });
    }
    if (tx.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, error: `Transaction déjà traitée (${tx.status})` });
    }

    // Allow the admin to correct the amount actually received
    let amount = parseFloat(tx.amount);
    if (req.body?.amount !== undefined) {
      const corrected = parseFloat(req.body.amount);
      if (!corrected || corrected <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, error: "Montant invalide" });
      }
      amount = corrected;
    }

    const balBefore = await client.query(`SELECT balance FROM users WHERE id = $1 FOR UPDATE`, [tx.user_id]);
    const before = parseFloat(balBefore.rows[0]?.balance ?? 0);

    await client.query(
      `UPDATE transactions
          SET amount = $2, status = 'completed', is_confirmed = true, processed_at = NOW()
        WHERE id = $1`,
      [tx.id, amount]
    );

    const credits = ["deposit", "refund"].includes(tx.type);
    if (credits) {
      const balAfter = await client.query(`SELECT balance FROM users WHERE id = $1`, [tx.user_id]);
      const after = parseFloat(balAfter.rows[0]?.balance ?? 0);
      // DB trigger didn't credit -> do it here
      if (Math.abs(after - before) < 0.001) {
        await client.query(
          `UPDATE users SET balance = COALESCE(balance, 0) + $2 WHERE id = $1`,
          [tx.user_id, amount]
        );
      }
    }

    const finalBal = await client.query(`SELECT balance FROM users WHERE id = $1`, [tx.user_id]);
    await client.query("COMMIT");

    console.log(`[admin/payments] Confirmed ${tx.id} (${amount} DT) for user ${tx.user_id} by ${req.user?.id}`);
    return res.json({ success: true, newBalance: finalBal.rows[0]?.balance });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error confirming payment:", err.code, err.message, err.detail || "");
    return res.status(500).json({ success: false, error: "Internal server error" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/admin/payments/:id/reject
 * Body: { reason? }
 */
router.post("/api/admin/payments/:id/reject", requireAdmin, async (req, res) => {
  try {
    const reason = (req.body?.reason || "").toString().slice(0, 300);
    const result = await pool.query(
      `UPDATE transactions
          SET status = 'rejected', processed_at = NOW(),
              description = CASE WHEN $2 <> '' THEN COALESCE(description, '') || ' — Refusé: ' || $2 ELSE description END
        WHERE id = $1 AND status = 'pending'
        RETURNING id`,
      [req.params.id, reason]
    );
    if (result.rowCount === 0) {
      return res.status(409).json({ success: false, error: "Transaction introuvable ou déjà traitée" });
    }
    console.log(`[admin/payments] Rejected ${req.params.id} by ${req.user?.id}`);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error rejecting payment:", err.code, err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// =====================================================
// NOTIFICATIONS (polled by the admin dashboard)
// =====================================================

/**
 * GET /api/admin/notifications?since=<ISO date>
 * - pendingPayments: total pending deposits (drives the Paiements badge)
 * - newSignups: students created after `since` (drives the Étudiants badge)
 * - events: latest 20 signups + payment requests, newest first (bell dropdown)
 */
router.get("/api/admin/notifications", requireAdmin, async (req, res) => {
  try {
    const sinceDate = new Date(req.query.since || Date.now() - 7 * 24 * 3600 * 1000);
    const since = isNaN(sinceDate) ? new Date(Date.now() - 7 * 24 * 3600 * 1000) : sinceDate;

    const [pending, signups, events] = await Promise.all([
      pool.query(`SELECT count(*) FROM transactions t JOIN users u ON u.id = t.user_id WHERE t.status = 'pending'`),
      pool.query(`SELECT count(*) FROM users WHERE role = 'user' AND created_at > $1`, [since]),
      pool.query(
        `(SELECT 'signup' AS kind, u.id::text AS ref_id, u.name, u.email, NULL::numeric AS amount,
                 NULL::text AS status, u.created_at AS at
            FROM users u WHERE u.role = 'user'
           ORDER BY u.created_at DESC LIMIT 20)
         UNION ALL
         (SELECT 'payment', t.id::text, u.name, u.email, t.amount, t.status, t.created_at
            FROM transactions t JOIN users u ON u.id = t.user_id
           WHERE t.type = 'deposit'
           ORDER BY t.created_at DESC LIMIT 20)
         ORDER BY at DESC LIMIT 20`
      ),
    ]);

    return res.json({
      success: true,
      pendingPayments: parseInt(pending.rows[0].count, 10),
      newSignups: parseInt(signups.rows[0].count, 10),
      events: events.rows,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error fetching notifications:", err.code, err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;

