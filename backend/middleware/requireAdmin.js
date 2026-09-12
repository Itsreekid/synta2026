// =====================================================
// REQUIRE ADMIN MIDDLEWARE
// Protects admin-only API routes.
// A user is considered admin if they match ANY of:
//   1. user_metadata.role === 'admin'  (set in Supabase Auth)
//   2. Their email is in ADMIN_EMAILS env var (comma-separated)
// =====================================================
import { supabaseAdmin } from '../config/supabase.js';

const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * requireAdmin
 * Guards routes that must only be accessible to admins.
 * Returns 401 if no valid session, 403 if authenticated but not admin.
 */
export async function requireAdmin(req, res, next) {
  let accessToken = req.cookies?.synta_access;

  // Also check Authorization header (Bearer token)
  if (!accessToken && req.headers.authorization?.startsWith('Bearer ')) {
    accessToken = req.headers.authorization.substring(7);
  }

  if (!accessToken) {
    return res.status(401).json({ error: 'Unauthorized: no session token found.' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !data?.user) {
      return res.status(401).json({ error: 'Unauthorized: invalid or expired session.' });
    }

    const user = data.user;

    // Check 1: Supabase user_metadata role
    const hasRoleFlag = user.user_metadata?.role === 'admin';

    // Check 2: Email is in the ADMIN_EMAILS env allowlist
    const isEmailAdmin = adminEmails.length > 0 && adminEmails.includes(user.email?.toLowerCase());

    if (!hasRoleFlag && !isEmailAdmin) {
      console.warn(`[requireAdmin] Access denied for: ${user.email}`);
      return res.status(403).json({
        error: 'Forbidden: admin access required.',
        hint: 'Add your email to ADMIN_EMAILS in .env or set role=admin in Supabase user_metadata.'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('[requireAdmin] Error:', err.message);
    return res.status(500).json({ error: 'Server error during admin auth check' });
  }
}
