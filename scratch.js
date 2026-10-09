import './backend/loadEnv.js';
import pool from './backend/config/db.js';
async function run() {
  try {
    await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb`);
    console.log('Features column added');
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
