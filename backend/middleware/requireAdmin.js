// =====================================================
// REQUIRE ADMIN MIDDLEWARE
// Checks JWT payload for admin role or ADMIN_EMAILS list.
// No Supabase dependency.
// =====================================================
import jwt from "jsonwebtoken";
import { isAccessPayload } from "./requireAuth.js";

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
    payload = jwt.verify(accessToken, JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ error: "Unauthorized: invalid or expired session." });
  }
  if (!isAccessPayload(payload)) {
    return res.status(401).json({ error: "Unauthorized: invalid or expired session." });
  }

  const hasRoleFlag = payload.role === "admin";
  const isEmailAdmin =
    adminEmails.length > 0 && adminEmails.includes(payload.email?.toLowerCase());

  if (!hasRoleFlag && !isEmailAdmin) {
    console.warn(`[requireAdmin] Access denied for: ${payload.email}`);
    return res.status(403).json({
      error: "Forbidden: admin access required.",
    });
  }

  req.user = payload;
  next();
}
