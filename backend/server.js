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
// MIDDLEWARE
// =====================================================
// CORS Configuration - Updated to handle preflight requests
// CORS Configuration - Allow your frontend domain
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["*"];
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins[0] === "*" || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(helmet()); // Security headers
app.use(cors(corsOptions)); // Apply CORS
app.options('*', cors(corsOptions)); // Handle preflight requests for all routes
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
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║      🎓 Synta Academy API Server         ║
║      Port: ${PORT}                          ║
║      Environment: ${process.env.NODE_ENV || 'development'}      ║
╚═══════════════════════════════════════════╝
  `);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});
