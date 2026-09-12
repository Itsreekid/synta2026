// =====================================================
// SESSION ONBOARDING API ROUTES
// /api/session/...
// =====================================================
import express from "express";
import pool from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { setSessionCookies } from "../middleware/requireAuth.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 12;

function setSessionCookie(res, registrationId) {
  res.cookie("synta_session_token", registrationId, {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

function computeTier(score, total) {
  if (total === 0) return "explorer";
  const pct = score / total;
  if (pct >= 0.8) return "elite";
  if (pct >= 0.5) return "challenger";
  return "explorer";
}

// -------------------------------------------------------
// POST /api/session/register
// -------------------------------------------------------
router.post("/register", async (req, res) => {
  const { full_name, email, phone } = req.body;

  if (!full_name || !email || !phone) {
    return res.status(400).json({ error: "Champs requis manquants." });
  }

  try {
    const existing = await pool.query(
      `SELECT id, full_name, email, track, tier, score, completed
       FROM session_registrations
       WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (existing.rowCount > 0) {
      setSessionCookie(res, existing.rows[0].id);
      return res.json({ success: true, returning: true, registration: existing.rows[0], token: existing.rows[0].id });
    }

    const result = await pool.query(
      `INSERT INTO session_registrations (full_name, email, phone)
       VALUES ($1, $2, $3) RETURNING *`,
      [full_name.trim(), email.toLowerCase().trim(), phone.trim()]
    );

    setSessionCookie(res, result.rows[0].id);
    return res.json({ success: true, returning: false, registration: result.rows[0], token: result.rows[0].id });
  } catch (err) {
    console.error("❌ Session register error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// -------------------------------------------------------
// GET /api/session/questions
// -------------------------------------------------------
router.get("/questions", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, text, type, options, order_index, explanation
       FROM session_questions
       WHERE is_active = true
       ORDER BY order_index ASC`
    );
    return res.json({ questions: result.rows });
  } catch (err) {
    console.error("❌ Questions fetch error:", err);
    return res.status(500).json({ error: "Impossible de charger les questions." });
  }
});

// -------------------------------------------------------
// POST /api/session/submit
// -------------------------------------------------------
router.post("/submit", async (req, res) => {
  const { registration_id, answers, track, branch: filier } = req.body;

  if (!registration_id || !answers || !track) {
    return res.status(400).json({ error: "Données manquantes." });
  }

  const cookieToken = req.cookies?.synta_session_token;
  if (!cookieToken || cookieToken !== registration_id) {
    return res.status(403).json({ error: "Unauthorized: session token mismatch." });
  }

  try {
    const questionsResult = await pool.query(
      `SELECT id, correct_answer, type FROM session_questions WHERE is_active = true`
    );
    const questions = questionsResult.rows;

    let score = 0;
    const submissions = [];

    for (const question of questions) {
      const userAnswer = answers[question.id];
      if (userAnswer === undefined) continue;

      let is_correct = false;
      const correct = question.correct_answer;

      if (question.type === "drag_drop") {
        const userArr = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
        const correctArr = Array.isArray(correct) ? correct : [correct];
        is_correct = JSON.stringify(userArr) === JSON.stringify(correctArr);
      } else {
        is_correct = String(userAnswer).trim() === String(correct).trim();
      }

      if (is_correct) score++;

      submissions.push({ registration_id, question_id: question.id, answer: userAnswer, is_correct });
    }

    const tier = computeTier(score, questions.length);
    const group = score === questions.length && questions.length > 0 ? "advanced" : "beginner";

    // Save submissions (best-effort)
    for (const sub of submissions) {
      await pool.query(
        `INSERT INTO session_submissions (registration_id, question_id, answer, is_correct)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (registration_id, question_id) DO UPDATE SET answer = EXCLUDED.answer, is_correct = EXCLUDED.is_correct`,
        [sub.registration_id, sub.question_id, JSON.stringify(sub.answer), sub.is_correct]
      ).catch(() => {}); // Table may not exist yet
    }

    const updated = await pool.query(
      `UPDATE session_registrations
       SET score = $1, tier = $2, completed = true, "group" = $3, track = $4, filier = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING id, full_name, email, track, score, tier, completed`,
      [score, tier, group, track, filier, registration_id]
    );

    return res.json({
      success: true,
      score,
      total: questions.length,
      tier,
      group,
      registration: updated.rows[0],
    });
  } catch (err) {
    console.error("❌ Submit exception:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// -------------------------------------------------------
// POST /api/session/set-password
// Creates a user account and issues session cookies
// -------------------------------------------------------
router.post("/set-password", async (req, res) => {
  const { registration_id, password } = req.body;

  if (!registration_id || !password) {
    return res.status(400).json({ error: "Données manquantes." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
  }

  try {
    const regResult = await pool.query(
      `SELECT id, email, full_name, phone FROM session_registrations WHERE id = $1`,
      [registration_id]
    );
    if (regResult.rowCount === 0) {
      return res.status(404).json({ error: "Inscription introuvable." });
    }

    const reg = regResult.rows[0];
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Upsert user account
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, name, phone, role)
       VALUES ($1, $2, $3, $4, 'user')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id, email, name, role`,
      [reg.email, passwordHash, reg.full_name, reg.phone]
    );

    const user = userResult.rows[0];

    await pool.query(
      `UPDATE session_registrations SET account_activated = true WHERE id = $1`,
      [registration_id]
    );

    // Issue JWT session cookies
    const access_token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const refresh_token = jwt.sign({ id: user.id, type: "refresh" }, JWT_SECRET, { expiresIn: "7d" });

    setSessionCookies(res, { access_token, refresh_token });

    return res.json({ success: true, redirectUrl: "/dashboard" });
  } catch (err) {
    console.error("❌ set-password error:", err.message);
    return res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
});

// -------------------------------------------------------
// ADMIN ROUTES
// -------------------------------------------------------
router.get("/admin/config", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT session_date, session_matiere FROM session_config WHERE id = 1`
    );
    return res.json({ config: result.rows[0] || {} });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/admin/config", requireAdmin, async (req, res) => {
  try {
    const { session_date, session_matiere } = req.body;
    const result = await pool.query(
      `INSERT INTO session_config (id, session_date, session_matiere, updated_at)
       VALUES (1, $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET session_date = $1, session_matiere = $2, updated_at = NOW()
       RETURNING *`,
      [session_date, session_matiere]
    );
    return res.json({ success: true, config: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/admin/students", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM session_registrations ORDER BY created_at DESC`
    );
    return res.json({ students: result.rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/admin/questions", requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM session_questions ORDER BY order_index ASC`
  );
  return res.json({ questions: result.rows });
});

router.post("/admin/questions", requireAdmin, async (req, res) => {
  const { text, type, options, correct_answer, explanation, order_index } = req.body;
  if (!text || !type || !options || correct_answer === undefined) {
    return res.status(400).json({ error: "Champs requis manquants." });
  }
  const result = await pool.query(
    `INSERT INTO session_questions (text, type, options, correct_answer, explanation, order_index, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
    [text, type, JSON.stringify(options), JSON.stringify(correct_answer), explanation, order_index ?? 0]
  );
  return res.json({ question: result.rows[0] });
});

router.patch("/admin/questions", requireAdmin, async (req, res) => {
  const { id, text, type, options, correct_answer, explanation, order_index, is_active } = req.body;
  if (!id) return res.status(400).json({ error: "ID manquant." });

  const fields = [];
  const values = [];
  let idx = 1;

  if (text !== undefined) { fields.push(`text = $${idx++}`); values.push(text); }
  if (type !== undefined) { fields.push(`type = $${idx++}`); values.push(type); }
  if (options !== undefined) { fields.push(`options = $${idx++}`); values.push(JSON.stringify(options)); }
  if (correct_answer !== undefined) { fields.push(`correct_answer = $${idx++}`); values.push(JSON.stringify(correct_answer)); }
  if (explanation !== undefined) { fields.push(`explanation = $${idx++}`); values.push(explanation); }
  if (order_index !== undefined) { fields.push(`order_index = $${idx++}`); values.push(order_index); }
  if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE session_questions SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return res.json({ question: result.rows[0] });
});

router.delete("/admin/questions", requireAdmin, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "ID manquant." });
  await pool.query(`DELETE FROM session_questions WHERE id = $1`, [id]);
  return res.json({ success: true });
});

export default router;
