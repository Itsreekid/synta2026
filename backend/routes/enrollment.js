// =====================================================
// ENROLLMENT & PURCHASE API ROUTES
// =====================================================
import express from "express";
import { authApiMiddleware } from "../middleware/requireAuth.js"; // FIX #4: use middleware that actually blocks unauthenticated requests
import { supabaseAdmin } from "../config/supabase.js";

const router = express.Router();

/**
 * POST /api/enrollment/enroll
 * Enroll user in a course (after payment or for free courses)
 * PROTECTED
 */
router.post("/enroll", authApiMiddleware, async (req, res) => {
  try {
    const { courseId, paymentId, amountPaid } = req.body;
    const userId = req.user.id;

    if (!courseId) {
      return res.status(400).json({ error: "Course ID is required" });
    }

    // Get course details
    const { data: course, error: courseError } = await supabaseAdmin
      .from("courses")
      .select("id, title, price, is_free")
      .eq("id", courseId)
      .eq("is_published", true)
      .single();

    if (courseError || !course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Check if already enrolled
    const { data: existing } = await supabaseAdmin
      .from("enrollments")
      .select("id")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .single();

    if (existing) {
      return res.status(400).json({ error: "Already enrolled in this course" });
    }

    // For paid courses, verify payment (simplified for now)
    if (!course.is_free && !paymentId) {
      return res.status(400).json({ error: "Payment required for this course" });
    }

    // Create enrollment
    const { data: enrollment, error: enrollError } = await supabaseAdmin
      .from("enrollments")
      .insert({
        user_id: userId,
        course_id: courseId,
        payment_id: paymentId || null,
        amount_paid: amountPaid || course.price,
        enrolled_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (enrollError) {
      console.error("Enrollment error:", enrollError);
      return res.status(500).json({ error: "Failed to create enrollment" });
    }

    // Record purchase
    if (!course.is_free) {
      await supabaseAdmin.from("purchases").insert({
        user_id: userId,
        course_id: courseId,
        amount: amountPaid || course.price,
        payment_status: "completed",
        transaction_id: paymentId,
        purchased_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      enrollment,
      message: `Successfully enrolled in ${course.title}`,
    });
  } catch (error) {
    console.error("Error in enrollment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/enrollment/free-enroll
 * Quick enrollment for free courses
 * PROTECTED
 */
router.post("/free-enroll/:courseId", authApiMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // Verify course is free
    const { data: course, error } = await supabaseAdmin
      .from("courses")
      .select("id, title, is_free")
      .eq("id", courseId)
      .eq("is_free", true)
      .eq("is_published", true)
      .single();

    if (error || !course) {
      return res.status(404).json({ error: "Free course not found" });
    }

    // Check existing enrollment
    const { data: existing } = await supabaseAdmin
      .from("enrollments")
      .select("id")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .single();

    if (existing) {
      return res.json({ success: true, message: "Already enrolled" });
    }

    // Create enrollment
    await supabaseAdmin.from("enrollments").insert({
      user_id: userId,
      course_id: courseId,
      amount_paid: 0,
      enrolled_at: new Date().toISOString(),
    });

    res.json({ success: true, message: `Enrolled in ${course.title}` });
  } catch (error) {
    console.error("Error in free enrollment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/enrollment/my-enrollments
 * Get all user enrollments
 * PROTECTED
 */
router.get("/my-enrollments", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from("enrollments")
      .select(`
        *,
        courses (
          id,
          title,
          description,
          category,
          thumbnail_url
        )
      `)
      .eq("user_id", userId)
      .order("enrolled_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: "Failed to fetch enrollments" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching enrollments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/enrollment/offers
 * Get all active offers
 */
router.get("/offers", async (req, res) => {
  try {
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("offers")
      .select(`
        *,
        offer_courses (
          courses (
            id,
            title,
            price,
            thumbnail_url
          )
        )
      `)
      .eq("is_active", true)
      .or(`valid_until.is.null,valid_until.gt.${now}`)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: "Failed to fetch offers" });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching offers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
