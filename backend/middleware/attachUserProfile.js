// =====================================================
// ATTACH USER PROFILE MIDDLEWARE
// Runs after requireAuth. Fetches the full user profile
// from the users table and attaches it to req.userProfile
// so EJS templates can pre-populate all user-specific
// DOM elements server-side.
// =====================================================
import pool from "../config/db.js";

function buildProfile(authUser, dbRow) {
  const full_name = dbRow?.name || authUser?.name || "";
  const firstName = full_name ? full_name.split(" ")[0] : "";
  const initial = full_name
    ? full_name.charAt(0).toUpperCase()
    : (authUser?.email ?? "U").charAt(0).toUpperCase();

  return {
    id: authUser.id,
    email: authUser.email ?? "",
    full_name,
    firstName,
    initial,
    phone: dbRow?.phone || "",
    user_class: dbRow?.class || "",
    user_branch: dbRow?.branch || "",
    balance: parseFloat(dbRow?.balance ?? 0).toFixed(2),
    _raw: dbRow ?? null,
  };
}

export async function attachUserProfile(req, res, next) {
  if (!req.user) {
    req.userProfile = buildProfile({ id: "", email: "" }, null);
    return next();
  }

  try {
    const result = await pool.query(
      `SELECT name, phone, class, branch, balance FROM users WHERE id = $1`,
      [req.user.id]
    );

    req.userProfile = buildProfile(req.user, result.rows[0] ?? null);
  } catch (err) {
    console.warn("[attachUserProfile] Failed to fetch profile:", err.message);
    req.userProfile = buildProfile(req.user, null);
  }

  return next();
}
