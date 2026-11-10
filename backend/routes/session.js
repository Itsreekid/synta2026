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
import { authRateLimit } from "../middleware/authRateLimit.js";
import { sendPlacementVerificationEmail } from "../services/email.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 12;
const placementKey = () => crypto.createHmac("sha256", JWT_SECRET).update("synta-placement-v1").digest();

const placementCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/session",
};

function readPlacementToken(token, audience) {
  try {
    return jwt.verify(token, placementKey(), { algorithms: ["HS256"], audience, issuer: "synta-placement" });
  } catch {
    return null;
  }
}

function requirePlacement(req, res, next) {
  if (req.method !== "GET" && !req.is("application/json")) {
    return res.status(415).json({ error: "Requête invalide." });
  }
  const proof = readPlacementToken(req.cookies?.synta_placement, "placement-verified");
  if (!proof?.sub) return res.status(401).json({ error: "Confirme ton adresse e-mail pour continuer." });
  req.placementId = proof.sub;
  next();
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
router.post("/register", authRateLimit(10), async (req, res) => {
  const { full_name, email, phone } = req.body || {};
  if (![full_name, email, phone].every(value => typeof value === "string" && value.trim()) ||
      full_name.length > 150 || email.length > 254 || phone.length > 40 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "Champs requis manquants." });
  }

  try {
    const address = email.trim().toLowerCase();
    await pool.query(
      `INSERT INTO session_registrations (full_name, email, phone)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = $2)
       ON CONFLICT (email) DO NOTHING`,
      [full_name.trim(), address, phone.trim()]
    );
    const result = await pool.query(
      `SELECT id, updated_at::text AS revision FROM session_registrations r
       WHERE email = $1 AND NOT account_activated
         AND NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = r.email)`,
      [address]
    );
    const registration = result.rows[0];
    if (registration) {
      const token = jwt.sign({ revision: registration.revision }, placementKey(), {
        issuer: "synta-placement", audience: "placement-email", subject: registration.id,
        jwtid: crypto.randomUUID(), expiresIn: "30m",
      });
      sendPlacementVerificationEmail(address, token).catch(() => console.error("[placement] Verification delivery failed"));
    }
    return res.status(202).json({ success: true });
  } catch (err) {
    console.error("[placement] Registration failed:", err.code);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/verify", authRateLimit(20), async (req, res) => {
  if (!req.is("application/json")) return res.status(415).json({ error: "Requête invalide." });
  const proof = readPlacementToken(req.body?.token, "placement-email");
  if (!proof?.sub || !proof.revision) return res.status(400).json({ error: "Lien invalide ou expiré." });
  try {
    const result = await pool.query(
      `UPDATE session_registrations r
       SET updated_at = GREATEST(clock_timestamp(), updated_at + INTERVAL '1 microsecond')
       WHERE id = $1 AND updated_at = $2::timestamptz AND NOT account_activated
         AND NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = r.email)
       RETURNING completed, score, tier, "group"`,
      [proof.sub, proof.revision]
    );
    if (!result.rowCount) return res.status(400).json({ error: "Lien invalide ou déjà utilisé." });
    const token = jwt.sign({}, placementKey(), {
      issuer: "synta-placement", audience: "placement-verified", subject: proof.sub, expiresIn: "1h",
    });
    res.cookie("synta_placement", token, { ...placementCookie, maxAge: 3600000 });
    res.set("Cache-Control", "no-store");
    return res.json({ registration: result.rows[0] });
  } catch (err) {
    console.error("[placement] Verification failed:", err.code);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

router.get("/status", requirePlacement, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT completed, score, tier, "group" FROM session_registrations
       WHERE id = $1 AND NOT account_activated`, [req.placementId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Inscription indisponible." });
    res.set("Cache-Control", "no-store");
    return res.json({ registration: result.rows[0] });
  } catch (err) {
    console.error("[placement] Status failed:", err.code);
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
router.post("/submit", requirePlacement, async (req, res) => {
  const { answers, track, branch: filier } = req.body || {};
  const registration_id = req.placementId;

  if (!registration_id || !answers || !track) {
    return res.status(400).json({ error: "Données manquantes." });
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
       WHERE id = $6 AND NOT account_activated
       RETURNING track, score, tier, completed`,
      [score, tier, group, track, filier, registration_id]
    );

    if (!updated.rowCount) return res.status(409).json({ error: "Inscription indisponible." });
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
router.post("/set-password", authRateLimit(10), requirePlacement, async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || password.length < 6 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères et au plus 72 octets." });
  }

  let client;
  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    client = await pool.connect();
    await client.query("BEGIN");
    const registration = await client.query(
      `SELECT email, full_name, phone FROM session_registrations
       WHERE id = $1 AND completed AND NOT account_activated FOR UPDATE`, [req.placementId]
    );
    if (!registration.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Termine le quiz ou connecte-toi à ton compte." });
    }
    const { email, full_name, phone } = registration.rows[0];
    const result = await client.query(
      `INSERT INTO users (email, password_hash, name, phone, role, email_verified)
       SELECT $1, $2, $3, $4, 'user', true WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = $1)
       ON CONFLICT (email) DO NOTHING RETURNING id, email, name, role`,
      [email, passwordHash, full_name, phone]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Connecte-toi avec la méthode de ton compte existant." });
    }

    const user = result.rows[0];
    await client.query(
      `UPDATE session_registrations
       SET account_activated = true, auth_user_id = $2, updated_at = NOW() WHERE id = $1`,
      [req.placementId, user.id]
    );
    const access_token = jwt.sign(user, JWT_SECRET, { expiresIn: "1h" });
    const refresh_token = jwt.sign({ id: user.id, type: "refresh" }, JWT_SECRET, { expiresIn: "7d" });
    await client.query("COMMIT");
    res.clearCookie("synta_placement", placementCookie);
    setSessionCookies(res, { access_token, refresh_token });
    return res.json({ success: true, redirectUrl: "/dashboard" });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[placement] Activation failed:", err.code);
    return res.status(500).json({ error: "Erreur serveur." });
  } finally {
    client?.release();
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
