// =====================================================
// REQUIRE AUTH MIDDLEWARE
// HttpOnly cookie session guard — JWT-based (no Supabase)
// =====================================================
import jwt from "jsonwebtoken";
import { loginUrlFor } from "../utils/returnPath.js";
import { applyRotation, rotateRefreshToken } from "../services/sessions.js";

export { clearSessionCookies } from "../services/sessions.js";

const JWT_SECRET = process.env.JWT_SECRET;
const RENEWAL_FAILURE_LIMIT = 30;
const RENEWAL_WINDOW_MS = 15 * 60 * 1000;

/**
 * sessionRenewal — runs before all routes. When the access token is missing or expired and a
 * refresh cookie is present, rotates the refresh token server-side and continues the request
 * with the new access token, so every guard below sees a valid session.
 */
export function sessionRenewal(pool) {
  const failures = new Map();
  let lastErrorLog = 0;
  return async function renewSession(req, res, next) {
    const refreshToken = req.cookies?.synta_refresh;
    if (!refreshToken || req.path.startsWith("/api/auth/") || verifyToken(req.cookies?.synta_access)) return next();

    const now = Date.now();
    const bucket = failures.get(req.ip);
    if (bucket && bucket.expires > now && bucket.count >= RENEWAL_FAILURE_LIMIT) return next();

    try {
      const outcome = await rotateRefreshToken(pool, refreshToken);
      if (outcome) {
        applyRotation(res, outcome);
        req.cookies.synta_access = outcome.accessToken;
        if (outcome.refresh) req.cookies.synta_refresh = outcome.refresh.token;
      } else {
        // Keep req.cookies.synta_refresh so the login page can still say the session expired.
        res.clearCookie("synta_refresh", { path: "/" });
        if (!bucket || bucket.expires <= now) {
          if (failures.size < 10000) failures.set(req.ip, { expires: now + RENEWAL_WINDOW_MS, count: 1 });
        } else {
          bucket.count++;
        }
      }
    } catch (err) {
      // Renewal is unavailable (e.g. database down or migration not applied): keep the refresh cookie.
      if (now - lastErrorLog > 60000) {
        lastErrorLog = now;
        console.error("[sessions] Renewal unavailable:", err.code || err.message);
      }
    }
    return next();
  };
}

/**
 * Refresh and admin magic-link tokens share JWT_SECRET but must never act as a session.
 */
export function isAccessPayload(payload) {
  return Boolean(payload?.id) && payload.type !== "refresh" && !payload.magic;
}

/**
 * Verify a JWT access token and return the decoded payload, or null.
 */
export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    return isAccessPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * requireAuth — guards HTML page routes, redirects to /login on failure.
 */
export async function requireAuth(req, res, next) {
  const accessToken = req.cookies?.synta_access;
  // The refresh cookie is only a hint that a session existed; sessionRenewal is the only code that redeems it.
  const returnTo = req.method === "GET" ? req.originalUrl : null;

  if (!accessToken) {
    return res.redirect(loginUrlFor(returnTo, Boolean(req.cookies?.synta_refresh)));
  }

  const payload = verifyToken(accessToken);
  if (!payload) {
    res.clearCookie("synta_access", { path: "/" });
    return res.redirect(loginUrlFor(returnTo, true));
  }

  req.user = payload;
  req.accessToken = accessToken;
  // Renewable sessions need no client-side expiry warning.
  res.locals.sessionRenewable = Boolean(req.cookies?.synta_refresh);
  return next();
}

/**
 * authApiMiddleware — guards API routes, returns JSON 401 on failure.
 */
export async function authApiMiddleware(req, res, next) {
  const accessToken = req.cookies?.synta_access;

  if (!accessToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = verifyToken(accessToken);
  if (!payload) {
    res.clearCookie("synta_access", { path: "/" });
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }

  req.user = payload;
  req.accessToken = accessToken;
  return next();
}
