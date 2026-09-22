// =====================================================
// PAGE ROUTES
// Serves all HTML pages via EJS views.
//
// Architecture:
//  - Public routes: no auth required
//  - Auth routes:  redirect to /dashboard if already logged in
//  - Protected routes: requireAuth → attachUserProfile → render
//
// Every protected render receives: { user, profile }
// =====================================================
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { attachUserProfile } from "../middleware/attachUserProfile.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JWT_SECRET = process.env.JWT_SECRET;

function renderPage(res, view, locals = {}) {
  res.render(view, { ...locals });
}

// --------------------------------------------------
// PUBLIC ROUTES
// --------------------------------------------------

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// --------------------------------------------------
// LEGACY .HTML REDIRECTS
// Old Supabase-era static URLs → new EJS routes
// --------------------------------------------------
router.get("/user.html",            (req, res) => res.redirect(301, "/dashboard"));
router.get("/dashboard.html",       (req, res) => res.redirect(301, "/dashboard"));
router.get("/login.html",           (req, res) => res.redirect(301, "/login"));
router.get("/register.html",        (req, res) => res.redirect(301, "/register"));
router.get("/courses.html",         (req, res) => res.redirect(301, "/app/courses"));
router.get("/course-details.html",  (req, res) => res.redirect(301, "/app/course-details"));
router.get("/profile.html",         (req, res) => res.redirect(301, "/app/profile"));
router.get("/paiement.html",        (req, res) => res.redirect(301, "/app/paiement"));
router.get("/offers.html",          (req, res) => res.redirect(301, "/app/offers"));
router.get("/contact.html",         (req, res) => res.redirect(301, "/app/contact"));
router.get("/password-reset.html",  (req, res) => res.redirect(301, "/password-reset"));

// Old nested paths (pages/auth/...)
router.get("/pages/auth/login.html",    (req, res) => res.redirect(301, "/login"));
router.get("/pages/auth/register.html", (req, res) => res.redirect(301, "/register"));

// Admin static redirects
router.get("/admin",                (req, res) => res.redirect(301, "/admin/login.html"));
router.get("/admin/login",          (req, res) => res.redirect(301, "/admin/login.html"));
router.get("/admin/dashboard",      (req, res) => res.redirect(301, "/admin/dashboard.html"));


router.get("/accueil", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/Accueil.html"));
});

router.get("/session", async (req, res) => {
  let sessionConfig = { session_date: "", session_matiere: "Mathématiques" };
  try {
    const result = await pool.query(
      `SELECT session_date, session_matiere FROM session_config WHERE id = 1`
    );
    if (result.rowCount > 0) sessionConfig = result.rows[0];
  } catch (err) {
    console.error("Error fetching session config:", err);
  }

  let formattedDate = sessionConfig.session_date || "";
  if (formattedDate) {
    try {
      const d = new Date(formattedDate);
      formattedDate =
        d.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) +
        " à " +
        d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    } catch (e) { /* keep raw */ }
  }

  renderPage(res, "pages/session/index", {
    sessionConfig: {
      session_date: formattedDate,
      session_date_raw: sessionConfig.session_date || "",
      session_matiere: sessionConfig.session_matiere || "Mathématiques",
    },
  });
});

router.get("/session/admin", (req, res) => {
  renderPage(res, "pages/session/admin");
});

// --------------------------------------------------
// AUTH ROUTES — Redirect to /dashboard if already logged in
// --------------------------------------------------

function redirectIfLoggedIn(req, res, next) {
  const accessToken = req.cookies?.synta_access;
  if (accessToken) {
    try {
      jwt.verify(accessToken, JWT_SECRET);
      return res.redirect("/dashboard");
    } catch (_) {
      // Token invalid — show the login page
    }
  }
  return next();
}

router.get("/login", redirectIfLoggedIn, (req, res) => {
  renderPage(res, "pages/auth/login");
});

router.get("/register", redirectIfLoggedIn, (req, res) => {
  renderPage(res, "pages/auth/register");
});

router.get("/password-reset", (req, res) => {
  renderPage(res, "pages/auth/password-reset");
});

