import express from "express";
import pool from "../config/db.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { authRateLimit } from "../middleware/authRateLimit.js";
import {
  UUID, createOfferQuote, buyTimedOffer, createInstallment, confirmInstallment,
  collectInstallment, changeInstallmentDeadline, reverseInstallmentPayment
} from "../services/timed-offers.js";
import { calendarSuggestions } from "../services/offer-calendar.js";
import { suggestInstallments } from "../services/offer-installment-advisor.js";
import { quoteOfferUpgrade, confirmOfferUpgrade, saveUpgradePolicy, correctUpgradeClaim, upgradesEnabled } from "../services/offer-upgrades.js";

const router = express.Router();
const quoteLimit = authRateLimit(30, 60000, req => req.user.id);
const calendarLimit = authRateLimit(4, 60000, req => req.user.id);
const installmentAdviceLimit = authRateLimit(4, 60000, req => req.user.id);
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
async function upgradeSources(targetId, studentId) {
  if (!upgradesEnabled()) return { sources: [] };
  if (!UUID.test(targetId)) return { sources: [] };
  const { rows } = await pool.query(`
    SELECT o.id,o.title FROM offer_upgrade_rules r JOIN offers o ON o.id=r.source_offer_id
    WHERE r.target_offer_id=$1 AND o.access_mode IS DISTINCT FROM 'monthly'
      AND (EXISTS (SELECT 1 FROM offer_access_grants g WHERE g.user_id=$2 AND g.offer_id=o.id
        AND g.access_mode<>'monthly' AND g.revoked_at IS NULL)
        OR EXISTS (SELECT 1 FROM payments p WHERE p.user_id=$2 AND p.offer_id=o.id AND p.status='wallet_completed'
          AND NOT EXISTS (SELECT 1 FROM offer_access_grants g WHERE g.payment_id=p.id)))
    ORDER BY o.title`, [targetId, studentId]);
  return { sources: rows };
}
router.get("/api/purchase/offer-upgrade/:targetId/sources", authApiMiddleware, reply(req =>
  upgradeSources(req.params.targetId, req.user.id)
));
router.post("/api/purchase/offer-upgrade/quote", authApiMiddleware, quoteLimit, reply(req =>
  quoteOfferUpgrade(pool, req.user.id, req.body ?? {})
));
router.post("/api/purchase/offer-upgrade/confirm", authApiMiddleware, reply(req =>
  confirmOfferUpgrade(pool, req.user.id, req.body ?? {})
));
router.post("/api/purchase/offer-installments/:arrangementId/pay", authApiMiddleware, reply(req =>
  collectInstallment(pool, req.user.id, req.params.arrangementId, req.user.id,
    { amount: req.body?.amount, position: req.body?.position, requestId: req.body?.requestId, source: "wallet" }, true)
));
router.get("/api/admin/offers/:offerId/upgrade-policy", requireAdmin, reply(async req => {
  if (!UUID.test(req.params.offerId)) return { policy: null, sources: [] };
  const [policy, sources] = await Promise.all([
    pool.query("SELECT installment_max,installment_due_offsets,upgrades_enabled,access_mode FROM offers WHERE id=$1", [req.params.offerId]),
    pool.query(`SELECT o.id,o.title,r.allow_partial FROM offers o LEFT JOIN offer_upgrade_rules r
      ON r.source_offer_id=o.id AND r.target_offer_id=$1
      WHERE o.id<>$1 AND o.access_mode IS DISTINCT FROM 'monthly' ORDER BY o.title`, [req.params.offerId])
  ]);
  return { policy: policy.rows[0], sources: sources.rows };
}));
router.put("/api/admin/offers/:offerId/upgrade-policy", requireAdmin, reply(req =>
  saveUpgradePolicy(pool, req.params.offerId, req.body ?? {})
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
    `WITH history AS (
     SELECT p.id,o.title,p.amount,p.status,p.created_at,g.access_mode,g.starts_at,g.expires_at,g.revoked_at,
            initial.external_paid_on::text, reversal.recorded_at AS payment_reversed_at,
            NULL::numeric AS upgrade_credit,NULL::numeric AS installment_remaining,NULL::json AS schedule,NULL::uuid AS arrangement_id
     FROM payments p JOIN offers o ON o.id=p.offer_id LEFT JOIN offer_access_grants g ON g.payment_id=p.id
     LEFT JOIN offer_installment_arrangements a ON a.grant_id=g.id
     LEFT JOIN LATERAL (SELECT ip.id,ip.external_paid_on FROM offer_installment_payments ip
                        WHERE ip.arrangement_id=a.id ORDER BY ip.recorded_at,ip.id LIMIT 1) initial ON true
     LEFT JOIN offer_installment_reversals reversal ON reversal.payment_id=initial.id
     WHERE p.user_id=$1
     UNION ALL
     SELECT u.id,o.title,a.paid_total,'scheduled_offer',u.confirmed_at,g.access_mode,g.starts_at,g.expires_at,g.revoked_at,
            NULL,NULL,a.credit_total,a.quoted_price-a.paid_total-a.credit_total,
            (SELECT json_agg(json_build_object('position',s.position,'remaining',s.remaining::text,'dueDate',s.due_date) ORDER BY s.position)
              FROM offer_installment_schedule_balances s WHERE s.arrangement_id=a.id),a.id
     FROM offer_upgrade_confirmations u JOIN offers o ON o.id=u.target_offer_id
     JOIN offer_access_grants g ON g.upgrade_confirmation_id=u.id
     JOIN offer_installment_arrangements a ON a.grant_id=g.id WHERE u.user_id=$1
     )
     SELECT * FROM history h WHERE ($2::uuid IS NULL OR (h.created_at,h.id) <
       (SELECT created_at,id FROM history WHERE id=$2))
     ORDER BY h.created_at DESC,h.id DESC LIMIT 21`, [req.user.id, before ?? null]);
  return { purchases: rows.slice(0,20), next: rows.length > 20 ? rows[19].id : null };
}));

