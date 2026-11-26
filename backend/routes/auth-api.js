// =====================================================
// AUTH API ROUTES
// POST /api/auth/register  — create new user account
// POST /api/auth/login     — authenticate, issue JWT cookies
// POST /api/auth/logout    — clear session cookies
// =====================================================
import express from "express";
import { authRateLimit } from "../middleware/authRateLimit.js";
import { normalizeTunisianPhone, validateLearnerProfile } from "../utils/learnerProfile.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { clearSessionCookies, revokeAllUserSessions, revokeRefreshToken, startSession } from "../services/sessions.js";
import { generateVerificationToken, sendPasswordChangedEmail, sendPasswordResetEmail, sendVerificationEmail } from "../services/email.js";
import { createResetToken, readResetToken, resetTokenMatches } from "../services/password-reset.js";
import { DEACTIVATED_MESSAGE } from "../services/account-status.js";

const router = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET;
const SALT_ROUNDS = 12;

/**
 * POST /api/auth/register
 *
 * Creates a new email/password account, generates a verification token,
 * persists it, and fires off the verification email via Resend.
 * The user gets a session cookie immediately but email_verified = false
 * until they click the link.
 */
router.post("/api/auth/register", authRateLimit(10), async (req, res) => {
  try {
    const { email, password, name, phone, class: userClass, branch } = req.body || {};

    if (![email, password, name].every(value => typeof value === "string" && value.trim())) {
      return res.status(400).json({ error: "email, password, and name are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    if (Buffer.byteLength(password) > 72) {
      return res.status(400).json({ error: "Le mot de passe est trop long." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254 || name.trim().length > 150) {
      return res.status(400).json({ error: "Vérifie ton nom et ton adresse e-mail." });
    }
    const profileError = validateLearnerProfile({ phone, userClass, userBranch: branch }, false);
    if (profileError) return res.status(400).json({ error: profileError });

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Generate a secure 64-char hex verification token (valid for 24 h)
    const { token: verificationToken, expiresAt: tokenExpiresAt } =
      generateVerificationToken();

    const result = await pool.query(
      `INSERT INTO users
         (email, password_hash, name, phone, class, branch, role,
          email_verified, verification_token, token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'user', false, $7, $8)
       RETURNING id, email, name, role`,
      [
        email.toLowerCase().trim(),
        passwordHash,
        name.trim(),
        normalizeTunisianPhone(phone) || null,
        userClass || null,
        branch || null,
        verificationToken,
        tokenExpiresAt,
      ]
    );

    const user = result.rows[0];

    // Send the verification email — non-blocking: failure is logged, not fatal
    sendVerificationEmail(user.email, user.name, verificationToken).catch((err) => {
      console.error("[auth/register] Could not send verification email:", err.message);
    });

    return res.status(201).json({
      success:          true,
      emailVerified:    false,
      verificationSent: true,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error("[auth/register] Error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/login
 */
router.post("/api/auth/login", authRateLimit(30), async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const result = await pool.query(
      `SELECT id, email, name, role, password_hash, email_verified,
              to_jsonb(users)->>'deactivated_at' AS deactivated_at
       FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user  = result.rows[0];
    const valid = user.password_hash && await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }

    // Only after a correct password, so this never reveals account state to a guesser.
    if (user.deactivated_at) {
      return res.status(403).json({ error: DEACTIVATED_MESSAGE, deactivated: true });
    }

    if (!user.email_verified) {
      return res.status(403).json({ error: "يرجى التحقق من بريدك الإلكتروني لتفعيل حسابك قبل تسجيل الدخول.", unverified: true });
    }

    await startSession(pool, res, user, { previousRefreshToken: req.cookies?.synta_refresh });

    return res.json({
      success:       true,
      emailVerified: user.email_verified,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error("[auth/login] Error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/logout
 */
router.post("/api/auth/logout", async (req, res) => {
  try {
    await revokeRefreshToken(pool, req.cookies?.synta_refresh);
  } catch (err) {
    console.error("[auth/logout] Could not revoke the refresh token:", err.code || err.message);
  }
  clearSessionCookies(res);
  return res.json({ success: true });
});

/**
 * POST /api/auth/resend-verification
 * Resends the verification email for an unverified account.
 */
router.post("/api/auth/resend-verification", authRateLimit(10), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });
    }

    // 1. Look up user
    const result = await pool.query(
      "SELECT id, email, name, email_verified FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: "لم يتم العثور على حساب بهذا البريد الإلكتروني" });
    }

    const user = result.rows[0];

    // 2. Check if already verified
    if (user.email_verified) {
      return res.status(400).json({ error: "الحساب مفعل بالفعل، يمكنك تسجيل الدخول" });
    }

    // 3. Generate a new token
    const { token: verificationToken, expiresAt: tokenExpiresAt } = generateVerificationToken();

    // 4. Update the DB
    await pool.query(
      `UPDATE users 
       SET verification_token = $1, token_expires_at = $2 
       WHERE id = $3`,
      [verificationToken, tokenExpiresAt, user.id]
    );

    // 5. Send the new email
    try {
      await sendVerificationEmail(user.email, user.name, verificationToken);
    } catch (err) {
      console.error("[auth/resend] Resend error:", err.message);
      return res.status(500).json({ error: "تعذر إرسال البريد الإلكتروني. يرجى المحاولة لاحقاً." });
    }

    return res.json({ success: true, message: "تم إعادة إرسال بريد التفعيل" });
  } catch (err) {
    console.error("[auth/resend] Error:", err.message);
    return res.status(500).json({ error: "خطأ داخلي في الخادم" });
  }
});

// =====================================================
// PASSWORD RESET
// =====================================================
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizedEmail = value => (typeof value === "string" ? value.toLowerCase().trim() : "");
const FORGOT_REPLY = {
  success: true,
  message: "Si un compte existe avec cette adresse, tu vas recevoir un lien pour choisir un nouveau mot de passe.",
};

function passwordProblem(password) {
  if (typeof password !== "string" || password.length < 6) return "Choisis un mot de passe d’au moins 6 caractères.";
  if (Buffer.byteLength(password) > 72) return "Le mot de passe est trop long.";
  return null;
}

/**
 * POST /api/auth/forgot-password  { email }
 * Always answers the same way, so it never reveals whether an account exists.
 */
router.post("/api/auth/forgot-password",
  authRateLimit(5),
  authRateLimit(3, 60 * 60 * 1000, req => "email:" + normalizedEmail(req.body?.email).slice(0, 254)),
  async (req, res) => {
    const email = normalizedEmail(req.body?.email);
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return res.status(400).json({ error: "Vérifie ton adresse e-mail." });
    }
    try {
      const result = await pool.query(
        `SELECT id, email, name, password_hash, to_jsonb(users)->>'deactivated_at' AS deactivated_at
         FROM users WHERE email = $1`,
        [email]
      );
      const user = result.rows[0];
      // Deactivated accounts get the same reply but no link (they could not sign in anyway).
      if (user && !user.deactivated_at) {
        // Not awaited: the reply time must not depend on whether the account exists.
        sendPasswordResetEmail(user.email, user.name, createResetToken(user)).catch(err =>
          console.error("[auth/forgot-password] Email not sent:", err.message));
      }
      return res.json(FORGOT_REPLY);
    } catch (err) {
      console.error("[auth/forgot-password] Error:", err.code || err.message);
      return res.status(500).json({ error: "Impossible d’envoyer le lien pour le moment. Réessaie dans un instant." });
    }
  }
);

/**
 * POST /api/auth/reset-password/check  { token }
 * Lets the page say "link expired" before the student types a new password.
 */
router.post("/api/auth/reset-password/check", authRateLimit(30), async (req, res) => {
  res.set("Cache-Control", "no-store");
  const claims = readResetToken(req.body?.token);
  if (!claims) return res.json({ valid: false });
  try {
    const result = await pool.query("SELECT id, email, password_hash FROM users WHERE id = $1", [claims.userId]);
    return res.json({ valid: resetTokenMatches(claims, result.rows[0]) });
  } catch (err) {
    console.error("[auth/reset-password/check] Error:", err.code || err.message);
    return res.status(500).json({ error: "Vérification impossible. Réessaie dans un instant." });
  }
});

/**
 * POST /api/auth/reset-password  { token, password }
 * Sets the new password, confirms the email (the link proves ownership) and logs the
 * account out of every device.
 */
router.post("/api/auth/reset-password", authRateLimit(10), async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { token, password } = req.body || {};
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });
  const claims = readResetToken(token);
  const expired = () => res.status(400).json({
    error: "Ce lien n’est plus valable. Demande un nouveau lien de réinitialisation.", expired: true,
  });
  if (!claims) return expired();

  let client;
  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    client = await pool.connect();
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT id, email, name, password_hash, to_jsonb(users)->>'deactivated_at' AS deactivated_at FROM users WHERE id = $1 FOR UPDATE",
      [claims.userId]
    );
    const user = found.rows[0];
    if (!resetTokenMatches(claims, user)) {
      await client.query("ROLLBACK");
      return expired();
    }
    if (user.deactivated_at) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: DEACTIVATED_MESSAGE, deactivated: true });
    }
    await client.query(
      `UPDATE users SET password_hash = $1, email_verified = true,
              verification_token = NULL, token_expires_at = NULL, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id]
    );
    await revokeAllUserSessions(client, user.id);
    await client.query("COMMIT");

    clearSessionCookies(res);
    sendPasswordChangedEmail(user.email, user.name).catch(err =>
      console.error("[auth/reset-password] Notice not sent:", err.message));
    console.log("[auth/reset-password] Password reset for user:", user.id);
    return res.json({ success: true });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[auth/reset-password] Error:", err.code || err.message);
    return res.status(500).json({ error: "Le mot de passe n’a pas pu être changé. Réessaie dans un instant." });
  } finally {
    client?.release();
  }
});

/**
 * GET /api/auth/magic-login
 * Used by admin to login as a user via a generated 5-minute token
 */
router.get("/api/auth/magic-login", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send("Token missing");

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.magic || !decoded.id) {
      return res.status(400).send("Invalid token");
    }

    const result = await pool.query(
      "SELECT id, email, name, role, to_jsonb(users)->>'deactivated_at' AS deactivated_at FROM users WHERE id = $1",
      [decoded.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).send("User not found");
    }
    if (result.rows[0].deactivated_at) {
      return res.status(403).send("Ce compte est désactivé.");
    }

    const user = result.rows[0];
    // "Log in as student" sessions end with their access token and never renew.
    await startSession(pool, res, user, { renewable: false, previousRefreshToken: req.cookies?.synta_refresh });

    res.redirect("/dashboard");
  } catch (err) {
    console.error("[auth/magic-login] Error:", err.message);
    return res.status(401).send("Token expired or invalid");
  }
});

export default router;
