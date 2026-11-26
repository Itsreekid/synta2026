// =====================================================
// MAIN SERVER FILE
// =====================================================
// IMPORTANT: Load environment variables FIRST
import "./loadEnv.js";
import pool from "./config/db.js";
import timedOfferRoutes from "./routes/timed-offers.js";
import { sendOfferExpiryReminders } from "./services/offer-reminders.js";

// Now import everything else
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { createHomepageDelivery, setPublicAssetCache } from "./utils/homepageDelivery.js";
import { configureAccountChecks, sessionRenewal } from "./middleware/requireAuth.js";

// Import routes
import contentRoutes from "./routes/content.js";
import coursesRoutes from "./routes/courses.js";
import enrollmentRoutes from "./routes/enrollment.js";
import purchaseRoutes from "./routes/purchase.js";
import offersRoutes from "./routes/offers.js";
import liveRoutes from "./routes/live.js";
import trackingRoutes from "./routes/tracking.js";
import authApiRoutes from "./routes/auth-api.js";
import googleAuthRoutes from "./routes/google-auth.js";
import userApiRoutes from "./routes/user-api.js";
import pageRoutes from "./routes/pages.js";
import sessionRoutes from "./routes/session.js";
import adminApiRoutes from "./routes/admin-api.js";
import aiApiRoutes from "./routes/ai-api.js";
import zoomWebhookRoutes from "./routes/zoom-webhook.js";
import { detectLiveFeatures, liveFeatures, recordingImportsEnabled, recordingDiagnostics } from "./services/live-features.js";
import { recordingWorker } from "./services/recording-worker.js";
import { sessionRenewalReady } from "./services/sessions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Production runs behind Coolify's reverse proxy (one hop). Without trusting it, every
// visitor shares the proxy IP and one busy moment trips the login rate limit for everyone.
// An explicit TRUST_PROXY_HOPS (including 0) always wins.
const proxyHopsSetting = process.env.TRUST_PROXY_HOPS?.trim();
const proxyHops = Number(proxyHopsSetting || (process.env.NODE_ENV === "production" ? 1 : 0));
if (Number.isInteger(proxyHops) && proxyHops > 0) app.set("trust proxy", proxyHops);
console.log(`[proxy] Trusted proxy hops: ${Number.isInteger(proxyHops) && proxyHops > 0 ? proxyHops : 0}${proxyHopsSetting ? "" : " (default)"}`);
const PORT = process.env.PORT || 3000;

// =====================================================
// ENVIRONMENT VALIDATION
// =====================================================
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'CLOUDFLARE_ACCOUNT_ID',
  'R2_ACCESS_KEY',
  'R2_SECRET_KEY',
  'R2_BUCKET'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('\n❌ DEPLOYMENT ERROR: Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n📝 Please set these environment variables in your Coolify environment variables panel.\n');
  process.exit(1);
}

// =====================================================
// MIDDLEWARE
// =====================================================

// CORS Configuration
// Since Express now serves both frontend and API from the same origin,
// CORS is only needed if you have external clients calling the API.
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map(o => o.trim()) || [];

const corsOptions = {
  origin: function (origin, callback) {
    // Requests without an Origin header do not need an allowlist match.
    if (!origin) return callback(null, true);
    // FIX #3: If no allowlist configured, default-deny. Otherwise check list.
    if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Reject any origin not explicitly in the allowlist
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  maxAge: 86400,
  optionsSuccessStatus: 200
};

// GIS uses same-origin JSON or a redirect form POST with its own CSRF check.
// Neither flow requires cross-origin API access or CORS response headers.
app.use(cors((req, callback) => {
  if (req.get("Sec-Fetch-Site") === "same-origin" ||
      /^\/api\/auth\/google(?:\/callback)?\/?$/i.test(req.path)) {
    return callback(null, { origin: false });
  }
  return callback(null, corsOptions);
}));

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  // Allow inline scripts needed by EJS templates and CDN scripts
  contentSecurityPolicy: false,
}));

// Cookie parser — must be before routes that read cookies
app.use(cookieParser());

