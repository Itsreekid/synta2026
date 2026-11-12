import { offerTerms } from "../services/timed-offers.js";
import { randomUUID } from "node:crypto";
import express from "express";
import pool from "../config/db.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createR2UploadUrl, deleteFromR2, listRecentR2Objects, readR2ObjectMetadata, uploadToR2 } from "../utils/r2Utils.js";
import { offerEntitlement, legacyOfferEntitlement } from "../utils/offerAccess.js";

import { COURSE_IMAGE_PREFIX, courseImagePath, decodeCourseImage, isCourseImageKey } from "../utils/courseImages.js";

const router = express.Router();
const SALT_ROUNDS = 12;

/**
 * GET /api/admin/overview-stats
 */
router.get("/api/admin/overview-stats", requireAdmin, async (req, res) => {
  try {
    const studentResult = await pool.query(`SELECT count(*) FROM users WHERE role = 'user'`);
    const offerResult = await pool.query(`SELECT count(*) FROM offers WHERE is_active = true`);
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
    const result = await pool.query(`SELECT *, access_cutoff_date::text AS access_cutoff_date FROM offers ORDER BY created_at DESC`);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Error fetching offers:", err.message);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.patch("/api/admin/offers/:id/status", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body ?? {};
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) || typeof is_active !== "boolean") {
    return res.status(400).json({ success: false, error: "Statut ou offre invalide." });
  }

  try {
    const { rows } = await pool.query(
      "UPDATE offers SET is_active = $1 WHERE id = $2 RETURNING is_active",
      [is_active, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: "Offre introuvable." });
    return res.json({ success: true, is_active: rows[0].is_active });
  } catch (err) {
    console.error("Error updating offer status:", err.code);
    return res.status(500).json({ success: false, error: "Impossible de modifier le statut." });
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
        ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS is_best_seller BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS image_url TEXT
      `);
      offersSchemaReady = true;
    } catch (err) {
      console.error("Error updating offers schema", err);
    }
  }
}

router.post("/api/admin/offers", requireAdmin, async (req, res) => {
  try {
    const { id, title, description, fixed_price, discount_percentage, is_active, target_classes, target_branches, valid_from, valid_until, features, is_best_seller, image_url } = req.body;
    
    const hasTerms = Object.hasOwn(req.body, "access_mode");
    const terms = hasTerms ? offerTerms(req.body) : [null, null, null, null];
    await ensureOffersSchema();
    
    const parsedDiscount = discount_percentage ? parseFloat(discount_percentage) : null;
    const parsedValidFrom = valid_from ? new Date(valid_from) : null;
    const parsedValidUntil = valid_until ? new Date(valid_until) : null;
    const classesArray = Array.isArray(target_classes) ? target_classes : [];
    const branchesArray = Array.isArray(target_branches) ? target_branches : [];

    if (id) {
      // Update
      await pool.query(
        `UPDATE offers SET title=$1, description=$2, fixed_price=$3, discount_percentage=$4, is_active=$5, target_classes=$6, target_branches=$7, valid_from=$8, valid_until=$9, features=$10, is_best_seller=$11, image_url=$12,
           access_mode=CASE WHEN $18 THEN $14 ELSE access_mode END,
           academic_year_start=CASE WHEN $18 THEN $15 ELSE academic_year_start END,
           access_cutoff_date=CASE WHEN $18 THEN $16 ELSE access_cutoff_date END,
           minimum_initial_payment=CASE WHEN $18 THEN $17 ELSE minimum_initial_payment END WHERE id=$13`,
        [title, description, fixed_price, parsedDiscount, is_active, classesArray, branchesArray, parsedValidFrom, parsedValidUntil, JSON.stringify(features || []), !!is_best_seller, image_url || null, id, ...terms, hasTerms]
      );
    } else {
      // Insert
      await pool.query(
        `INSERT INTO offers (title, description, fixed_price, discount_percentage, is_active, target_classes, target_branches, valid_from, valid_until, features, is_best_seller, image_url, access_mode, academic_year_start, access_cutoff_date, minimum_initial_payment) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [title, description, fixed_price, parsedDiscount, is_active, classesArray, branchesArray, parsedValidFrom, parsedValidUntil, JSON.stringify(features || []), !!is_best_seller, image_url || null, ...terms]
      );
    }
    return res.json({ success: true });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
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
    if (!studentId || typeof newPassword !== "string" || newPassword.length < 6 || Buffer.byteLength(newPassword) > 72) {
      return res.status(400).json({ success: false, error: "Invalid parameters" });
    }
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, verification_token = NULL, token_expires_at = NULL,
                       updated_at = NOW()
       WHERE id = $2 AND role = 'user'`, [hash, studentId]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "Student not found" });
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
      `SELECT o.id, o.title FROM offers o WHERE ${offerEntitlement("$1", "o.id")}`,
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
    const result = await pool.query(`SELECT id, title, fixed_price, access_mode, minimum_initial_payment FROM offers WHERE is_active = true ORDER BY created_at DESC`);
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

    const userResult = await client.query(`SELECT balance FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (!userResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Student not found" });
    }
    const offerResult = await client.query(
      `SELECT o.*, ARRAY(SELECT oc.course_id FROM offer_courses oc WHERE oc.offer_id=o.id) AS course_ids
       FROM offers o WHERE o.id=$1 FOR SHARE`, [offerId]
    );
    if (!offerResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Offer not found" });
    }
    const offer = offerResult.rows[0];
    if (offer.access_mode) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, error: "Confirmez une tranche via le parcours à durée limitée." });
    }
    const price = parseFloat(offer.fixed_price || 0);
    const paid = parseFloat(amountPaid);
    const courseIds = (offer.course_ids || []).filter(Boolean);
    if (!courseIds.length || !Number.isFinite(paid) || !Number.isFinite(price) || paid < 0 || paid > price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "Invalid amount paid" });
    }
    const owned = await client.query(
      `SELECT ${offerEntitlement("$1", "$2")} AS owned`, [userId, offerId]
    );
    if (owned.rows[0].owned) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, error: "Cet étudiant a déjà accès à cette offre." });
    }
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

    await client.query(
      `INSERT INTO payments (user_id, offer_id, amount, status)
       VALUES ($1, $2, $3, 'admin_authorized')`, [userId, offerId, paid]
    );
    for (const courseId of courseIds) {
      await client.query(
        `INSERT INTO enrollments (user_id, course_id, amount_paid, offer_id, enrolled_at)
         VALUES ($1, $2, 0, $3, NOW()) ON CONFLICT (user_id, course_id) DO UPDATE
         SET expires_at = NULL, timed_access_only=false, offer_id = EXCLUDED.offer_id WHERE enrollments.expires_at <= NOW()`,
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

router.get("/api/admin/course-images", requireAdmin, async (_req, res) => {
  try {
    const objects = await listRecentR2Objects(COURSE_IMAGE_PREFIX, isCourseImageKey, 24);
    return res.json({
      success: true,
      images: objects.map(({ Key }) => ({ url: courseImagePath(Key), name: Key.split("/").at(-1) }))
    });
  } catch (error) {
    console.warn("Course image listing failed:", error.name);
    return res.status(503).json({ success: false, error: "Images récentes indisponibles." });
  }
});

router.post("/api/admin/course-images", requireAdmin, async (req, res) => {
  const image = decodeCourseImage(req.body?.data);
  if (!image) {
    return res.status(400).json({ success: false, error: "Choisissez une image PNG, JPEG, GIF, WebP ou AVIF de 5 Mo maximum." });
  }
  const key = COURSE_IMAGE_PREFIX + randomUUID() + "." + image.extension;
  try {
    await uploadToR2(key, image.bytes, image.contentType);
    return res.status(201).json({ success: true, url: courseImagePath(key) });
  } catch (error) {
    console.warn("Course image upload failed:", error.name);
    return res.status(503).json({ success: false, error: "Impossible d’importer cette image." });
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
           SELECT u.id, $1::uuid, 0, $2::uuid, NOW()
           FROM users u
           WHERE ${legacyOfferEntitlement("u.id", "$2")}
           ON CONFLICT (user_id, course_id) DO UPDATE SET timed_access_only=false,expires_at=NULL,offer_id=EXCLUDED.offer_id WHERE enrollments.timed_access_only`,
          [courseId, oid]
        );
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Error managing course:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Course content management. Modules are reusable; course_modules stores each placement.
router.get("/api/admin/courses/:courseId/modules", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.id, m.title, m.description, cm.order_index,
              COUNT(l.id)::int AS lesson_count,
              COALESCE(json_agg(json_build_object(
                'id', l.id, 'title', l.title, 'description', l.description,
                'type', l.type, 'duration', l.duration, 'order_index', l.order_index,
                'is_preview', l.is_preview, 'has_document', (l.pdf_key IS NOT NULL),
                'has_video', (NULLIF(TRIM(l.video_key), '') IS NOT NULL), 'content', l.content,
                'resources', COALESCE((SELECT json_agg(json_build_object(
                  'id', lr.id, 'title', lr.title, 'file_name', lr.file_name, 'file_size', lr.file_size
                ) ORDER BY lr.created_at) FROM learning_resources lr WHERE lr.lesson_id = l.id), '[]'::json)
              ) ORDER BY l.order_index) FILTER (WHERE l.id IS NOT NULL), '[]') AS lessons
       FROM course_modules cm JOIN modules m ON m.id = cm.module_id
       LEFT JOIN lessons l ON l.module_id = m.id
       WHERE cm.course_id = $1
       GROUP BY m.id, cm.order_index ORDER BY cm.order_index, m.title`,
      [req.params.courseId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error listing course chapters:", error.message);
    res.status(500).json({ success: false, error: "Could not load course chapters" });
  }
});

router.get("/api/admin/modules/library", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.id, m.title, m.description, COUNT(DISTINCT cm.course_id)::int AS course_count
       FROM modules m LEFT JOIN course_modules cm ON cm.module_id = m.id
       GROUP BY m.id ORDER BY m.title`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error listing chapter library:", error.message);
    res.status(500).json({ success: false, error: "Could not load chapter library" });
  }
});

router.post("/api/admin/courses/:courseId/modules", requireAdmin, async (req, res) => {
  const { courseId } = req.params;
  const { moduleId, title, description = "", orderIndex } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const course = await client.query("SELECT id FROM courses WHERE id = $1", [courseId]);
    if (!course.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Course not found" });
    }
    const order = Number.isInteger(Number(orderIndex)) ? Number(orderIndex) : 0;
    let selectedModuleId = moduleId;
    if (moduleId) {
      const existing = await client.query("SELECT id FROM modules WHERE id = $1", [moduleId]);
      if (!existing.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, error: "Chapter not found" });
      }
    } else {
      if (typeof title !== "string" || !title.trim()) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, error: "Chapter title is required" });
      }
      const created = await client.query(
        `INSERT INTO modules (course_id, title, description, order_index)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [courseId, title.trim(), String(description).trim() || null, order]
      );
      selectedModuleId = created.rows[0].id;
    }
    await client.query(
      `INSERT INTO course_modules (course_id, module_id, order_index)
       VALUES ($1, $2, $3) ON CONFLICT (course_id, module_id) DO UPDATE SET order_index = EXCLUDED.order_index`,
      [courseId, selectedModuleId, order]
    );
    await client.query("COMMIT");
    res.status(201).json({ success: true, moduleId: selectedModuleId });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error assigning chapter:", error.message);
    res.status(500).json({ success: false, error: "Could not assign chapter" });
  } finally {
    client.release();
  }
});

