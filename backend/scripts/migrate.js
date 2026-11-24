import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../loadEnv.js";
import pool from "../config/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirs = [path.resolve(here, "../database/migrations"), path.resolve(here, "../../database/migrations")];
const lockKey = "synta-academy-migrations-v1";

async function migrate() {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    let migrationsDir;
    for (const candidate of migrationsDirs) {
      try { await access(candidate); migrationsDir = candidate; break; } catch {}
    }
    if (!migrationsDir) throw new Error("Migration directory was not found in the deployment image or repository.");
    const files = (await readdir(migrationsDir)).filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file)).sort();
    for (const filename of files) {
      // Checksums must match across Windows (CRLF) and Linux (LF) checkouts.
      const sql = (await readFile(path.join(migrationsDir, filename), "utf8")).replace(/\r\n/g, "\n");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query("SELECT checksum FROM schema_migrations WHERE filename = $1", [filename]);
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum) throw new Error(`Applied migration was edited: ${filename}`);
        console.log(`[migrate] already applied: ${filename}`);
        continue;
      }

      // Conservative guard for unapproved data-destructive operations; migrations remain reviewed code.
      const statements=sql.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\n]*/g,'');
      if(/\b(?:DROP\s+(?:TABLE|SCHEMA|DATABASE)|TRUNCATE|DELETE\s+FROM|DROP\s+COLUMN)\b/i.test(statements)){
        throw new Error('Destructive migration requires a separate reviewed deployment plan.');
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)", [filename, checksum]);
        await client.query("COMMIT");
        console.log(`[migrate] applied: ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
    client.release();
  }
}

migrate().then(() => pool.end()).catch(async (error) => {
  console.error("[migrate] deployment stopped; database migration failed:", typeof error.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : "Migration validation or execution failed. Check approved migration files and database connectivity.");
  await pool.end();
  process.exitCode = 1;
});