const arrangements = "/api/admin/student/:id/installment-arrangements";
router.get("/api/admin/student/:id/offer-upgrade/:targetId/sources", requireAdmin, reply(req =>
  upgradeSources(req.params.targetId, req.params.id)
));
router.post("/api/admin/student/:id/offer-upgrade/quote", requireAdmin, reply(req =>
  quoteOfferUpgrade(pool, req.params.id, req.body ?? {})
));
router.post("/api/admin/student/:id/offer-upgrade/confirm", requireAdmin, reply(req =>
  confirmOfferUpgrade(pool, req.params.id, req.body ?? {}, req.user.id)
));
router.post("/api/admin/student/:id/offer-upgrade/claims/:claimId/correction", requireAdmin, reply(req =>
  correctUpgradeClaim(pool, req.params.id, req.params.claimId, req.user.id, req.body ?? {})
));
router.get(arrangements, requireAdmin, reply(async req => {
  const { rows } = await pool.query(
    `SELECT a.id,a.offer_id,o.title,a.quoted_price,a.required_initial_payment,a.paid_total,
      a.credit_total, CASE WHEN a.grant_id IS NOT NULL THEN a.quoted_price-a.paid_total-a.credit_total END AS remaining,
      a.next_due_date::text, g.starts_at, g.expires_at,
      COALESCE((SELECT json_agg(json_build_object('position',s.position,'remaining',s.remaining::text,'dueDate',s.due_date) ORDER BY s.position)
        FROM offer_installment_schedule_balances s WHERE s.arrangement_id=a.id), '[]'::json) AS schedule,
      COALESCE((SELECT json_agg(json_build_object('id',c.id,'amount',c.amount::text,'sourceTitle',source.title,
        'correctedAt',r.recorded_at,'reason',r.reason) ORDER BY c.id)
        FROM offer_upgrade_claims c JOIN offer_upgrade_confirmations u ON u.id=c.confirmation_id
        JOIN offers source ON source.id=u.source_offer_id LEFT JOIN offer_upgrade_corrections r ON r.claim_id=c.id
        WHERE c.confirmation_id=g.upgrade_confirmation_id), '[]'::json) AS claims,
      COALESCE((SELECT json_agg(json_build_object(
        'id', p.id, 'amount', p.amount::text, 'source', p.source, 'paidOn', p.external_paid_on,
        'receipt', p.external_receipt_reference, 'recordedAt', p.recorded_at, 'recordedBy', p.recorded_by,
        'reversedAt', r.recorded_at, 'reversedBy', r.recorded_by, 'reason', r.reason) ORDER BY p.recorded_at)
        FROM offer_installment_payments p LEFT JOIN offer_installment_reversals r ON r.payment_id=p.id
        WHERE p.arrangement_id=a.id), '[]'::json) AS payments,
      CASE WHEN a.cancelled_at IS NOT NULL THEN 'cancelled' WHEN a.grant_id IS NULL THEN 'draft'
        WHEN a.paid_total+a.credit_total=a.quoted_price THEN 'settled' WHEN a.next_due_date IS NULL THEN 'no_due_date'
        WHEN a.next_due_date < (NOW() AT TIME ZONE 'Africa/Tunis')::date THEN 'overdue'
        ELSE 'due' END AS status
    FROM offer_installment_arrangements a JOIN offers o ON o.id=a.offer_id
     LEFT JOIN offer_access_grants g ON g.id=a.grant_id WHERE a.user_id=$1 ORDER BY a.created_at DESC`, [req.params.id]);
  return { arrangements: rows, upgradesEnabled: upgradesEnabled() };
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
router.post(arrangements + "/:arrangementId/payments/:paymentId/reversal", requireAdmin, reply(req =>
  reverseInstallmentPayment(pool, req.params.id, req.params.arrangementId, req.params.paymentId, req.user.id, req.body ?? {})
));
router.patch(arrangements + "/:arrangementId/deadline", requireAdmin, reply(req =>
  changeInstallmentDeadline(pool, req.params.id, req.params.arrangementId, req.user.id, req.body ?? {})
));
router.post("/api/admin/offers/calendar-suggestions", requireAdmin, calendarLimit, reply(req =>
  calendarSuggestions(pool, req.body?.academic_year_start, req.body?.refresh === true, req.body?.source_url)
));
router.post("/api/admin/offers/installment-suggestions", requireAdmin, installmentAdviceLimit, reply(req =>
  suggestInstallments(req.body ?? {})
));
export default router;
