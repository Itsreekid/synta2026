// =====================================================
// GOOGLE OAUTH ROUTES
// POST /api/auth/google          — JSON credential (desktop popup)
// POST /api/auth/google/callback — form POST credential (iOS redirect)
// =====================================================
import express from "express";
import { timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import pool from "../config/db.js";
import { setSessionCookies } from "../middleware/requireAuth.js";
import jwt from "jsonwebtoken";

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim();
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
  if (typeof credential !== "string" || !credential) {
    const error = new Error("بيانات تسجيل الدخول بـ Google مفقودة.");
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
  } catch {
    console.warn("[google-auth] Token verification failed");
    const error = new Error("تعذّر التحقق من تسجيل الدخول بـ Google. حاول مجدداً.");
    error.status = 401;
    throw error;
  }

  const { sub: googleId, email, name, email_verified, hd } = payload ?? {};

  if (!googleId || !email || email_verified !== true) {
    const error = new Error("يرجى استخدام حساب Google ببريد إلكتروني مؤكّد.");
    error.status = 400;
    throw error;
  }

  const byGoogleId = await pool.query(
    "SELECT id, email, name, role, phone, class, branch FROM users WHERE google_id = $1",
    [googleId]
  );
  let user = byGoogleId.rows[0];

  if (!user) {
    const normalizedEmail = email.toLowerCase().trim();
    const canLinkByEmail = normalizedEmail.endsWith("@gmail.com") || Boolean(hd);
    const insert = await pool.query(
      `INSERT INTO users (email, name, google_id, role, password_hash, email_verified)
       VALUES ($1, $2, $3, 'user', NULL, true)
       ON CONFLICT (email) DO UPDATE SET
         google_id = EXCLUDED.google_id,
         email_verified = true,
         updated_at = NOW()
       WHERE users.google_id = EXCLUDED.google_id
          OR (users.google_id IS NULL AND $4)
       RETURNING id, email, name, role, phone, class, branch`,
      [normalizedEmail, name || normalizedEmail.split("@")[0], googleId, canLinkByEmail]
    );
    user = insert.rows[0];
    if (!user) {
      const error = new Error("يرجى تسجيل الدخول باستخدام طريقة تسجيلك الأصلية.");
      error.status = 409;
      throw error;
    }
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
  if (!req.is("application/json")) {
    return res.status(415).json({ error: "طلب تسجيل دخول غير صالح." });
  }
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
    if (status >= 500) console.error("[google-auth] Backend failure:", err.code || status);
    return res.status(status).json({
      error: status >= 500 ? "تسجيل الدخول بـ Google غير متاح حالياً. حاول مجدداً." : err.message,
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
    const fromCookie = req.cookies?.g_csrf_token;
    const fromBody = req.body?.g_csrf_token;
    if (typeof fromCookie !== "string" || typeof fromBody !== "string" || !fromCookie || !fromBody) {
      return res.redirect(303, "/login?google_error=" + encodeURIComponent("انتهت محاولة تسجيل الدخول. حاول مجدداً."));
    }
    const cookieToken = Buffer.from(fromCookie);
    const formToken = Buffer.from(fromBody);
    if (cookieToken.length !== formToken.length || !timingSafeEqual(cookieToken, formToken)) {
      return res.redirect(303, "/login?google_error=" + encodeURIComponent("انتهت محاولة تسجيل الدخول. حاول مجدداً."));
    }
    const credential = req.body?.credential;
    const result = await authenticateWithGoogleCredential(credential);
    setGoogleSessionCookies(res, {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    });
    const next = result.needsOnboarding ? "/auth/complete-profile" : "/dashboard";
    return res.redirect(303, next);
  } catch (err) {
    if (!err.status || err.status >= 500) console.error("[google-auth] Callback failure:", err.code || 500);
    const message = encodeURIComponent(err.status < 500 ? err.message : "تسجيل الدخول بـ Google غير متاح حالياً. حاول مجدداً.");
    return res.redirect(303, `/login?google_error=${message}`);
  }
});

export default router;
