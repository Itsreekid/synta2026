// =====================================================
// GOOGLE OAUTH ROUTES
// POST /api/auth/google          — JSON credential (desktop popup)
// POST /api/auth/google/callback — form POST credential (iOS redirect)
// =====================================================
import express from "express";
import { timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import pool from "../config/db.js";
import { startSession } from "../services/sessions.js";
import { safeReturnPath } from "../utils/returnPath.js";

const router = express.Router();
const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim();

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

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

  const needsOnboarding = !user.phone || !user.class || !user.branch;

  return { user, needsOnboarding };
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
    await startSession(pool, res, result.user, { previousRefreshToken: req.cookies?.synta_refresh });
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
router.post(GOOGLE_CALLBACK_PATH, async (req, res) => {
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
    // Session cookies are SameSite=Lax so they are sent on the redirect that follows Google's cross-site POST.
    const result = await authenticateWithGoogleCredential(credential);
    await startSession(pool, res, result.user, { previousRefreshToken: req.cookies?.synta_refresh });
    const returnTo = safeReturnPath(req.cookies?.synta_next);
    res.clearCookie("synta_next", { path: GOOGLE_CALLBACK_PATH });
    const next = result.needsOnboarding ? "/auth/complete-profile" : returnTo || "/dashboard";
    return res.redirect(303, next);
  } catch (err) {
    if (!err.status || err.status >= 500) console.error("[google-auth] Callback failure:", err.code || 500);
    const message = encodeURIComponent(err.status < 500 ? err.message : "تسجيل الدخول بـ Google غير متاح حالياً. حاول مجدداً.");
    return res.redirect(303, `/login?google_error=${message}`);
  }
});

export default router;
