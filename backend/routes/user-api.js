// =====================================================
// USER API ROUTES
// =====================================================
import express from "express";
import { liveSessionAccess } from "../utils/offerAccess.js";
import { normalizeTunisianPhone, validateLearnerProfile } from "../utils/learnerProfile.js";
import pool from "../config/db.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";
import { createOfferQuote } from "../services/timed-offers.js";
import { decodeReceiptDataUrl } from "../utils/courseImages.js";

const router = express.Router();

/**
 * The Postgres `transactions` table (schema_postgres.sql) was created without
 * the columns the deposit flow writes (carried over from the old Supabase table).
 * Add them idempotently, once per process, before the first insert.
 */
let transactionsSchemaReady = null;
function ensureTransactionsSchema() {
  if (!transactionsSchemaReady) {
    transactionsSchemaReady = pool
      .query(
        `ALTER TABLE transactions
           ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'pending',
           ADD COLUMN IF NOT EXISTS payment_method   TEXT,
           ADD COLUMN IF NOT EXISTS transaction_code TEXT,
           ADD COLUMN IF NOT EXISTS is_confirmed     BOOLEAN NOT NULL DEFAULT false,
           ADD COLUMN IF NOT EXISTS processed_at     TIMESTAMPTZ,
           ADD COLUMN IF NOT EXISTS receipt_url      TEXT`
      )
      .then(() => console.log("[transactions] schema verified"))
      .catch((err) => {
        transactionsSchemaReady = null; // retry on next request
        throw err;
      });
  }
  return transactionsSchemaReady;
}

async function popupSchemaReady(){
 const r=await pool.query("SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='notifications' AND column_name IN ('popup_session_id','popup_scheduled_at','popup_acknowledged_at')");return r.rows[0]?.count===3;
}
router.get('/api/user/notifications/important',authApiMiddleware,async(req,res)=>{
 res.set('Cache-Control','private, no-store');
 try{
 if(!await popupSchemaReady())return res.json({notifications:[]});
 const result=await pool.query(`SELECT n.id,ls.id AS session_id,ls.title,ls.scheduled_at,n.created_at
 FROM notifications n JOIN live_sessions ls ON ls.id=n.popup_session_id
 WHERE n.user_id=$1 AND n.popup_acknowledged_at IS NULL AND ls.status='scheduled' AND ls.scheduled_at>NOW()
 AND n.popup_scheduled_at=ls.scheduled_at AND ${liveSessionAccess('$1')}
 AND NOT EXISTS(SELECT 1 FROM notifications newer WHERE newer.user_id=n.user_id AND newer.popup_session_id=n.popup_session_id AND (newer.created_at,newer.id)>(n.created_at,n.id))
 ORDER BY n.created_at,n.id LIMIT 50`,[req.user.id]);
 const format=new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Tunis',dateStyle:'full',timeStyle:'short'});
 return res.json({notifications:result.rows.map(row=>({id:row.id,title:'Séance reportée',message:'La séance « '+row.title+' » est reportée au '+format.format(new Date(row.scheduled_at))+'.',link:'/app/calendar?session='+encodeURIComponent(row.session_id)+'&date='+new Date(new Date(row.scheduled_at).getTime()+3600000).toISOString().slice(0,10)}))});
 }catch(error){console.error('Important notifications unavailable:',error.code??error.name);return res.status(503).json({error:'Impossible de charger les notifications importantes.'});}
});
router.post('/api/user/notifications/:id/acknowledge',authApiMiddleware,async(req,res)=>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id))return res.status(400).json({error:'Notification invalide.'});
 try{
 if(!await popupSchemaReady())return res.status(503).json({error:'Confirmation indisponible. Réessayez.'});
 const result=await pool.query('UPDATE notifications SET popup_acknowledged_at=COALESCE(popup_acknowledged_at,NOW()) WHERE id=$1 AND user_id=$2 AND popup_session_id IS NOT NULL RETURNING id',[req.params.id,req.user.id]);
 if(!result.rowCount)return res.status(404).json({error:'Notification introuvable.'});return res.json({success:true});
 }catch(error){console.error('Important acknowledgment failed:',error.code??error.name);return res.status(503).json({error:'Confirmation impossible. Réessayez.'});}
});

