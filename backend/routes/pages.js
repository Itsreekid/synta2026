import {publishedCampaignOccurrence} from '../services/free-campaigns.js';
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
import pool from "../config/db.js";
import { BUGI_MESSAGES } from "../services/bugi-character.js";
import { requireAuth, verifyToken } from "../middleware/requireAuth.js";
import { safeReturnPath } from "../utils/returnPath.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { attachUserProfile } from "../middleware/attachUserProfile.js";
import { findActiveCampaign, SLUG_PATTERN } from "./session.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();

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
// Keep ?id= (and ?lesson=) so legacy links still open the right course.
router.get("/course-details.html",  (req, res) => {
  const query = req.originalUrl.indexOf("?");
  res.redirect(301, "/app/course-details" + (query === -1 ? "" : req.originalUrl.slice(query)));
});
router.get("/profile.html",         (req, res) => res.redirect(301, "/app/profile"));
router.get("/paiement.html",        (req, res) => res.redirect(301, "/app/paiement"));
router.get("/offers.html",          (req, res) => res.redirect(301, "/app/offers"));
router.get(["/contact.html", "/contact/contact.html", "/app/contact", "/app/contact.html"], (req, res) => res.redirect(301, "/#contact"));
router.get("/password-reset.html",  (req, res) => res.redirect(301, "/password-reset"));

// Old nested paths (pages/auth/...)
router.get("/pages/auth/login.html",    (req, res) => res.redirect(301, "/login"));
router.get("/pages/auth/register.html", (req, res) => res.redirect(301, "/register"));

// Admin static redirects
router.get("/admin",                (req, res) => res.redirect(301, "/admin/login.html"));
router.get("/admin/login",          (req, res) => res.redirect(301, "/admin/login.html"));
router.get("/admin/dashboard",      (req, res) => res.redirect(301, "/admin/dashboard.html"));

router.get("/admin/sessions/:sessionId/host", requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT zoom_start_url FROM live_sessions WHERE id = $1 AND status <> 'cancelled'",
      [req.params.sessionId]
    );
    const hostUrl = result.rows[0]?.zoom_start_url;
    if (!hostUrl) return res.sendStatus(404);
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    return res.redirect(303, hostUrl);
  } catch (error) {
    return next(error);
  }
});


router.get("/accueil", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/Accueil.html"));
});

// Free-session campaigns: /session serves the default campaign, /session/<slug> the others.
function formatTunisDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const text = date.toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis", weekday: "long", year: "numeric", month: "long", day: "numeric" })
    + " à " + date.toLocaleTimeString("fr-FR", { timeZone: "Africa/Tunis", hour: "2-digit", minute: "2-digit" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function renderCampaignPage(req, res, next, slug) {
  try {
    const campaign = await findActiveCampaign(pool, slug);
    if (campaign && slug && slug !== campaign.slug) {
      const queryAt = req.originalUrl.indexOf('?');
      const query = queryAt === -1 ? '' : req.originalUrl.slice(queryAt);
      // Renames can be reversed later: permanent cached redirects could form a loop.
      res.set('Cache-Control', 'private, no-store');
      return res.redirect(302, '/session/' + campaign.slug + query);
    }
    const viewer = verifyToken(req.cookies?.synta_access);
    const nextOccurrence=campaign?await publishedCampaignOccurrence(pool,campaign.id):null;
    res.set("Cache-Control", "private, no-store");
    if (!campaign) res.status(404);
    return renderPage(res, "pages/session/index", {
      campaign: campaign && {
        slug: campaign.slug,
        title: campaign.title,
        description: campaign.description || "",
        subject: campaign.subject,
        hasTarget: Boolean(campaign.target_class),
        hasBranch: Boolean(campaign.target_branch),
        date: formatTunisDate(nextOccurrence?.scheduled_at),
        dateRaw: nextOccurrence?.scheduled_at ? new Date(nextOccurrence.scheduled_at).toISOString() : "",
      },
      viewer: viewer ? { name: viewer.name || "", isStudent: viewer.role !== "admin" } : null,
      hasPlacement: Boolean(req.cookies?.synta_placement),
    });
  } catch (err) {
    return next(err);
  }
}

router.get("/session", (req, res, next) => renderCampaignPage(req, res, next, null));

// The previous admin URL rendered a missing template; the campaigns are managed in the admin dashboard.
router.get("/session/admin", (req, res) => res.redirect(302, "/admin/dashboard.html"));

router.get("/session/:slug", (req, res, next) => {
  if (!SLUG_PATTERN.test(req.params.slug)) return next();
  return renderCampaignPage(req, res, next, req.params.slug);
});

// --------------------------------------------------
// AUTH ROUTES — Redirect to /dashboard if already logged in
// --------------------------------------------------

// Uses the same verifier as requireAuth so the two can never bounce a student between them.
function redirectIfLoggedIn(req, res, next) {
  if (verifyToken(req.cookies?.synta_access)) {
    return res.redirect(safeReturnPath(req.query.next) || "/dashboard");
  }
  return next();
}

router.get("/login", redirectIfLoggedIn, (req, res) => {
  const nextPath = safeReturnPath(req.query.next);
  const sessionNotice = req.query.reason === "expired" ? "expired"
    : req.query.reset === "done" ? "reset"
    : nextPath ? "required" : null;
  renderPage(res, "pages/auth/login", { googleClientId, nextPath, sessionNotice });
});

router.get("/register", redirectIfLoggedIn, (req, res) => {
  renderPage(res, "pages/auth/register", { googleClientId });
});

router.get("/password-reset", (req, res) => {
  // The reset token lives in the URL fragment; keep the page out of caches and Referer headers anyway.
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
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
      return res.redirect(safeReturnPath(req.query.next) || "/dashboard");
    }

    renderPage(res, "pages/auth/complete-profile", {
      nextPath: safeReturnPath(req.query.next),
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
    return renderPage(res, "pages/auth/verify-email", { status: "error", message: "Ce lien de confirmation est incomplet." });
  }

  try {
    const result = await pool.query(
      `SELECT id, email_verified, token_expires_at FROM users WHERE verification_token = $1`,
      [token]
    );

    if (result.rowCount === 0) {
      return renderPage(res, "pages/auth/verify-email", { status: "error", message: "Ce lien de confirmation est invalide ou a déjà été utilisé." });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return renderPage(res, "pages/auth/verify-email", { status: "success", message: "Ton adresse e-mail est déjà confirmée. Tu peux te connecter." });
    }

    if (new Date() > new Date(user.token_expires_at)) {
      return renderPage(res, "pages/auth/verify-email", { status: "error", message: "Ce lien a expiré. Demande un nouveau lien depuis la connexion." });
    }

    await pool.query(
      `UPDATE users SET email_verified = true, verification_token = NULL, token_expires_at = NULL WHERE id = $1`,
      [user.id]
    );

    return renderPage(res, "pages/auth/verify-email", { status: "success", message: "Ton adresse e-mail est confirmée. Connecte-toi pour découvrir tes formations." });
  } catch (err) {
    console.error("[verify-email] Route error:", err.message);
    return renderPage(res, "pages/auth/verify-email", { status: "error", message: "La confirmation a été interrompue. Réessaie dans un instant." });
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


router.get("/app/code-pratique", ...protect, (req, res) => {
  // ?embed=1: editor only, shown inside the lesson page beside the video (same-origin iframe).
  const embed = req.query.embed === "1";
  renderPage(res, "pages/code/index", { user: req.user, profile: req.userProfile, bugiMessages: BUGI_MESSAGES, embed });
});

export default router;
