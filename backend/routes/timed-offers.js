import express from "express";
import pool from "../config/db.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { authRateLimit } from "../middleware/authRateLimit.js";
import {
  UUID, createOfferQuote, buyTimedOffer, createInstallment, confirmInstallment,
  collectInstallment, changeInstallmentDeadline
} from "../services/timed-offers.js";
import { calendarSuggestions } from "../services/offer-calendar.js";

const router = express.Router();
const quoteLimit = authRateLimit(30, 60000, req => req.user.id);
const calendarLimit = authRateLimit(4, 60000, req => req.user.id);
const reply = work => async (req, res) => {
  try {
    if (req.params.id && !UUID.test(req.params.id)) return res.status(400).json({ success: false, error: "Étudiant invalide." });
    const result = await work(req);
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error("Timed offer operation failed:", error.code ?? error.name);
    return res.status(500).json({ success: false, error: "Opération indisponible." });
  }
};

router.post("/api/purchase/offer/quote", authApiMiddleware, quoteLimit, reply(req =>
  createOfferQuote(pool, req.user.id, req.body?.offerId)
));
router.post("/api/purchase/offer", (req, _res, next) =>
  req.body?.quote != null || req.body?.requestId != null ? next() : next("route"),
authApiMiddleware, reply(req => buyTimedOffer(pool, req.user.id, req.body)));

router.get("/api/purchase/offer/history", authApiMiddleware, reply(async req => {
  const before = req.query.before;
  if (before != null && (typeof before !== "string" || !UUID.test(before))) {
    return { purchases: [], next: null };
  }
  const { rows } = await pool.query(
    `SELECT p.id,o.title,p.amount,p.status,p.created_at,g.access_mode,g.starts_at,g.expires_at,g.revoked_at
     FROM payments p JOIN offers o ON o.id=p.offer_id LEFT JOIN offer_access_grants g ON g.payment_id=p.id
     WHERE p.user_id=$1 AND ($2::uuid IS NULL OR (p.created_at,p.id) <
       (SELECT created_at,id FROM payments WHERE id=$2 AND user_id=$1))
     ORDER BY p.created_at DESC,p.id DESC LIMIT 21`, [req.user.id, before ?? null]);
  return { purchases: rows.slice(0,20), next: rows.length > 20 ? rows[19].id : null };
}));

const arrangements = "/api/admin/student/:id/installment-arrangements";
router.get(arrangements, requireAdmin, reply(async req => {
  const { rows } = await pool.query(
    `SELECT a.id,a.offer_id,o.title,a.quoted_price,a.required_initial_payment,a.paid_total,
      CASE WHEN a.grant_id IS NOT NULL THEN a.quoted_price-a.paid_total END AS remaining,
      a.next_due_date::text, g.expires_at,
      CASE WHEN a.cancelled_at IS NOT NULL THEN 'cancelled' WHEN a.grant_id IS NULL THEN 'draft'
        WHEN a.paid_total=a.quoted_price THEN 'settled' WHEN a.next_due_date IS NULL THEN 'no_due_date'
        WHEN a.next_due_date < (NOW() AT TIME ZONE 'Africa/Tunis')::date THEN 'overdue'
        ELSE 'due' END AS status
     FROM offer_installment_arrangements a JOIN offers o ON o.id=a.offer_id
     LEFT JOIN offer_access_grants g ON g.id=a.grant_id WHERE a.user_id=$1 ORDER BY a.created_at DESC`, [req.params.id]);
  return { arrangements: rows };
}));
router.post(arrangements, requireAdmin, reply(req =>
  createInstallment(pool, req.params.id, req.body?.offerId, req.user.id)
));
router.post(arrangements + "/:arrangementId/confirm", requireAdmin, reply(req =>
  confirmInstallment(pool, req.params.id, req.params.arrangementId, req.user.id, req.body ?? {})
));
router.post(arrangements + "/:arrangementId/payments", requireAdmin, reply(req =>
  collectInstallment(pool, req.params.id, req.params.arrangementId, req.user.id, req.body ?? {})
));
router.patch(arrangements + "/:arrangementId/deadline", requireAdmin, reply(req =>
  changeInstallmentDeadline(pool, req.params.id, req.params.arrangementId, req.user.id, req.body ?? {})
));
router.post("/api/admin/offers/calendar-suggestions", requireAdmin, calendarLimit, reply(req =>
  calendarSuggestions(pool, req.body?.academic_year_start, req.body?.refresh === true)
));
export default router;
