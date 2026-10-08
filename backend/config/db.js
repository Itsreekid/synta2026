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

// Test connection and verify schemas on startup
pool.query(`
  SELECT 1;
  CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info', 
    is_read BOOLEAN NOT NULL DEFAULT false,
    link TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
`).then(() => {
  console.log("✅ Database connected successfully and schemas verified");
}).catch((err) => {
  console.error("❌ Database connection failed (Local Dev):", err.message);
  // process.exit(1);
});

export default pool;