/**
 * GET /api/user/notifications
 */
router.get("/api/user/notifications", authApiMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ notifications: result.rows });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/user/notifications/:id/read
 */
router.post("/api/user/notifications/:id/read", authApiMiddleware, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking notification read:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
    const { full_name, phone } = req.body || {};
    // Class and section drive offer targeting; only admins may change them.
    const name = typeof full_name === "string" ? full_name.trim() : "";
    if (name.length > 120) return res.status(400).json({ error: "Le nom est trop long." });
    const phoneInput = typeof phone === "string" ? phone.trim() : "";
    const phoneError = validateLearnerProfile({ phone: phoneInput }, false);
    if (phoneError) return res.status(400).json({ error: phoneError });

    await pool.query(
      `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), updated_at = NOW() WHERE id = $3`,
      [name || null, phoneInput ? normalizeTunisianPhone(phoneInput) : null, userId]
    );
    
    return res.json({ success: true });
  } catch (err) {
    console.error("[user/me] Update Error:", err.message);
    return res.status(500).json({ error: "Failed to update user profile" });
  }
});

/**
 * POST /api/auth/complete-profile
 * Called by the onboarding page after Google sign-in.
 * Saves phone, academic level (class), and branch to the user record.
 */
router.post("/api/auth/complete-profile", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone, user_class, user_branch } = req.body || {};

    const profileError = validateLearnerProfile({ phone, userClass: user_class, userBranch: user_branch });
    if (profileError) return res.status(400).json({ error: profileError });

    // --- Persist ---
    await pool.query(
      `UPDATE users
          SET phone      = $1,
              class      = $2,
              branch     = $3,
              updated_at = NOW()
        WHERE id = $4`,
      [normalizeTunisianPhone(phone), user_class, user_branch, userId]
    );

    console.log("[complete-profile] Profile completed for user:", userId);
    return res.json({ success: true });
  } catch (err) {
    console.error("[complete-profile] Error:", err.message);
    return res.status(500).json({ error: "حدث خطأ أثناء حفظ البيانات. يرجى المحاولة مرة أخرى." });
  }
});


/**
 * GET /api/user/stats
 */