/**
 * GET /auth/complete-profile
 * Onboarding page for Google users who haven't filled phone/class/branch yet.
 * - Requires a valid JWT session (requireAuth).
 * - Redirects to /dashboard if the profile is already complete.
 */
router.get("/auth/complete-profile", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT phone, class, branch, name, email FROM users WHERE id = $1",
      [req.user.id]
    );
    const u = result.rows[0];

    // If the user already completed onboarding, send them to the dashboard
    if (u && u.phone && u.class && u.branch) {
      return res.redirect("/dashboard");
    }

    renderPage(res, "pages/auth/complete-profile", {
      user: {
        name:  u?.name  || req.user.name  || "",
        email: u?.email || req.user.email || "",
      },
    });
  } catch (err) {
    console.error("[complete-profile] Route error:", err.message);
    renderPage(res, "pages/auth/complete-profile", {
      user: { name: req.user.name || "", email: req.user.email || "" },
    });
  }
});

/**
 * GET /auth/verify-email
 * Validates the email verification token and marks the account as verified.
 */
router.get("/auth/verify-email", async (req, res) => {
  const token = req.query.token;

  if (!token) {
    return renderPage(res, "pages/auth/verify-email", { status: "error", message: "رابط التحقق مفقود." });
  }

  try {
    const result = await pool.query(
      `SELECT id, email_verified, token_expires_at FROM users WHERE verification_token = $1`,
      [token]
    );

    if (result.rowCount === 0) {
      return renderPage(res, "pages/auth/verify-email", { status: "error", message: "رابط التحقق غير صالح." });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return renderPage(res, "pages/auth/verify-email", { status: "success", message: "تم تأكيد بريدك الإلكتروني مسبقاً!" });
    }

    if (new Date() > new Date(user.token_expires_at)) {
      return renderPage(res, "pages/auth/verify-email", { status: "error", message: "انتهت صلاحية رابط التحقق. يرجى طلب رابط جديد." });
    }

    await pool.query(
      `UPDATE users SET email_verified = true, verification_token = NULL, token_expires_at = NULL WHERE id = $1`,
      [user.id]
    );

    return renderPage(res, "pages/auth/verify-email", { status: "success", message: "تم تأكيد بريدك الإلكتروني بنجاح!" });
  } catch (err) {
    console.error("[verify-email] Route error:", err.message);
    return renderPage(res, "pages/auth/verify-email", { status: "error", message: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى." });
  }
});


// --------------------------------------------------
// PROTECTED APP ROUTES
// --------------------------------------------------

const protect = [requireAuth, attachUserProfile];

router.get("/dashboard", ...protect, (req, res) => {
  renderPage(res, "pages/dashboard/index", { user: req.user, profile: req.userProfile });
});

router.get("/app/courses", ...protect, (req, res) => {
  renderPage(res, "pages/courses/index", { user: req.user, profile: req.userProfile });
});

router.get(["/app/course-details", "/app/course-details.html"], ...protect, (req, res) => {
  renderPage(res, "pages/courses/details", { user: req.user, profile: req.userProfile });
});

router.get("/app/calendar", ...protect, (req, res) => {
  renderPage(res, "pages/calendar/index", { user: req.user, profile: req.userProfile });
});

router.get("/app/profile", ...protect, (req, res) => {
  renderPage(res, "pages/profile/index", { user: req.user, profile: req.userProfile });
});

router.get("/app/paiement", ...protect, (req, res) => {
  renderPage(res, "pages/wallet/index", { user: req.user, profile: req.userProfile });
});

router.get("/app/offers", ...protect, (req, res) => {
  renderPage(res, "pages/offers/index", { user: req.user, profile: req.userProfile });
});

router.get("/app/contact", ...protect, (req, res) => {
  renderPage(res, "pages/contact/index", { user: req.user, profile: req.userProfile });
});

router.get("/app/code-pratique", ...protect, (req, res) => {
  renderPage(res, "pages/code/index", { user: req.user, profile: req.userProfile });
});

export default router;
