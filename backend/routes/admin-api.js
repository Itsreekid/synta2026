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

export default router;
