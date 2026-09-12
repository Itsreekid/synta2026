// =====================================================
// AUTHENTICATION MIDDLEWARE (BEARER TOKEN — UNUSED)
// =====================================================
// STATUS: Not used by any current page or API route.
//         All session handling uses HttpOnly cookies via
//         middleware/requireAuth.js (cookie-based).
//
// This file is retained for potential future use if a
// third-party API client needs Bearer token auth.
// Do not import or mount this in server.js for page routes.
// =====================================================
import { supabaseAdmin } from "../config/supabase.js";

export async function authMiddleware(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // No token provided - set user to null and continue
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      // Invalid token - set user to null and continue
      req.user = null;
      return next();
    }

    // Attach user to request
    req.user = data.user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    req.user = null;
    next(); // Continue even on error
  }
}

/**
 * Check if user has access to a specific lesson
 */
export async function checkLessonAccess(userId, lessonId) {
  try {
    const { data, error } = await supabaseAdmin.rpc("check_lesson_access", {
      p_user_id: userId,
      p_lesson_id: lessonId,
    });

    if (error) {
      console.error("Error checking lesson access:", error);
      return false;
    }

    return data === true;
  } catch (error) {
    console.error("Error in checkLessonAccess:", error);
    return false;
  }
}

/**
 * Check if user is enrolled in a course
 */
export async function checkCourseEnrollment(userId, courseId) {
  try {
    const { data, error } = await supabaseAdmin
      .from("enrollments")
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .single();

    if (error || !data) {
      return false;
    }

    // Check if enrollment is still valid
    if (data.expires_at) {
      const expiryDate = new Date(data.expires_at);
      if (expiryDate < new Date()) {
        return false; // Expired
      }
    }

    return true;
  } catch (error) {
    console.error("Error checking course enrollment:", error);
    return false;
  }
}
