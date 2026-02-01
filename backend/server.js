// =====================================================
// MAIN SERVER FILE
// =====================================================
// IMPORTANT: Load environment variables FIRST
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });

// Now import everything else
import express from "express";
import cors from "cors";
import helmet from "helmet";

// Import routes
import contentRoutes from "./routes/content.js";
import coursesRoutes from "./routes/courses.js";
import enrollmentRoutes from "./routes/enrollment.js";

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
  console.error('\n📝 Please set these environment variables in Railway dashboard.');
  console.error('   Railway Dashboard → Your Service → Variables tab\n');
  process.exit(1);
}

// =====================================================
// MIDDLEWARE
// =====================================================
// CORS Configuration - Strict enforcement
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map(o => o.trim()) || [];

console.log("🔐 CORS Configuration:");
console.log("  Allowed Origins:", allowedOrigins);
console.log("  Environment ALLOWED_ORIGINS:", process.env.ALLOWED_ORIGINS || "NOT SET");

const corsOptions = {
  origin: function (origin, callback) {
    console.log(`📨 CORS Request from origin: ${origin || 'NO ORIGIN'}`);
    
    // Allow requests with no origin (like mobile apps, curl, Postman, server-to-server)
    if (!origin) {
      console.log(`✅ CORS allowed for request with no origin (Postman/Server)`);
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
      console.log(`✅ CORS allowed for: ${origin}`);
      return callback(null, true);
    } else {
      console.error(`❌ CORS BLOCKED origin: ${origin}`);
      console.error(`   Allowed origins: ${allowedOrigins.join(", ")}`);
      const msg = `CORS policy does not allow access from origin: ${origin}`;
      return callback(new Error(msg), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  credentials: true,
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200
};

// Apply CORS before other middleware
app.use(cors(corsOptions));

// Explicitly handle OPTIONS requests
app.options('*', cors(corsOptions));

// Security headers (after CORS to avoid conflicts)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// =====================================================
// ROUTES
// =====================================================
app.get("/", (req, res) => {
  res.json({
    message: "Synta Academy API",
    version: "1.0.0",
    status: "running",
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Debug endpoint - Check CORS configuration
app.get("/debug/cors", (req, res) => {
  res.json({
    message: "CORS Debug - If you see this, backend is working!",
    timestamp: new Date().toISOString(),
    environment: {
      ALLOWED_ORIGINS_RAW: process.env.ALLOWED_ORIGINS || "❌ NOT SET",
      ALLOWED_ORIGINS_PARSED: allowedOrigins,
      NODE_ENV: process.env.NODE_ENV || "not set"
    },
    request: {
      origin: req.headers.origin || "NO ORIGIN HEADER",
      host: req.headers.host,
      referer: req.headers.referer || "no referer"
    },
    cors: {
      willAllow: !req.headers.origin || allowedOrigins.includes(req.headers.origin),
      reason: !req.headers.origin ? "No origin header (direct access)" : 
              allowedOrigins.includes(req.headers.origin) ? "Origin in allowed list" :
              `Origin ${req.headers.origin} NOT in allowed list: ${allowedOrigins.join(", ")}`
    }
  });
});

// API routes
app.use("/api/content", contentRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/enrollment", enrollmentRoutes);

// =====================================================
// ERROR HANDLING
// =====================================================
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
});

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════╗
║      🎓 Synta Academy API Server         ║
║      Port: ${PORT}                          ║
║      Environment: ${process.env.NODE_ENV || 'development'}      ║
╚═══════════════════════════════════════════╝
  `);
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});
