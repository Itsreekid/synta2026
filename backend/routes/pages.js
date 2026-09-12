// =====================================================
// PAGE ROUTES
// Serves all HTML pages via EJS views.
//
// Architecture:
//  - Public routes: no auth required
//  - Auth routes:  redirect to /dashboard if already logged in
//  - Protected routes: requireAuth → attachUserProfile → render
//
// Every protected render receives:
//   { user, profile, syntaConfig }
//   profile  = enriched profile from Users table (full_name, balance, etc.)
//   syntaConfig = Supabase public config for client-side SDK init
// =====================================================
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "../middleware/requireAuth.js";
import { attachUserProfile } from "../middleware/attachUserProfile.js";
import { supabaseAdmin } from "../config/supabase.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------------------------------
// Shared render helper — always injects syntaConfig
// so partials/head.ejs can output window.__SYNTA_CONFIG__
// --------------------------------------------------
function renderPage(res, view, locals = {}) {
  res.render(view, {
    syntaConfig: {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
    },
    ...locals,
  });
}

// --------------------------------------------------
// PUBLIC ROUTES — No auth required
// --------------------------------------------------

/** GET / — Public landing page */
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../index.html"));
});

/** GET /accueil — Accueil landing variant */
router.get("/accueil", (req, res) => {
  res.sendFile(path.join(__dirname, "../../Accueil.html"));
});

/** GET /session — Standalone VIP onboarding wizard (no auth required) */
router.get("/session", async (req, res) => {
  let sessionConfig = { session_date: '', session_matiere: 'Mathématiques' };
  try {
    const { data } = await supabaseAdmin
      .from('session_config')
      .select('session_date, session_matiere')
      .eq('id', 1)
      .maybeSingle();
    if (data) sessionConfig = data;
  } catch (err) {
    console.error('Error fetching session config:', err);
  }

  // Format the datetime-local string (e.g. "2026-09-15T20:00") into French
  let formattedDate = sessionConfig.session_date || '';
  if (formattedDate) {
    try {
      const d = new Date(formattedDate);
      formattedDate = d.toLocaleDateString('fr-FR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      // Capitalize first letter
      formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    } catch(e) { /* keep raw */ }
  }

  renderPage(res, "pages/session/index", {
    sessionConfig: {
      session_date: formattedDate,
      session_date_raw: sessionConfig.session_date || '', // raw ISO for JS countdown
      session_matiere: sessionConfig.session_matiere || 'Mathématiques'
    }
  });
});

/** GET /session/admin — Admin question manager */
router.get("/session/admin", (req, res) => {
  renderPage(res, "pages/session/admin");
});

// --------------------------------------------------
// AUTH ROUTES — Redirect to /dashboard if already logged in
// --------------------------------------------------

async function redirectIfLoggedIn(req, res, next) {
  const accessToken = req.cookies?.synta_access;
  const refreshToken = req.cookies?.synta_refresh;
  if (accessToken || refreshToken) {
    try {
      const { data } = await supabaseAdmin.auth.getUser(accessToken);
      if (data?.user) return res.redirect("/dashboard");
    } catch (_) {
      // ignore — let them see the login/register page
    }
  }
  return next();
}

/** GET /login */
router.get("/login", redirectIfLoggedIn, (req, res) => {
  renderPage(res, "pages/auth/login");
});

/** GET /register */
router.get("/register", redirectIfLoggedIn, (req, res) => {
  renderPage(res, "pages/auth/register");
});

/** GET /password-reset */
router.get("/password-reset", (req, res) => {
  renderPage(res, "pages/auth/password-reset");
});

// --------------------------------------------------
// PROTECTED APP ROUTES
// requireAuth validates the session cookie.
// attachUserProfile enriches req.userProfile from the DB.
// renderPage passes profile + syntaConfig to every view.
// --------------------------------------------------

const protect = [requireAuth, attachUserProfile];

/** GET /dashboard */
router.get("/dashboard", ...protect, (req, res) => {
  renderPage(res, "pages/dashboard/index", {
    user: req.user,
    profile: req.userProfile,
  });
});

/** GET /app/courses */
router.get("/app/courses", ...protect, (req, res) => {
  renderPage(res, "pages/courses/index", {
    user: req.user,
    profile: req.userProfile,
  });
});

/** GET /app/course-details and /app/course-details.html */
router.get(
  ["/app/course-details", "/app/course-details.html"],
  ...protect,
  (req, res) => {
    renderPage(res, "pages/courses/details", {
      user: req.user,
      profile: req.userProfile,
    });
  }
);

/** GET /app/calendar */
router.get("/app/calendar", ...protect, (req, res) => {
  renderPage(res, "pages/calendar/index", {
    user: req.user,
    profile: req.userProfile,
  });
});

/** GET /app/profile */
router.get("/app/profile", ...protect, (req, res) => {
  renderPage(res, "pages/profile/index", {
    user: req.user,
    profile: req.userProfile,
  });
});

/** GET /app/paiement */
router.get("/app/paiement", ...protect, (req, res) => {
  renderPage(res, "pages/wallet/index", {
    user: req.user,
    profile: req.userProfile,
  });
});

/** GET /app/offers */
router.get("/app/offers", ...protect, (req, res) => {
  renderPage(res, "pages/offers/index", {
    user: req.user,
    profile: req.userProfile,
  });
});

/** GET /app/contact */
router.get("/app/contact", ...protect, (req, res) => {
  renderPage(res, "pages/contact/index", {
    user: req.user,
    profile: req.userProfile,
  });
});

/** GET /app/code-pratique */
router.get("/app/code-pratique", ...protect, (req, res) => {
  renderPage(res, "pages/code/index", {
    user: req.user,
    profile: req.userProfile,
  });
});

export default router;
