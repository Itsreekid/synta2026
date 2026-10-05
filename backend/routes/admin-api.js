import express from "express";
import pool from "../config/db.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import bcrypt from "bcrypt";

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
router.post("/api/admin/offers", requireAdmin, async (req, res) => {
  try {
    const { id, title, description, fixed_price, discount_percentage, is_active, target_classes, target_branches, valid_from, valid_until } = req.body;
    
    if (id) {
      // Update
      await pool.query(
        `UPDATE offers SET title=$1, description=$2, fixed_price=$3, discount_percentage=$4, is_active=$5, target_classes=$6, target_branches=$7, valid_from=$8, valid_until=$9 WHERE id=$10`,
        [title, description, fixed_price, discount_percentage, is_active, JSON.stringify(target_classes || []), JSON.stringify(target_branches || []), valid_from, valid_until, id]
      );
    } else {
      // Insert
      await pool.query(
        `INSERT INTO offers (title, description, fixed_price, discount_percentage, is_active, target_classes, target_branches, valid_from, valid_until) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [title, description, fixed_price, discount_percentage, is_active, JSON.stringify(target_classes || []), JSON.stringify(target_branches || []), valid_from, valid_until]
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

/**
 * GET /api/admin/courses — list all courses (no is_published filter)
 */
router.get("/api/admin/courses", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, category, level, price, is_free, is_published, thumbnail_url, created_at
       FROM courses ORDER BY created_at DESC`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Error fetching courses:", err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * POST /api/admin/courses — create or update a course
 * Body: { id?, title, description, category, level, price, is_free, is_published, thumbnail_url }
 */
router.post("/api/admin/courses", requireAdmin, async (req, res) => {
  try {
    const { id, title, description, category, level, price, is_free, is_published, thumbnail_url } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: "Le titre est requis" });
    }

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
      await pool.query(
        `INSERT INTO courses (title, description, category, level, price, is_free, is_published, thumbnail_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [title, description, category, level, parseFloat(price) || 0, !!is_free, !!is_published, thumbnail_url]
      );
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

