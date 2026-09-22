// =====================================================
// AUTH API ROUTES
// POST /api/auth/register  — create new user account
// POST /api/auth/login     — authenticate, issue JWT cookies
// POST /api/auth/logout    — clear session cookies
// =====================================================
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { setSessionCookies, clearSessionCookies } from "../middleware/requireAuth.js";
import { generateVerificationToken, sendVerificationEmail } from "../services/email.js";

const router = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET;
const SALT_ROUNDS = 12;

function signAccessToken(user) {
  return jwt.sign(
    {
      id:    user.id,
      email: user.email,
      name:  user.name,
      role:  user.role || "user",
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function signRefreshToken(userId) {
  return jwt.sign({ id: userId, type: "refresh" }, JWT_SECRET, { expiresIn: "7d" });
}

/**
 * POST /api/auth/register
 *
 * Creates a new email/password account, generates a verification token,
 * persists it, and fires off the verification email via Resend.
 * The user gets a session cookie immediately but email_verified = false
 * until they click the link.
 */
router.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name, phone, class: userClass, branch } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "email, password, and name are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

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
        phone?.trim()     || null,
        userClass?.trim() || null,
        branch?.trim()    || null,
        verificationToken,
        tokenExpiresAt,
      ]
    );

    const user = result.rows[0];

    // Set session cookies so the user is logged in right away
    const access_token  = signAccessToken(user);
    const refresh_token = signRefreshToken(user.id);
    setSessionCookies(res, { access_token, refresh_token });

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
router.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const result = await pool.query(
      "SELECT id, email, name, role, password_hash, email_verified FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user  = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const access_token  = signAccessToken(user);
    const refresh_token = signRefreshToken(user.id);
    setSessionCookies(res, { access_token, refresh_token });

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
router.post("/api/auth/logout", (req, res) => {
  clearSessionCookies(res);
  return res.json({ success: true });
});

export default router;
