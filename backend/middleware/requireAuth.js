// =====================================================
// REQUIRE AUTH MIDDLEWARE
// HttpOnly cookie session guard with silent token refresh
// =====================================================
import { supabaseAnon } from "../config/supabase.js";

const isProd = process.env.NODE_ENV === "production";

/**
 * Cookie options base
 */
const cookieBase = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "strict" : "lax",
  path: "/",
};

/**
 * Set fresh session cookies on the response
 */
function setSessionCookies(res, session) {
  res.cookie("synta_access", session.access_token, {
    ...cookieBase,
    maxAge: 60 * 60 * 1000, // 1 hour
  });
  if (session.refresh_token) {
    res.cookie("synta_refresh", session.refresh_token, {
      ...cookieBase,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
}

/**
 * Clear all session cookies
 */
function clearSessionCookies(res) {
  res.clearCookie("synta_access", { path: "/" });
  res.clearCookie("synta_refresh", { path: "/" });
}

/**
 * requireAuth middleware
 * Protects HTML page routes. On failure, server-side redirects to /login.
 */
export async function requireAuth(req, res, next) {
  const accessToken = req.cookies?.synta_access;
  const refreshToken = req.cookies?.synta_refresh;

  // 1. No cookies at all → redirect immediately
  if (!accessToken && !refreshToken) {
    return res.redirect("/login");
  }

  // 2. Try the access token first (fast path)
  if (accessToken) {
    try {
      const { data, error } = await supabaseAnon.auth.getUser(accessToken);
      if (!error && data?.user) {
        req.user = data.user;
        req.accessToken = accessToken;
        return next();
      }
    } catch (err) {
      // Fall through to refresh attempt
      console.warn("[requireAuth] Access token verification failed:", err.message);
    }
  }

  // 3. Access token expired/invalid — try silent refresh
  if (refreshToken) {
    try {
      const { data, error } = await supabaseAnon.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (!error && data?.session) {
        // Issue fresh cookies transparently
        setSessionCookies(res, data.session);
        req.user = data.user;
        req.accessToken = data.session.access_token;
        console.log("[requireAuth] Session silently refreshed for:", data.user?.email);
        return next();
      }
    } catch (err) {
      console.warn("[requireAuth] Refresh token failed:", err.message);
    }
  }

  // 4. Both tokens failed — clear cookies and redirect
  clearSessionCookies(res);
  return res.redirect("/login");
}

/**
 * authApiMiddleware
 * For protecting API routes (returns JSON errors instead of redirects).
 * Uses the same cookie-based session.
 */
export async function authApiMiddleware(req, res, next) {
  const accessToken = req.cookies?.synta_access;
  const refreshToken = req.cookies?.synta_refresh;

  if (!accessToken && !refreshToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (accessToken) {
    try {
      const { data, error } = await supabaseAnon.auth.getUser(accessToken);
      if (!error && data?.user) {
        req.user = data.user;
        req.accessToken = accessToken;
        return next();
      }
    } catch (err) {
      // Fall through
    }
  }

  if (refreshToken) {
    try {
      const { data, error } = await supabaseAnon.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (!error && data?.session) {
        setSessionCookies(res, data.session);
        req.user = data.user;
        req.accessToken = data.session.access_token;
        return next();
      }
    } catch (err) {
      // Fall through
    }
  }

  clearSessionCookies(res);
  return res.status(401).json({ error: "Session expired. Please log in again." });
}

export { setSessionCookies, clearSessionCookies };