router.get("/api/user/stats", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT e.id,
              COALESCE(
                (SELECT COUNT(lp.id) FILTER (WHERE lp.completed = true)
                 FROM lessons l2
                 JOIN course_modules cm2 ON l2.module_id = cm2.module_id
                 LEFT JOIN lesson_progress lp ON lp.lesson_id = l2.id AND lp.user_id = $1
                 WHERE cm2.course_id = e.course_id AND l2.type IS DISTINCT FROM 'quiz'), 0
              ) as dynamic_completed,
              COALESCE(
                (SELECT COUNT(l2.id)
                 FROM lessons l2
                 JOIN course_modules cm2 ON l2.module_id = cm2.module_id
                 WHERE cm2.course_id = e.course_id AND l2.type IS DISTINCT FROM 'quiz'), 0
              ) as total_lessons
       FROM enrollments e WHERE user_id = $1`,
      [userId]
    );

    const enrollments = result.rows;
    let completedCourses = 0;
    let totalProgressSum = 0;

    enrollments.forEach(e => {
      const total = parseInt(e.total_lessons) || 0;
      const completed = parseInt(e.dynamic_completed) || 0;
      const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
      
      if (progress === 100) completedCourses++;
      totalProgressSum += progress;
    });
    
    // Count total completed lessons directly from lesson_progress
    const lessonsResult = await pool.query(
      `SELECT COUNT(*) as total_completed_lessons
       FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
       WHERE lp.user_id = $1 AND lp.completed = true AND l.type IS DISTINCT FROM 'quiz'`,
      [userId]
    );
    const totalCompletedLessons = parseInt(lessonsResult.rows[0].total_completed_lessons) || 0;

    const activeCourses = enrollments.length - completedCourses;
    const overallProgress = enrollments.length > 0 ? Math.round(totalProgressSum / enrollments.length) : 0;

    return res.json({
      completedCourses: completedCourses,
      activeCourses: activeCourses,
      overallProgress: overallProgress,
      achievements: completedCourses,
      totalCompletedLessons: totalCompletedLessons
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
    const { payment_method, transaction_code, description, receipt_url, renewalOfferId } = req.body;
    let { amount } = req.body;
    if (renewalOfferId) {
      const quote = await createOfferQuote(pool, userId, renewalOfferId);
      if (quote.access_mode !== 'monthly' || !receipt_url) return res.status(400).json({ error: 'Renouvellement mensuel ou reçu invalide.' });
      if (String(amount) !== String(quote.price)) return res.status(409).json({ error: 'Le prix a changé. Rouvrez le renouvellement.' });
      amount = quote.price;
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    let finalReceiptUrl = null;
    let receiptImage = null;
    if (receipt_url) {
      receiptImage = decodeReceiptDataUrl(receipt_url);
      if (!receiptImage) return res.status(400).json({ error: "Le reçu doit être une image PNG, JPEG, WebP ou GIF." });
    }
    if (receiptImage) {
      try {
        const { PutObjectCommand } = await import("@aws-sdk/client-s3");
        const { r2Client, R2_BUCKET } = await import("../config/r2.js");

        const { contentType, bytes, extension } = receiptImage;
        const fileName = `receipts/${userId}-${Date.now()}.${extension}`;

        await r2Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: fileName,
          Body: bytes,
          ContentType: contentType
        }));

        const domain = process.env.R2_PUBLIC_DOMAIN || `pub-${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.dev`;
        finalReceiptUrl = `https://${domain}/${fileName}`;
      } catch (err) {
        console.error("Failed to upload receipt to R2:", err);
        // Fallback to storing base64 if R2 fails
        finalReceiptUrl = `data:${receiptImage.contentType};base64,${receiptImage.bytes.toString("base64")}`;
      }
    }

    await ensureTransactionsSchema();

    const result = await pool.query(
      `INSERT INTO transactions
         (user_id, amount, type, status, payment_method, transaction_code, description, created_at, receipt_url)
       VALUES ($1, $2, 'deposit', 'pending', $3, $4, $5, NOW(), $6)
       RETURNING *`,
      [
        userId,
        parseFloat(amount),
        payment_method || "En attente de confirmation",
        transaction_code || ("TXN-" + Date.now()),
        description || "Demande de dépôt",
        finalReceiptUrl
      ]
    );

    return res.json({ success: true, transaction: result.rows[0] });
  } catch (err) {
    if (err.status >= 400 && err.status < 600) return res.status(err.status).json({ error: err.message });
    console.error("[user/transactions POST] Error:", err.code, err.message, err.detail || "");
    return res.status(500).json({ error: "Failed to create transaction" });
  }
});

/**
 * GET /api/events
 */
router.get("/api/events", authApiMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const profileResult = await pool.query(`SELECT class, branch FROM users WHERE id = $1`, [userId]);
    const userClass = profileResult.rows[0]?.class;
    const userBranch = profileResult.rows[0]?.branch;

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
      const sessionResult = await pool.query(
        `SELECT ls.id, ls.title, ls.description, ls.scheduled_at, ls.zoom_join_url IS NOT NULL AS has_join_link
         FROM live_sessions ls
         WHERE ls.scheduled_at >= NOW() AND ${liveSessionAccess("$1")}`,
        [userId]
      );
      liveEvents = sessionResult.rows.map((s) => {
        const d = new Date(s.scheduled_at);
        return {
          id: s.id,
          date: d.toISOString().split("T")[0],
          time: d.toTimeString().substring(0, 5),
          title: s.title,
          description: s.description || "Séance en direct sur Zoom",
          icon: "🎥",
          zoomLink: s.has_join_link ? `/api/live/${encodeURIComponent(s.id)}/join` : null,
        };
      });
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
