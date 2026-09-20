// =====================================================
// USER API ROUTES
// =====================================================
import express from "express";
import pool from "../config/db.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";

const router = express.Router();

/**
 * GET /api/user/me
 */
router.get("/api/user/me", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT id, email, name, role, phone, class, branch FROM users WHERE id = $1`,
      [userId]
    );
    if (result.rowCount === 0) return res.status(401).json({ error: "User not found" });
    const user = result.rows[0];
    
    // Format to match old Supabase user object for frontend compatibility
    const formattedUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      user_metadata: {
        full_name: user.name,
        phone: user.phone,
        user_class: user.class,
        user_branch: user.branch
      }
    };
    
    return res.json({ success: true, user: formattedUser });
  } catch (err) {
    console.error("[user/me] Error:", err.message);
    return res.status(500).json({ error: "Failed to load user" });
  }
});

/**
 * PUT /api/user/me
 * Update user profile
 */
router.put("/api/user/me", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { full_name, phone, user_class, user_branch } = req.body;
    
    await pool.query(
      `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), class = COALESCE($3, class), branch = COALESCE($4, branch) WHERE id = $5`,
      [full_name, phone, user_class, user_branch, userId]
    );
    
    return res.json({ success: true });
  } catch (err) {
    console.error("[user/me] Update Error:", err.message);
    return res.status(500).json({ error: "Failed to update user profile" });
  }
});

/**
 * GET /api/user/stats
 */
router.get("/api/user/stats", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT completed FROM enrollments WHERE user_id = $1`,
      [userId]
    );

    const enrollments = result.rows;
    const completed = enrollments.filter((e) => e.completed === true).length;
    const active = enrollments.filter((e) => !e.completed).length;

    return res.json({
      completedCourses: completed,
      activeCourses: active,
      overallProgress:
        enrollments.length > 0
          ? Math.round((completed / enrollments.length) * 100)
          : 0,
      achievements: completed,
    });
  } catch (err) {
    console.error("[user/stats] Error:", err.message);
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

/**
 * GET /api/user/balance
 */
router.get("/api/user/balance", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT balance FROM users WHERE id = $1`,
      [userId]
    );

    return res.json({ balance: result.rows[0]?.balance ?? 0 });
  } catch (err) {
    console.error("[user/balance] Error:", err.message);
    return res.status(500).json({ error: "Failed to load balance" });
  }
});

/**
 * GET /api/user/activity
 */
router.get("/api/user/activity", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT lp.*, l.title as lesson_title
       FROM lesson_progress lp
       JOIN lessons l ON l.id = lp.lesson_id
       WHERE lp.user_id = $1
       ORDER BY lp.updated_at DESC
       LIMIT 10`,
      [userId]
    );

    return res.json({ activity: result.rows });
  } catch (err) {
    console.error("[user/activity] Error:", err.message);
    return res.status(500).json({ error: "Failed to load activity" });
  }
});

/**
 * GET /api/user/transactions
 */
router.get("/api/user/transactions", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const txResult = await pool.query(
      `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    ).catch(() => ({ rows: [] }));

    return res.json(txResult.rows);
  } catch (err) {
    console.error("[user/transactions GET] Error:", err.message);
    return res.status(500).json({ error: "Failed to load transactions" });
  }
});

/**
 * POST /api/user/transactions
 * Create a new pending deposit transaction
 */
router.post("/api/user/transactions", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, type, status, payment_method, transaction_code, description } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const result = await pool.query(
      `INSERT INTO transactions
         (user_id, amount, type, status, payment_method, transaction_code, description, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        userId,
        parseFloat(amount),
        type || "deposit",
        status || "pending",
        payment_method || "En attente de confirmation",
        transaction_code || ("TXN-" + Date.now()),
        description || "Demande de dépôt",
      ]
    );

    return res.json({ success: true, transaction: result.rows[0] });
  } catch (err) {
    console.error("[user/transactions POST] Error:", err.message);
    return res.status(500).json({ error: "Failed to create transaction" });
  }
});

/**
 * GET /api/events
 */
router.get("/api/events", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const userClass = req.user?.user_class;
    const userBranch = req.user?.user_branch;

    const { default: staticEvents } = await import("../public/data/events.js").catch(() => ({ default: [] }));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filteredStatic = (staticEvents ?? []).filter((event) => {
      const eventDate = new Date(event.date);
      if (eventDate < today) return false;
      const matchesClass = !event.target_classes?.length || event.target_classes.includes("all") || (userClass && event.target_classes.includes(userClass));
      const matchesBranch = !event.target_branches?.length || event.target_branches.includes("all") || (userBranch && event.target_branches.includes(userBranch));
      return matchesClass && matchesBranch;
    });

    let liveEvents = [];
    if (userId) {
      const enrollResult = await pool.query(
        `SELECT course_id, offer_id FROM enrollments WHERE user_id = $1`,
        [userId]
      );

      if (enrollResult.rowCount > 0) {
        const enrolledCourseIds = enrollResult.rows.map((e) => e.course_id);
        const offerMap = {};
        for (const e of enrollResult.rows) {
          if (!offerMap[e.course_id]) offerMap[e.course_id] = new Set();
          if (e.offer_id) offerMap[e.course_id].add(e.offer_id);
        }

        const sessionResult = await pool.query(
          `SELECT ls.id, ls.title, ls.description, ls.scheduled_at, ls.duration_minutes,
                  ls.offer_id, ls.zoom_join_url, ls.course_id
           FROM live_sessions ls
           WHERE ls.course_id = ANY($1)
             AND ls.scheduled_at >= NOW()`,
          [enrolledCourseIds]
        );

        const accessible = sessionResult.rows.filter(
          (s) => !s.offer_id || (offerMap[s.course_id]?.has(s.offer_id) ?? false)
        );

        liveEvents = accessible.map((s) => {
          const d = new Date(s.scheduled_at);
          return {
            id: s.id,
            date: d.toISOString().split("T")[0],
            time: d.toTimeString().substring(0, 5),
            title: s.title,
            description: s.description || "Séance en direct sur Zoom",
            icon: "🎥",
            zoomLink: s.zoom_join_url,
          };
        });
      }
    }

    const allEvents = [...filteredStatic, ...liveEvents].sort(
      (a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`)
    );

    return res.json({ events: allEvents });
  } catch (err) {
    console.error("[events] Error:", err.message);
    return res.status(500).json({ error: "Failed to load events" });
  }
});

export default router;
