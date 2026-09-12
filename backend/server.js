// =====================================================
// MAIN SERVER FILE
// =====================================================
// IMPORTANT: Load environment variables FIRST
import "./loadEnv.js";

// Now import everything else
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

// Import routes
import contentRoutes from "./routes/content.js";
import coursesRoutes from "./routes/courses.js";
import enrollmentRoutes from "./routes/enrollment.js";
import purchaseRoutes from "./routes/purchase.js";
import offersRoutes from "./routes/offers.js";
import liveRoutes from "./routes/live.js";
import trackingRoutes from "./routes/tracking.js";
import authApiRoutes from "./routes/auth-api.js";
import userApiRoutes from "./routes/user-api.js";
import pageRoutes from "./routes/pages.js";
import sessionRoutes from "./routes/session.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// ENVIRONMENT VALIDATION
// =====================================================
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
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
    // Allow server-to-server (no Origin header) and same-origin requests
    if (!origin) return callback(null, true);
    // FIX #3: If no allowlist configured, default-deny. Otherwise check list.
    if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Reject any origin not explicitly in the allowlist
    return callback(new Error(`CORS: Origin '${origin}' not allowed. Add it to ALLOWED_ORIGINS in .env`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  maxAge: 86400,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  // Allow inline scripts needed by EJS templates and CDN scripts
  contentSecurityPolicy: false,
}));

// Cookie parser — must be before routes that read cookies
app.use(cookieParser());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================================================
// EJS VIEW ENGINE
// =====================================================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// =====================================================
// STATIC FILES
// Serve all frontend assets from backend/public/
// =====================================================
app.use(express.static(path.join(__dirname, "public")));

// Also serve the root-level files (index.html, Accueil.html, etc.)
// so GET / can find index.html
app.use(express.static(path.join(__dirname, "..")));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// =====================================================
// ROUTES
// =====================================================

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Auth cookie routes (must come before page routes)
app.use(authApiRoutes);

// User data API routes
app.use(userApiRoutes);

// Existing API routes
app.use("/api/content", contentRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/enrollment", enrollmentRoutes);
app.use("/api/purchase", purchaseRoutes);
app.use("/api/offers", offersRoutes);
app.use("/api/live", liveRoutes);
app.use("/api/tracking", trackingRoutes);

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
  console.error("Server error:", error);
  if (req.path.startsWith("/api/")) {
    return res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
  res.status(500).send("<h1>500 – Erreur serveur</h1>");
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
  process.exit(0);
});
