// =====================================================
// GOOGLE OAUTH ROUTE
// POST /api/auth/google
//
// Flow:
//  1. Receive the Google ID token (credential) from the frontend.
//  2. Verify it with Google's public keys via google-auth-library.
//  3. Upsert the user into the `users` table (create if new, skip if existing).
//  4. Issue the same JWT session cookies used by the regular login flow.
// =====================================================
import express from "express";
import { OAuth2Client } from "google-auth-library";
import pool from "../config/db.js";
import { setSessionCookies } from "../middleware/requireAuth.js";
import jwt from "jsonwebtoken";

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function signAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || "user",
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function signRefreshToken(userId) {
  return jwt.sign({ id: userId, type: "refresh" }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

/**
 * POST /api/auth/google
 *
 * Body: { credential: "<Google ID token>" }
 *
 * Verifies the token, upserts the user, and sets session cookies.
 */
router.post("/api/auth/google", async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ error: "Google credential token is required" });
  }

  if (!GOOGLE_CLIENT_ID) {
    console.error("[google-auth] GOOGLE_CLIENT_ID env var is not set");
    return res.status(500).json({ error: "Google authentication is not configured on the server" });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error("[google-auth] Token verification failed:", err.message);
    return res.status(401).json({ error: "Invalid Google token. Please try again." });
  }

  const { sub: googleId, email, name, picture } = payload;

  if (!email) {
    return res.status(400).json({ error: "Could not retrieve email from Google account" });
  }

  try {
    // --- Upsert logic ---
    // Check if a user with this google_id or email already exists.
    let user = null;

    // 1. Try to find by google_id first (returning visitor via Google).
    const byGoogleId = await pool.query(
      "SELECT id, email, name, role, phone, class, branch FROM users WHERE google_id = $1",
      [googleId]
    );
    if (byGoogleId.rowCount > 0) {
      user = byGoogleId.rows[0];
    }

    if (!user) {
      // 2. Try to find by email (user previously registered with email/password).
      const byEmail = await pool.query(
        "SELECT id, email, name, role FROM users WHERE email = $1",
        [email.toLowerCase().trim()]
      );

      if (byEmail.rowCount > 0) {
        // Link google_id to the existing account.
        user = byEmail.rows[0];
        await pool.query("UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2", [
          googleId,
          user.id,
        ]);
        // Re-fetch with all profile fields
        const reloaded = await pool.query(
          "SELECT id, email, name, role, phone, class, branch FROM users WHERE id = $1",
          [user.id]
        );
        if (reloaded.rowCount > 0) user = reloaded.rows[0];
      }
    }

    if (!user) {
      // 3. New user — create account. No password needed for Google-only users.
      const displayName = name || email.split("@")[0];

      const insert = await pool.query(
        `INSERT INTO users (email, name, google_id, role, password_hash, email_verified)
         VALUES ($1, $2, $3, 'user', NULL, true)
         RETURNING id, email, name, role`,
        [email.toLowerCase().trim(), displayName, googleId]
      );
      user = insert.rows[0];
      console.log("[google-auth] Created new user via Google:", user.email);
    } else {
      console.log("[google-auth] Authenticated existing user via Google:", user.email);
    }

    // Issue JWT session cookies — identical to the regular login flow.
    const access_token = signAccessToken(user);
    const refresh_token = signRefreshToken(user.id);
    setSessionCookies(res, { access_token, refresh_token });

    // Check if required onboarding fields are missing.
    // Google users skip the registration form, so phone/class/branch may be null.
    const needsOnboarding = !user.phone || !user.class || !user.branch;

    return res.json({
      success: true,
      needsOnboarding,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error("[google-auth] Database error:", err.message);
    return res.status(500).json({ error: "Internal server error during Google authentication" });
  }
});

export default router;