router.patch("/api/admin/courses/:courseId/modules/:moduleId", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE course_modules SET order_index = $1 WHERE course_id = $2 AND module_id = $3 RETURNING course_id`,
      [Math.max(0, Number(req.body?.orderIndex) || 0), req.params.courseId, req.params.moduleId]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "Chapter placement not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating chapter order:", error.message);
    res.status(500).json({ success: false, error: "Could not update chapter" });
  }
});

router.patch("/api/admin/modules/:moduleId", requireAdmin, async (req, res) => {
  const { title, description } = req.body || {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ success: false, error: "Chapter title is required" });
  }
  try {
    const result = await pool.query(
      "UPDATE modules SET title = $1, description = $2 WHERE id = $3 RETURNING id",
      [title.trim(), String(description || "").trim() || null, req.params.moduleId]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "Chapter not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating chapter:", error.message);
    res.status(500).json({ success: false, error: "Could not update chapter" });
  }
});

router.delete("/api/admin/courses/:courseId/modules/:moduleId", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM course_modules WHERE course_id = $1 AND module_id = $2 RETURNING module_id",
      [req.params.courseId, req.params.moduleId]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "Chapter placement not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error removing chapter from course:", error.message);
    res.status(500).json({ success: false, error: "Could not remove chapter" });
  }
});

router.post("/api/admin/modules/:moduleId/lessons", requireAdmin, async (req, res) => {
  const { title, description = "", type = "video", duration = 0, isPreview = false, content = {} } = req.body || {};
  if (typeof title !== "string" || !title.trim() || !["video", "pdf", "quiz"].includes(type)) {
    return res.status(400).json({ success: false, error: "A title and valid lesson type are required" });
  }
  if (type === "quiz" && !isValidInteractiveQuiz(content)) {
    return res.status(400).json({ success: false, error: "A quiz must contain exactly 3 valid questions" });
  }
  try {
    const module = await pool.query("SELECT id FROM modules WHERE id = $1", [req.params.moduleId]);
    if (!module.rowCount) return res.status(404).json({ success: false, error: "Chapter not found" });
    const result = await pool.query(
      `INSERT INTO lessons (module_id, title, description, type, duration, is_preview, order_index, content)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT MAX(order_index) + 1 FROM lessons WHERE module_id = $1), 0), $7::jsonb)
       RETURNING id, title, description, type, duration, is_preview, order_index, content`,
      [req.params.moduleId, title.trim(), String(description).trim() || null, type, Math.max(0, Number(duration) || 0), !!isPreview, JSON.stringify(type === "quiz" ? content : {})]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error creating lesson:", error.message);
    res.status(500).json({ success: false, error: "Could not create lesson" });
  }
});

router.patch("/api/admin/lessons/:lessonId", requireAdmin, async (req, res) => {
  const { title, description, type, duration, isPreview, orderIndex, content } = req.body || {};
  if (type !== undefined && !["video", "pdf", "quiz"].includes(type)) {
    return res.status(400).json({ success: false, error: "Invalid lesson type" });
  }
  if (content !== undefined && type !== "quiz") {
    return res.status(400).json({ success: false, error: "Quiz content can only be saved on quiz lessons" });
  }
  if (content !== undefined && !isValidInteractiveQuiz(content)) {
    return res.status(400).json({ success: false, error: "A quiz must contain exactly 3 valid questions" });
  }
  try {
    const result = await pool.query(
      `UPDATE lessons SET title = COALESCE($1, title),
         description = CASE WHEN $7 THEN $2 ELSE description END,
         type = COALESCE($3, type), duration = COALESCE($4, duration),
         is_preview = COALESCE($5, is_preview), order_index = COALESCE($6, order_index),
         content = COALESCE($8::jsonb, content)
       WHERE id = $9 RETURNING id`,
      [title?.trim() || null, description === undefined ? null : (String(description).trim() || null), type ?? null,
       duration === undefined ? null : Math.max(0, Number(duration) || 0), isPreview ?? null,
       orderIndex === undefined ? null : Math.max(0, Number(orderIndex) || 0), description !== undefined,
       content === undefined ? null : JSON.stringify(content), req.params.lessonId]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "Lesson not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating lesson:", error.message);
    res.status(500).json({ success: false, error: "Could not update lesson" });
  }
});

function isValidInteractiveQuiz(content) {
  const allowedTypes = new Set(["multiple_choice", "true_false", "code_drag_drop", "ordering", "matching"]);
  if (!content || !Array.isArray(content.questions) || content.questions.length !== 3) return false;
  if (Object.hasOwn(content, "timeLimitSeconds") && (!Number.isInteger(content.timeLimitSeconds) ||
      content.timeLimitSeconds < 15 || content.timeLimitSeconds > 3600)) return false;
  return content.questions.every((question) => {
    if (!question || typeof question.text !== "string" || !question.text.trim() || !allowedTypes.has(question.type)) return false;
    if (question.type === "multiple_choice") return Array.isArray(question.options) && question.options.length >= 2 && question.options.includes(question.answer);
    if (question.type === "true_false") return typeof question.answer === "boolean";
    if (question.type === "code_drag_drop") return Array.isArray(question.options) && question.options.length >= 2 && question.options.includes(question.answer);
    if (question.type === "ordering") return Array.isArray(question.items) && question.items.length >= 2 && Array.isArray(question.answer) && question.answer.length === question.items.length;
    return Array.isArray(question.pairs) && question.pairs.length >= 2 && question.pairs.every(pair => pair.left && pair.right);
  });
}

router.delete("/api/admin/lessons/:lessonId", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM lessons WHERE id = $1 RETURNING id", [req.params.lessonId]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: "Lesson not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting lesson:", error.message);
    res.status(500).json({ success: false, error: "Could not delete lesson" });
  }
});

const lessonVideoLimit = 1024 ** 3;
const lessonVideoTypes = { mp4: "video/mp4", webm: "video/webm" };

router.post("/api/admin/lessons/:lessonId/video-upload-url", requireAdmin, async (req, res) => {
  const { fileName, size } = req.body || {};
  const extension = typeof fileName === "string" ? /\.(mp4|webm)$/i.exec(fileName)?.[1].toLowerCase() : null;
  if (!extension || !Number.isSafeInteger(size) || size < 1 || size > lessonVideoLimit) {
    return res.status(400).json({ error: "Choisissez une vidéo MP4 ou WebM de 1 Go maximum." });
  }
  try {
    const { rows: [lesson] } = await pool.query("SELECT id FROM lessons WHERE id=$1 AND type='video'", [req.params.lessonId]);
    if (!lesson) return res.status(404).json({ error: "Leçon vidéo introuvable." });
    const key = `lesson-videos/${lesson.id}/${randomUUID()}.${extension}`;
    const contentType = lessonVideoTypes[extension];
    const uploadUrl = await createR2UploadUrl(key, contentType);
    res.json({ success: true, key, uploadUrl, contentType });
  } catch (error) {
    console.error("Lesson video upload preparation failed:", error.code ?? error.name);
    res.status(500).json({ error: "Impossible de préparer le téléversement." });
  }
});

router.patch("/api/admin/lessons/:lessonId/video", requireAdmin, async (req, res) => {
  const { lessonId } = req.params;
  const { key } = req.body || {};
  try {
    if (key !== null) {
      const prefix = `lesson-videos/${lessonId}/`;
      const file = typeof key === "string" && key.startsWith(prefix) &&
        /^[0-9a-f-]{36}\.(mp4|webm)$/.exec(key.slice(prefix.length));
      if (!file) return res.status(400).json({ error: "Vidéo invalide pour cette leçon." });
      const object = await readR2ObjectMetadata(key);
      if (object.ContentType !== lessonVideoTypes[file[1]] ||
          !Number.isSafeInteger(object.ContentLength) || object.ContentLength < 1 || object.ContentLength > lessonVideoLimit) {
        return res.status(400).json({ error: "La vidéo téléversée est invalide." });
      }
    }
    const result = await pool.query("UPDATE lessons SET video_key=$1 WHERE id=$2 AND type='video' RETURNING id", [key, lessonId]);
    if (!result.rowCount) return res.status(404).json({ error: "Leçon vidéo introuvable." });
    res.json({ success: true, has_video: key !== null });
  } catch (error) {
    if (error.$metadata?.httpStatusCode === 404) {
      return res.status(400).json({ error: "Le fichier n’a pas été téléversé." });
    }
    console.error("Lesson video update failed:", error.code ?? error.name);
    res.status(500).json({ error: "Impossible de modifier la vidéo." });
  }
});

router.post("/api/admin/lessons/:lessonId/document-upload-url", requireAdmin, async (req, res) => {
  const { fileName, contentType, size } = req.body || {};
  if (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > 25 * 1024 * 1024) {
    return res.status(400).json({ success: false, error: "Document size must be 25 MB or less" });
  }
  if (!new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]).has(contentType)) {
    return res.status(400).json({ success: false, error: "Only PDF or Word documents are supported" });
  }
  try {
    const lesson = await pool.query("SELECT id, module_id FROM lessons WHERE id = $1", [req.params.lessonId]);
    if (!lesson.rowCount) return res.status(404).json({ success: false, error: "Lesson not found" });
    const safeName = String(fileName || "document").normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    const key = `course-documents/${lesson.rows[0].module_id}/${req.params.lessonId}/${Date.now()}-${safeName}`;
    const uploadUrl = await createR2UploadUrl(key, contentType);
    res.json({ success: true, uploadUrl, key });
  } catch (error) {
    console.error("Could not create document upload URL:", error.message);
    res.status(500).json({ success: false, error: "Could not prepare document upload" });
  }
});

router.patch("/api/admin/lessons/:lessonId/document", requireAdmin, async (req, res) => {
  const { key } = req.body || {};
  if (typeof key !== "string" || !key.startsWith("course-documents/") || key.includes("..")) {
    return res.status(400).json({ success: false, error: "Invalid document key" });
  }
  try {
    const result = await pool.query("UPDATE lessons SET pdf_key = $1 WHERE id = $2 RETURNING id", [key, req.params.lessonId]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: "Lesson not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Could not attach lesson document:", error.message);
    res.status(500).json({ success: false, error: "Could not attach document" });
  }
});

const resourceExtensions = new Set([
  "pdf", "doc", "docx", "odt", "rtf", "ppt", "pptx", "odp", "xls", "xlsx", "ods", "csv",
  "md", "txt", "py", "html", "htm", "css", "js", "mjs", "json", "c", "cpp", "h", "hpp",
  "java", "pas", "alg", "algo", "zip", "png", "jpg", "jpeg", "webp", "gif", "svg",
]);
const resourceMimeTypes = new Set([
  "text/x-python", "application/x-python", "text/html", "text/css", "text/javascript",
  "application/javascript", "application/json", "text/plain", "text/markdown", "text/csv",
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf", "text/rtf", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.presentation",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet", "image/png", "image/jpeg", "image/webp",
  "image/gif", "image/svg+xml", "text/x-c", "text/x-c++", "text/x-pascal",
  "application/zip", "application/x-zip-compressed",
  "application/octet-stream",
]);

function isAllowedResourceFile(fileName, contentType) {
  const extension = String(fileName || "").split(".").pop()?.toLowerCase();
  return resourceExtensions.has(extension) && resourceMimeTypes.has(contentType);
}

router.post("/api/admin/resources/upload-url", requireAdmin, async (req, res) => {
  const { lessonId, liveSessionId, fileName, contentType, size } = req.body || {};
  if (Boolean(lessonId) === Boolean(liveSessionId)) {
    return res.status(400).json({ error: "Choose exactly one lesson or live session" });
  }
  if (!isAllowedResourceFile(fileName, contentType)) {
    return res.status(400).json({ error: "Unsupported file type. Use common documents, slides, spreadsheets, images, code files, or ZIP archives." });
  }
  if (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > 25 * 1024 * 1024) {
    return res.status(400).json({ error: "Each practice file must be 25 MB or less" });
  }
  try {
    const ownerTable = lessonId ? "lessons" : "live_sessions";
    const ownerId = lessonId || liveSessionId;
    const owner = await pool.query(`SELECT id FROM ${ownerTable} WHERE id = $1`, [ownerId]);
    if (!owner.rowCount) return res.status(404).json({ error: "Lesson or session not found" });
    const safeName = String(fileName).normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const ownerType = lessonId ? "lessons" : "sessions";
    const key = `learning-resources/${ownerType}/${ownerId}/${Date.now()}-${safeName}`;
    const uploadUrl = await createR2UploadUrl(key, contentType, 900);
    res.json({ uploadUrl, key });
  } catch (error) {
    console.error("Could not prepare practice-file upload:", error.message);
    res.status(500).json({ error: "Could not prepare file upload" });
  }
});

router.post("/api/admin/resources", requireAdmin, async (req, res) => {
  const { lessonId, liveSessionId, title, fileName, contentType, size, key } = req.body || {};
  if (Boolean(lessonId) === Boolean(liveSessionId) || !isAllowedResourceFile(fileName, contentType)) {
    return res.status(400).json({ error: "Invalid resource details" });
  }
  const ownerId = lessonId || liveSessionId;
  const expectedPrefix = `learning-resources/${lessonId ? "lessons" : "sessions"}/${ownerId}/`;
  if (typeof key !== "string" || !key.startsWith(expectedPrefix) || key.includes("..")) {
    return res.status(400).json({ error: "Invalid upload key" });
  }
  if (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > 25 * 1024 * 1024) {
    return res.status(400).json({ error: "Each practice file must be 25 MB or less" });
  }
  try {
    const ownerTable = lessonId ? "lessons" : "live_sessions";
    const owner = await pool.query(`SELECT id FROM ${ownerTable} WHERE id = $1`, [ownerId]);
    if (!owner.rowCount) return res.status(404).json({ error: "Lesson or session not found" });
    const result = await pool.query(
      `INSERT INTO learning_resources (lesson_id, live_session_id, title, file_name, object_key, content_type, file_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, title, file_name, file_size`,
      [lessonId || null, liveSessionId || null, String(title || fileName).trim().slice(0, 180), fileName, key, contentType, Number(size)]
    );
    res.status(201).json({ success: true, resource: result.rows[0] });
  } catch (error) {
    console.error("Could not attach practice file:", error.message);
    res.status(500).json({ error: "Could not attach practice file" });
  }
});

router.delete("/api/admin/resources/:resourceId", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT object_key FROM learning_resources WHERE id = $1", [req.params.resourceId]);
    if (!result.rowCount) return res.status(404).json({ error: "Resource not found" });
    await deleteFromR2(result.rows[0].object_key);
    await pool.query("DELETE FROM learning_resources WHERE id = $1", [req.params.resourceId]);
    res.json({ success: true });
  } catch (error) {
    console.error("Could not delete practice file:", error.message);
    res.status(500).json({ error: "Could not delete practice file" });
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

