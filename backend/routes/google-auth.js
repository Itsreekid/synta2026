// =====================================================
// GOOGLE OAUTH ROUTES
// POST /api/auth/google          — JSON credential (desktop popup)
// POST /api/auth/google/callback — form POST credential (iOS redirect)
// =====================================================
import express from "express";
import { OAuth2Client } from "google-auth-library";
import pool from "../config/db.js";
import { setSessionCookies } from "../middleware/requireAuth.js";
import jwt from "jsonwebtoken";

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const isProd = process.env.NODE_ENV === "production";

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

/** OAuth redirect responses need Lax so the session cookie sticks after Google's POST. */
function setGoogleSessionCookies(res, tokens) {
  const cookieBase = {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
  };
  res.cookie("synta_access", tokens.access_token, {
    ...cookieBase,
    maxAge: 60 * 60 * 1000,
  });
  if (tokens.refresh_token) {
    res.cookie("synta_refresh", tokens.refresh_token, {
      ...cookieBase,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}

async function authenticateWithGoogleCredential(credential) {
  if (!credential) {
    const error = new Error("Google credential token is required");
    error.status = 400;
    throw error;
  }

  if (!GOOGLE_CLIENT_ID) {
    console.error("[google-auth] GOOGLE_CLIENT_ID env var is not set");
    const error = new Error("Google authentication is not configured on the server");
    error.status = 500;
    throw error;
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
    const error = new Error("Invalid Google token. Please try again.");
    error.status = 401;
    throw error;
  }

  const { sub: googleId, email, name } = payload;

  if (!email) {
    const error = new Error("Could not retrieve email from Google account");
    error.status = 400;
    throw error;
  }

  let user = null;

  const byGoogleId = await pool.query(
    "SELECT id, email, name, role, phone, class, branch FROM users WHERE google_id = $1",
    [googleId]
  );
  if (byGoogleId.rowCount > 0) {
    user = byGoogleId.rows[0];
  }

  if (!user) {
    const byEmail = await pool.query(
      "SELECT id, email, name, role FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );

    if (byEmail.rowCount > 0) {
      user = byEmail.rows[0];
      await pool.query("UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2", [
        googleId,
        user.id,
      ]);
      const reloaded = await pool.query(
        "SELECT id, email, name, role, phone, class, branch FROM users WHERE id = $1",
        [user.id]
      );
      if (reloaded.rowCount > 0) user = reloaded.rows[0];
    }
  }

  if (!user) {
    const displayName = name || email.split("@")[0];
    const insert = await pool.query(
      `INSERT INTO users (email, name, google_id, role, password_hash, email_verified)
       VALUES ($1, $2, $3, 'user', NULL, true)
       RETURNING id, email, name, role, phone, class, branch`,
      [email.toLowerCase().trim(), displayName, googleId]
    );
    user = insert.rows[0];
    console.log("[google-auth] Created new user via Google:", user.email);
  } else {
    console.log("[google-auth] Authenticated existing user via Google:", user.email);
  }

  const access_token = signAccessToken(user);
  const refresh_token = signRefreshToken(user.id);
  const needsOnboarding = !user.phone || !user.class || !user.branch;

  return {
    user,
    access_token,
    refresh_token,
    needsOnboarding,
  };
}

/**
 * POST /api/auth/google
 * Body JSON: { credential }
 */
router.post("/api/auth/google", async (req, res) => {
  try {
    const result = await authenticateWithGoogleCredential(req.body?.credential);
    setSessionCookies(res, {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    });
    return res.json({
      success: true,
      needsOnboarding: result.needsOnboarding,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[google-auth] Error:", err.message);
    return res.status(status).json({
      error: err.message || "Internal server error during Google authentication",
    });
  }
});

/**
 * POST /api/auth/google/callback
 * GIS redirect UX (iPhone/iPad) posts credential as form field.
 * Must be listed in Google Cloud "Authorized redirect URIs":
 *   https://syntaacademy.tn/api/auth/google/callback
 */
router.post("/api/auth/google/callback", async (req, res) => {
  try {
    const credential = req.body?.credential;
    const result = await authenticateWithGoogleCredential(credential);
    setGoogleSessionCookies(res, {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    });
    const next = result.needsOnboarding ? "/auth/complete-profile" : "/dashboard";
    return res.redirect(303, next);
  } catch (err) {
    console.error("[google-auth] Redirect callback failed:", err.message);
    const message = encodeURIComponent(err.message || "Google sign-in failed");
    return res.redirect(303, `/login?google_error=${message}`);
  }
});

export default router;
