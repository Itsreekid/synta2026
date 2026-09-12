// =====================================================
// AUTH API ROUTES
// POST /api/auth/session  — exchange Supabase JWT for HttpOnly cookies
// POST /api/auth/logout   — clear cookies and end session
// =====================================================
import express from "express";
import { supabaseAnon } from "../config/supabase.js";
import { setSessionCookies, clearSessionCookies } from "../middleware/requireAuth.js";

const router = express.Router();

/**
 * POST /api/auth/session
 * Called by auth.js on the client after a successful Supabase login.
 * Verifies the token server-side, then sets HttpOnly cookies.
 */
router.post("/api/auth/session", async (req, res) => {
  try {
    const { access_token, refresh_token } = req.body;

    if (!access_token) {
      return res.status(400).json({ error: "access_token is required" });
    }

    // Verify the token with Supabase anon client
    const { data, error } = await supabaseAnon.auth.getUser(access_token);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Set HttpOnly cookies
    setSessionCookies(res, { access_token, refresh_token });

    return res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (err) {
    console.error("[auth/session] Error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/logout
 * Clears session cookies. Client also calls supabase.auth.signOut().
 */
router.post("/api/auth/logout", (req, res) => {
  clearSessionCookies(res);
  return res.json({ success: true });
});

export default router;
