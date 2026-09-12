// =====================================================
// REQUIRE ADMIN MIDDLEWARE
// Checks JWT payload for admin role or ADMIN_EMAILS list.
// No Supabase dependency.
// =====================================================
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function requireAdmin(req, res, next) {
  let accessToken = req.cookies?.synta_access;

  if (!accessToken && req.headers.authorization?.startsWith("Bearer ")) {
    accessToken = req.headers.authorization.substring(7);
  }

  if (!accessToken) {
    return res.status(401).json({ error: "Unauthorized: no session token found." });
  }

  let payload;
  try {
    payload = jwt.verify(accessToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Unauthorized: invalid or expired session." });
  }

  const hasRoleFlag = payload.role === "admin";
  const isEmailAdmin =
    adminEmails.length > 0 && adminEmails.includes(payload.email?.toLowerCase());

  if (!hasRoleFlag && !isEmailAdmin) {
    console.warn(`[requireAdmin] Access denied for: ${payload.email}`);
    return res.status(403).json({
      error: "Forbidden: admin access required.",
      hint: "Add your email to ADMIN_EMAILS in .env or set role=admin in your user record.",
    });
  }

  req.user = payload;
  next();
}