// Zoom signs the raw request body, so this route reads it before JSON parsing.
app.use(zoomWebhookRoutes);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// =====================================================
// EJS VIEW ENGINE
// =====================================================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// =====================================================
// STATIC FILES
// Serve all frontend assets from backend/public/
// =====================================================
app.use(createHomepageDelivery(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "public"), { setHeaders: setPublicAssetCache }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Renew expired access tokens from the rotating refresh token before any route checks auth.
app.use(sessionRenewal(pool));
// Every protected route also rejects deactivated accounts immediately, even with a valid token.
configureAccountChecks(pool);

// =====================================================
// ROUTES
// =====================================================

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Auth cookie routes (must come before page routes)
app.use(authApiRoutes);
app.use(googleAuthRoutes); // Google OAuth endpoint

// User data API routes
app.use(userApiRoutes);

// Existing API routes
app.use("/api/content", contentRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/enrollment", enrollmentRoutes);
app.use(timedOfferRoutes);
app.use("/api/purchase", purchaseRoutes);
app.use("/api/offers", offersRoutes);
app.use("/api/live", liveRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/ai", aiApiRoutes);

// Admin routes
app.use(adminApiRoutes);

// Session onboarding API routes
app.use("/api/session", sessionRoutes);

// HTML page routes (must come last among GET routes)
app.use(pageRoutes);

// =====================================================
// ERROR HANDLING
// =====================================================
app.use((req, res) => {
  // For API requests return JSON, for page requests render 404
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Route not found" });
  }
  res.status(404).send("<h1>404 – Page introuvable</h1><a href='/'>Retour à l'accueil</a>");
});

app.use((error, req, res, next) => {
  const clientError = error.status >= 400 && error.status < 500;
  if (!clientError) console.error("Server error:", error);
  if (req.path.startsWith("/api/")) {
    if (clientError) {
      return res.status(error.status).json({ error: error.expose ? error.message : "Invalid request" });
    }
    return res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
  res.status(clientError ? error.status : 500).send("<h1>Erreur</h1><a href='/'>Retour à l'accueil</a>");
});

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════╗
║      🎓 Synta Academy — Full Stack       ║
║      Port: ${PORT}                          ║
║      Environment: ${process.env.NODE_ENV || 'development'}      ║
╚═══════════════════════════════════════════╝
  `);
  console.log(`✅ Server running → http://localhost:${PORT}`);
  console.log(`📄 Pages:   GET /  /login  /register  /dashboard`);
  console.log(`🔐 Auth:    POST /api/auth/session  /api/auth/logout`);
  console.log(`📊 API:     GET /api/user/stats  /api/user/balance`);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  recordingWorker.stop();
  process.exit(0);
});

sessionRenewalReady(pool).then(ready => {
  if(ready)console.log('[sessions] Automatic renewal ready: 30-day idle window, 90-day maximum.');
  else console.warn('[sessions] Automatic renewal unavailable: apply approved migration 202611200001_create_refresh_tokens.sql. Logins currently fall back to one-hour access.');
}).catch(error=>console.error('[sessions] Cannot verify renewal storage:',error.code??error.name));

detectLiveFeatures(pool).then(features => {
  console.log(`[Live] Extended session access: ${features.extendedAccess ? "on" : "off (migration pending)"}`);
  console.log(`[Live] Free-session campaigns: ${features.freeSessions ? "on" : "off (migration 202611250002 pending)"}`);
  const diagnostics=recordingDiagnostics(true);
  if (recordingImportsEnabled() && diagnostics.status==='ready') {
    recordingWorker.start();
    console.log("[Recordings] Zoom recording import worker started");
  }
  console.log(JSON.stringify({service:'zoom-recordings',event:'readiness',...recordingDiagnostics(recordingWorker.isRunning())}));
}).catch(error => console.error("[Live] Feature detection failed:", error.code ?? error.name));

if (process.env.TIMED_OFFER_REMINDERS_ENABLED === "true") {
  const remind = () => sendOfferExpiryReminders(pool).catch(error =>
    console.error("Offer reminder job failed:", error.code ?? error.name));
  remind();
  setInterval(remind, 15 * 60 * 1000).unref();
}
