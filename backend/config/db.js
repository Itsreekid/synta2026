// =====================================================
// DATABASE CONNECTION POOL
// Single pg Pool instance — import this in every route.
// Reads DATABASE_URL from environment variables.
// =====================================================
import pg from "pg";
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("FATAL: DATABASE_URL environment variable is not set.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Coolify internal Docker network — SSL not required for same-server connections
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle pg client", err);
});

// Test connection on startup
pool.query("SELECT 1").then(() => {
  console.log("✅ Database connected successfully");
}).catch((err) => {
  console.error("❌ Database connection failed (Local Dev):", err.message);
  // process.exit(1); // Commented out to allow the frontend to be viewed locally without a DB
});

export default pool;
