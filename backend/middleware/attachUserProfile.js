// =====================================================
// ATTACH USER PROFILE MIDDLEWARE
// Runs after requireAuth. Fetches the full user profile
// row from the `Users` Supabase table and attaches it to
// req.userProfile so EJS templates can pre-populate all
// user-specific DOM elements server-side — eliminating the
// client-side async race condition entirely.
// =====================================================
import { createUserClient } from "../config/supabase.js";

/**
 * Builds a safe, UI-ready profile object from raw Supabase data.
 * Falls back gracefully to auth metadata if the DB row is missing.
 *
 * @param {object} authUser  - The req.user object from requireAuth
 * @param {object|null} dbRow - Row from the `Users` table (may be null)
 * @returns {object} A flat profile object safe to pass to EJS
 */
function buildProfile(authUser, dbRow) {
  const meta = authUser?.user_metadata ?? {};

  // Prefer DB row values, fall back to auth metadata, then empty strings
  const full_name = dbRow?.full_name || meta.full_name || "";
  const firstName = full_name ? full_name.split(" ")[0] : "";
  const initial = full_name
    ? full_name.charAt(0).toUpperCase()
    : (authUser?.email ?? "U").charAt(0).toUpperCase();

  return {
    // Identity
    id: authUser.id,
    email: authUser.email ?? "",
    full_name,
    firstName,
    initial,

    // Contact / academic
    phone: dbRow?.phone || meta.phone || "",
    user_class: dbRow?.user_class || meta.user_class || "",
    user_branch: dbRow?.user_branch || meta.user_branch || "",

    // Wallet
    balance: parseFloat(dbRow?.balance ?? 0).toFixed(2),

    // Raw DB row — available for pages that need it
    _raw: dbRow ?? null,
  };
}

/**
 * attachUserProfile middleware
 *
 * Must be placed AFTER requireAuth in the middleware chain.
 * On failure it never blocks the request — it attaches an empty
 * profile so EJS templates always have something to render.
 */
export async function attachUserProfile(req, res, next) {
  // Guard: requireAuth must have run first
  if (!req.user || !req.accessToken) {
    req.userProfile = buildProfile(req.user ?? { id: "", email: "" }, null);
    return next();
  }

  try {
    const supabaseUser = createUserClient(req.accessToken);

    const { data, error } = await supabaseUser
      .from("Users")
      .select("full_name, phone, user_class, user_branch, balance")
      .eq("id", req.user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found — not a fatal error
      console.warn("[attachUserProfile] DB fetch warning:", error.message);
    }

    req.userProfile = buildProfile(req.user, data ?? null);
  } catch (err) {
    console.warn("[attachUserProfile] Failed to fetch profile:", err.message);
    // Non-fatal — build from auth metadata alone
    req.userProfile = buildProfile(req.user, null);
  }

  return next();
}
