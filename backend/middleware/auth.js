import { enrollmentAccess } from "../utils/offerAccess.js";
// =====================================================
// AUTH MIDDLEWARE (Bearer token + helpers)
// Replaces Supabase-based token verification with JWT.
// =====================================================
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { accountAllowed, isAccessPayload } from "./requireAuth.js";

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * authMiddleware — optional auth via Bearer token.
 * Sets req.user to the decoded payload, or null if missing/invalid.
 * Used on routes that work for both authenticated and anonymous users.
 */
export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.synta_access;
    const token = cookieToken || (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null);

    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
      req.user = isAccessPayload(payload) ? payload : null;
    } catch {
      req.user = null;
    }
    // A deactivated account is treated as anonymous, even with a still-valid token.
    if (req.user && !(await accountAllowed(req.user.id))) req.user = null;

    return next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    req.user = null;
    next();
  }
}

/**
 * Check if user has access to a specific lesson via enrollment.
 * Replaces the Supabase RPC call with a raw SQL query.
 */
export async function checkLessonAccess(userId, lessonId) {
  try {
    const result = await pool.query(
      `SELECT 1
       FROM enrollments e
       JOIN course_modules cm ON cm.course_id = e.course_id
       JOIN lessons l ON l.module_id = cm.module_id
       WHERE e.user_id = $1
         AND l.id = $2
         AND ${enrollmentAccess("e")}
       LIMIT 1`,
      [userId, lessonId]
    );
    return result.rowCount > 0;
  } catch (error) {
    console.error("Error in checkLessonAccess:", error);
    return false;
  }
}

/**
 * Check if user is enrolled in a specific course.
 */
export async function checkCourseEnrollment(userId, courseId) {
  try {
    const result = await pool.query(
      `SELECT 1 FROM enrollments e WHERE e.user_id = $1 AND e.course_id = $2
       AND ${enrollmentAccess("e")} LIMIT 1`,
      [userId, courseId]
    );
    return result.rowCount > 0;
  } catch (error) {
    console.error("Error checking course enrollment:", error);
    return false;
  }
}
