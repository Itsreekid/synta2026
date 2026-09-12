// =====================================================
// AUTH MIDDLEWARE (Bearer token + helpers)
// Replaces Supabase-based token verification with JWT.
// =====================================================
import jwt from "jsonwebtoken";
import pool from "../config/db.js";

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
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      req.user = null;
    }

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
       JOIN modules m ON m.course_id = e.course_id
       JOIN lessons l ON l.module_id = m.id
       WHERE e.user_id = $1
         AND l.id = $2
         AND (e.expires_at IS NULL OR e.expires_at > NOW())
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
      `SELECT id, expires_at FROM enrollments
       WHERE user_id = $1 AND course_id = $2
       LIMIT 1`,
      [userId, courseId]
    );

    if (result.rowCount === 0) return false;

    const { expires_at } = result.rows[0];
    if (expires_at && new Date(expires_at) < new Date()) return false;

    return true;
  } catch (error) {
    console.error("Error checking course enrollment:", error);
    return false;
  }
}
