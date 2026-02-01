// =====================================================
// AUTHENTICATION MIDDLEWARE
// =====================================================
import { supabaseAdmin } from "../config/supabase.js";

/**
 * Verify Supabase JWT token and attach user to request
 */
export async function authMiddleware(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Attach user to request
    req.user = data.user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Authentication failed" });
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
