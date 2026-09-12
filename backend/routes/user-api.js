// =====================================================
// USER API ROUTES
// GET /api/user/stats     — enrollment counts and progress
// GET /api/user/balance   — balance from Users table
// GET /api/user/activity  — recent lesson progress
// GET /api/events         — filtered upcoming events (JSON)
// =====================================================
import express from "express";
import { createUserClient, supabaseAdmin } from "../config/supabase.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";

const router = express.Router();

/**
 * GET /api/user/stats
 * Returns completed course count, active enrollments, and total achievements.
 */
router.get("/api/user/stats", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const supabaseUser = createUserClient(req.accessToken);
    const { data: enrollments, error: enrollErr } = await supabaseUser
      .from("enrollments")
      .select("*")
      .eq("user_id", userId);

    if (enrollErr) throw enrollErr;

    const completed = enrollments?.filter((e) => e.completed === true).length ?? 0;
    const active = enrollments?.filter((e) => e.completed !== true).length ?? 0;

    return res.json({
      completedCourses: completed,
      activeCourses: active,
      overallProgress: enrollments?.length > 0
        ? Math.round((completed / enrollments.length) * 100)
        : 0,
      achievements: completed, // 1 achievement per completed course for now
    });
  } catch (err) {
    console.error("[user/stats] Error:", err.message);
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

/**
 * GET /api/user/balance
 * Returns the user's balance from the Users table.
 */
router.get("/api/user/balance", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const supabaseUser = createUserClient(req.accessToken);
    const { data, error } = await supabaseUser
      .from("Users")
      .select("balance")
      .eq("id", userId)
      .single();

    if (error) {
      // User row may not exist yet — return 0
      if (error.code === "PGRST116") {
        return res.json({ balance: 0 });
      }
      throw error;
    }

    return res.json({ balance: data?.balance ?? 0 });
  } catch (err) {
    console.error("[user/balance] Error:", err.message);
    return res.status(500).json({ error: "Failed to load balance" });
  }
});

/**
 * GET /api/user/activity
 * Returns recent lesson progress records for the user.
 */
router.get("/api/user/activity", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const supabaseUser = createUserClient(req.accessToken);
    const { data, error } = await supabaseUser
      .from("lesson_progress")
      .select("*, lessons(title)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (error && error.code !== "42P01" && error.code !== "PGRST200") {
      // 42P01 = table does not exist, PGRST200 = relationship not found — safe to ignore
      throw error;
    }

    // Reshape data to match frontend expectation: item.lessons.courses.title
    const formattedData = (data || []).map(item => {
      const formatted = { ...item };
      if (formatted.lessons && formatted.courses) {
        formatted.lessons = {
          ...formatted.lessons,
          courses: formatted.courses
        };
      }
      return formatted;
    });

    return res.json({ activity: formattedData });
  } catch (err) {
    console.error("[user/activity] Error:", err.message);
    return res.status(500).json({ error: "Failed to load activity" });
  }
});

/**
 * GET /api/user/transactions
 * Returns all transactions, enrollments, and payments for the wallet page.
 */
router.get("/api/user/transactions", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const supabaseUser = createUserClient(req.accessToken);

    // Fetch raw transactions
    const { data: transactions, error: txErr } = await supabaseUser
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (txErr && txErr.code !== "42P01") {
      console.warn("[transactions] tx fetch warning:", txErr.message);
    }

    // Fetch enrollments with course info
    const { data: enrollments, error: enrollErr } = await supabaseUser
      .from("enrollments")
      .select("*, course:courses(title, price)")
      .eq("user_id", userId)
      .order("enrolled_at", { ascending: false });

    if (enrollErr && enrollErr.code !== "42P01") {
      console.warn("[transactions] enrollment fetch warning:", enrollErr.message);
    }

    // Fetch offer payments
    const { data: payments, error: payErr } = await supabaseUser
      .from("payments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (payErr && payErr.code !== "42P01") {
      console.warn("[transactions] payment fetch warning:", payErr.message);
    }

    return res.json({
      transactions: transactions || [],
      enrollments: enrollments || [],
      payments: payments || [],
    });
  } catch (err) {
    console.error("[user/transactions] Error:", err.message);
    return res.status(500).json({ error: "Failed to load transactions" });
  }
});

/**
 * GET /api/events
 * Returns the upcoming events list as JSON (same data as data/events.js).
 * This allows the frontend to fetch events via the API instead of a script tag.
 */
router.get("/api/events", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const userClass = req.user?.user_metadata?.user_class;
    const userBranch = req.user?.user_metadata?.user_branch;

    // 1. Get static events
    const { default: staticEvents } = await import("../public/data/events.js").catch(() => ({ default: [] }));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filteredStatic = (staticEvents ?? []).filter((event) => {
      const eventDate = new Date(event.date);
      if (eventDate < today) return false;

      const matchesClass = !event.target_classes || event.target_classes.length === 0 || event.target_classes.includes("all") || (userClass && event.target_classes.includes(userClass));
      const matchesBranch = !event.target_branches || event.target_branches.length === 0 || event.target_branches.includes("all") || (userBranch && event.target_branches.includes(userBranch));

      return matchesClass && matchesBranch;
    });

    // 2. Get dynamic live sessions for this user
    let liveEvents = [];
    if (userId) {
      const { data: enrollments } = await supabaseAdmin.from("enrollments").select("*").eq("user_id", userId);
      
      if (enrollments && enrollments.length > 0) {
        const enrolledCourseIds = enrollments.map(e => e.course_id);
        const offerMap = {};
        for (const e of enrollments) {
          if (!offerMap[e.course_id]) offerMap[e.course_id] = new Set();
          if (e.offer_id) offerMap[e.course_id].add(e.offer_id);
        }

        const { data: sessions } = await supabaseAdmin
          .from("live_sessions")
          .select("id, title, description, scheduled_at, duration_minutes, offer_id, zoom_join_url, course_id")
          .in("course_id", enrolledCourseIds)
          .gte("scheduled_at", new Date().toISOString());

        if (sessions) {
          const accessible = sessions.filter(s => !s.offer_id || (offerMap[s.course_id]?.has(s.offer_id) ?? false));
          
          liveEvents = accessible.map(s => {
            const d = new Date(s.scheduled_at);
            // Format to match calendar.js expectations
            return {
              id: s.id,
              date: d.toISOString().split('T')[0],
              time: d.toTimeString().substring(0, 5),
              title: s.title,
              description: s.description || 'Séance en direct sur Zoom',
              icon: '🎥',
              zoomLink: s.zoom_join_url
            };
          });
        }
      }
    }

    // 3. Merge and sort chronologically
    const allEvents = [...filteredStatic, ...liveEvents].sort((a, b) => {
      return new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`);
    });

    return res.json({ events: allEvents });
  } catch (err) {
    console.error("[events] Error:", err.message);
    return res.status(500).json({ error: "Failed to load events" });
  }
});

export default router;
