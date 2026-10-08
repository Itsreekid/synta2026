import 'dotenv/config'; // Make sure to load env
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function pushToAll(title, message, type = 'info', link = null) {
  try {
    const res = await pool.query(`
      INSERT INTO notifications (user_id, title, message, type, link)
      SELECT id, $1, $2, $3, $4 FROM users
    `, [title, message, type, link]);
    console.log(`✅ Notification envoyée à ${res.rowCount} étudiants !`);
  } catch(e) {
    console.error("❌ Erreur :", e);
  } finally {
    pool.end();
  }
}

const args = process.argv.slice(2);
if (args.length >= 2) {
  pushToAll(args[0], args[1], args[2] || 'info', args[3] || null);
} else {
  console.log("Utilisation : node push_notification.js <titre> <message> [type: success|warning|info] [lien]");
  console.log('Exemple : node push_notification.js "Motivation 🚀" "N\\'oublie pas de réviser Python aujourd\\'hui !" "info" "/app/dashboard"');
  pool.end();
}
