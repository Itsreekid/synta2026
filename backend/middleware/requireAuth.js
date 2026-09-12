// =====================================================
// REQUIRE AUTH MIDDLEWARE
// HttpOnly cookie session guard — JWT-based (no Supabase)
// =====================================================
import jwt from "jsonwebtoken";

const isProd = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET;

const cookieBase = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "strict" : "lax",
  path: "/",
};

export function setSessionCookies(res, { access_token, refresh_token }) {
  res.cookie("synta_access", access_token, {
    ...cookieBase,
    maxAge: 60 * 60 * 1000, // 1 hour
  });
  if (refresh_token) {
    res.cookie("synta_refresh", refresh_token, {
      ...cookieBase,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
}

export function clearSessionCookies(res) {
  res.clearCookie("synta_access", { path: "/" });
  res.clearCookie("synta_refresh", { path: "/" });
}

/**
 * Verify a JWT access token and return the decoded payload, or null.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * requireAuth — guards HTML page routes, redirects to /login on failure.
 */
export async function requireAuth(req, res, next) {
  const accessToken = req.cookies?.synta_access;

  if (!accessToken) {
    return res.redirect("/login");
  }

  const payload = verifyToken(accessToken);
  if (!payload) {
    clearSessionCookies(res);
    return res.redirect("/login");
  }

  req.user = payload;
  req.accessToken = accessToken;
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
    clearSessionCookies(res);
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }

  req.user = payload;
  req.accessToken = accessToken;
  return next();
}
