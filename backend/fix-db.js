import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

import pool from './config/db.js';

async function fixDb() {
  try {
    console.log("Removing broken foreign key...");
    await pool.query('ALTER TABLE lesson_progress DROP CONSTRAINT IF EXISTS lesson_progress_user_id_fkey;');
    console.log("Adding correct foreign key to public.users...");
    await pool.query('ALTER TABLE lesson_progress ADD CONSTRAINT lesson_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;');
    console.log("Done lesson_progress!");
    
    console.log("Checking enrollments table...");
    await pool.query('ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_user_id_fkey;');
    await pool.query('ALTER TABLE enrollments ADD CONSTRAINT enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;');
    console.log("Done enrollments!");
    
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    process.exit(0);
  }
}

fixDb();
