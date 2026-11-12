import { createHash, randomUUID } from "node:crypto";
import { matchesOfferTarget } from "../utils/offerAccess.js";
import { UUID, amount, fail, timedSalesEnabled, transaction, student, offer, windowFor,
  charge, writeGrant, recordPayment, externalDetails, signature, readQuote, syncScheduledDeadline } from "./timed-offers.js";

export const upgradesEnabled = () => timedSalesEnabled() && process.env.TIMED_OFFER_UPGRADES_ENABLED === "true";
const cents = value => Number(amount(value).replace(".", ""));
const decimal = value => Math.floor(value / 100) + "." + String(value % 100).padStart(2, "0");
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function installmentBreakdown(price, count, minimum, credit) {
  const total = cents(price);
  const applied = cents(credit);
  if (!Number.isInteger(count) || count < 1 || count > 3 || total < count) fail(400, "Nombre de tranches invalide.");
  if (applied > total) fail(409, "Crédit supérieur au prix. Vérification administrative requise.");
  const schedule = Array.from({ length: count }, (_, i) =>
    Math.floor(total / count) + Number(i < total % count));
  const dueNow = Math.max(0, Math.max(schedule[0], minimum ? cents(minimum) : 0) - applied);
  let available = applied + dueNow;
  return {
    dueNow: decimal(dueNow), remaining: decimal(total - available),
    schedule: schedule.map(value => {
      const covered = Math.min(value, available);
      available -= covered;
      return { amount: decimal(value), remaining: decimal(value - covered) };
    })
  };
}

async function sourceEvidence(db, userId, sourceId, targetId) {
  const { rows: [rule] } = await db.query(`
    SELECT r.allow_partial FROM offer_upgrade_rules r JOIN offers o ON o.id=r.source_offer_id
    WHERE r.source_offer_id=$1 AND r.target_offer_id=$2 AND o.access_mode IS DISTINCT FROM 'monthly'
    FOR SHARE OF r`, [sourceId, targetId]);
  if (!rule) fail(403, "Cette offre source ne peut pas fournir de crédit.");
  const { rows: [origin] } = await db.query(`
    SELECT g.id,g.payment_id,g.upgrade_confirmation_id,a.id AS arrangement_id,
           COALESCE(a.quoted_price-a.paid_total-a.credit_total,0)::numeric(10,2)::text AS debt,
           u.source_offer_id
    FROM offer_access_grants g LEFT JOIN offer_installment_arrangements a ON a.grant_id=g.id
    LEFT JOIN offer_upgrade_confirmations u ON u.id=g.upgrade_confirmation_id
    WHERE g.user_id=$1 AND g.offer_id=$2 AND g.access_mode<>'monthly' AND g.revoked_at IS NULL
    ORDER BY g.granted_at DESC,g.id LIMIT 1 FOR UPDATE OF g`, [userId, sourceId]);
  if (!origin) {
    const { rows: [legacy] } = await db.query(`
      SELECT p.id,p.amount::text,false AS installment FROM payments p
      WHERE p.user_id=$1 AND p.offer_id=$2 AND p.status='wallet_completed' AND p.amount>0
        AND NOT EXISTS (SELECT 1 FROM offer_access_grants g WHERE g.payment_id=p.id)
        AND NOT EXISTS (SELECT 1 FROM offer_upgrade_claims c WHERE c.payment_id=p.id)
      FOR UPDATE OF p`, [userId, sourceId]);
    if (!legacy) fail(409, "Aucun paiement source vérifiable.");
    return { grantId: null, rows: [legacy], debt: "0.00", credit: legacy.amount };
  }
  if (origin.source_offer_id) fail(409, "Aucun paiement source vérifiable.");
  if (!rule.allow_partial && cents(origin.debt)) fail(409, "L’offre source doit être réglée intégralement.");
  const { rows } = await db.query(`
    SELECT p.id,p.amount::text,true AS installment FROM offer_installment_payments p
    WHERE p.arrangement_id=$1 AND NOT EXISTS (SELECT 1 FROM offer_installment_reversals r WHERE r.payment_id=p.id)
      AND NOT EXISTS (SELECT 1 FROM offer_upgrade_claims c WHERE c.installment_payment_id=p.id)
    UNION ALL
    SELECT p.id,p.amount::text,false FROM payments p WHERE p.id=$2 AND $1::uuid IS NULL
      AND p.status='timed_wallet_completed' AND p.amount>0
      AND NOT EXISTS (SELECT 1 FROM offer_upgrade_claims c WHERE c.payment_id=p.id)
    ORDER BY id`, [origin.arrangement_id, origin.payment_id]);
  if (!rows.length) fail(409, "Aucun crédit disponible pour cette offre.");
  return { grantId: origin.id, rows, debt: origin.debt,
    credit: decimal(rows.reduce((sum, row) => sum + cents(row.amount), 0)) };
}

async function calculate(db, user, targetId, sourceId, count) {
  if (typeof targetId !== "string" || !UUID.test(targetId) ||
      (sourceId !== null && (typeof sourceId !== "string" || !UUID.test(sourceId) || sourceId === targetId))) {
    fail(400, "Offre invalide.");
  }
  await db.query("SELECT id FROM offers WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [sourceId ? [targetId, sourceId] : [targetId]]);
  const selected = await offer(db, targetId);
  if (selected.access_mode !== "academic_year" || (sourceId && !selected.upgrades_enabled) ||
      (!sourceId && selected.installment_max == null)) fail(409, "Option indisponible pour cette offre.");
  if (!matchesOfferTarget(selected, user)) fail(403, "Offre indisponible pour ce profil.");
  if (!Number.isInteger(count) || count < 1 || count > (selected.installment_max ?? 1)) fail(400, "Nombre de tranches invalide.");
  const period = await windowFor(db, user.id, selected, false);
  const evidence = sourceId ? await sourceEvidence(db, user.id, sourceId, targetId) : { credit: "0.00", debt: "0.00", rows: [] };
  const breakdown = installmentBreakdown(selected.fixed_price, count, selected.minimum_initial_payment, evidence.credit);
  const { rows: [clock] } = await db.query(
    "SELECT ($1::timestamptz AT TIME ZONE 'Africa/Tunis')::date::text AS today", [period.starts_at]);
  const schedule = breakdown.schedule.map((entry, index) => {
    const offset = index === 0 ? 0 : selected.installment_due_offsets[index - 1];
    const dueDate = offset == null ? null : new Date(Date.parse(clock.today + "T00:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
    if (dueDate && dueDate > selected.access_cutoff_date) fail(409, "Une échéance dépasse la fin de l’année scolaire.");
    return { ...entry, dueDate };
  });
  const details = { ...breakdown, schedule, price: selected.fixed_price, credit: evidence.credit,
    sourceDebt: evidence.debt, academicYear: selected.academic_year_start, cutoff: selected.access_cutoff_date,
    expires_at: period.expires_at.toISOString() };
  const fingerprint = digest([details, selected.courses, evidence.grantId, evidence.rows]);
  return { selected, period, evidence, details, fingerprint };
}

export async function quoteOfferUpgrade(db, userId, input) {
  if (!upgradesEnabled()) fail(503, "Paiement par tranches et surclassement indisponibles.");
  const { targetId, sourceId = null, count } = input;
  return transaction(db, async client => {
    const user = await student(client, userId);
    const { details, fingerprint, period } = await calculate(client, user, targetId, sourceId, count);
    const requestId = randomUUID();
    const text = Buffer.from(JSON.stringify({ kind: "offer-upgrade", userId, targetId, sourceId, count,
      requestId, fingerprint, deadline: Date.now() + 300000 })).toString("base64url");
    const remainingMinutes = Math.ceil((period.expires_at - period.starts_at) / 60000);
    return { ...details, remainingMinutes, requestId, quote: text + "." + signature(text) };
  });
}

export async function confirmOfferUpgrade(db, userId, input, adminId = null) {
  const token = readQuote(input.quote);
  if (token.kind !== "offer-upgrade" || token.userId !== userId || token.requestId !== input.requestId) fail(400, "Devis invalide.");
  if (input.source != null && input.source !== "wallet" && !(adminId && input.source === "external")) {
    fail(400, "Source de paiement invalide.");
  }
  const external = Boolean(adminId && input.source === "external");
  const verified = external ? externalDetails({ ...input, source: "external" }, false) : null;
  const fingerprint = digest([input.quote, input.acceptSourceDebt === true, adminId, verified?.paidOn, verified?.receiptReference]);
  return transaction(db, async client => {
    const user = await student(client, userId);
    const { rows: [prior] } = await client.query(`
      SELECT u.fingerprint,g.id AS "grantId",g.expires_at
      FROM offer_upgrade_confirmations u JOIN offer_access_grants g ON g.upgrade_confirmation_id=u.id
      WHERE u.user_id=$1 AND u.request_id=$2`, [userId, input.requestId]);
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail(409, "Demande déjà utilisée.");
      return { grantId: prior.grantId, expires_at: prior.expires_at, alreadyConfirmed: true };
    }
    if (!upgradesEnabled()) fail(503, "Paiement par tranches et surclassement indisponibles.");
    if (Date.now() >= token.deadline) fail(409, "Devis expiré.");
    const data = await calculate(client, user, token.targetId, token.sourceId, token.count);
    const { details, selected, period, evidence } = data;
    if (data.fingerprint !== token.fingerprint) fail(409, "Les conditions ont changé. Demandez un nouveau devis.");
    if (cents(details.sourceDebt) && input.acceptSourceDebt !== true) fail(400, "Confirmez les deux soldes restant à payer.");
    if (external && cents(details.dueNow) && (!verified.paidOn || !verified.receiptReference || verified.externalConfirmed !== true)) {
      fail(400, "Un paiement externe vérifié, daté et référencé est requis.");
    }
    const { rows: [confirmation] } = await client.query(`
      INSERT INTO offer_upgrade_confirmations(user_id,source_offer_id,target_offer_id,request_id,fingerprint,
        actor_id,original_credit,source_debt,immediate_paid)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [userId, token.sourceId, token.targetId, input.requestId, fingerprint, adminId ?? userId,
      details.credit, details.sourceDebt, details.dueNow]);
    for (const item of evidence.rows) {
      await client.query(`INSERT INTO offer_upgrade_claims(confirmation_id,source_grant_id,payment_id,installment_payment_id,amount)
        VALUES($1,$2,$3,$4,$5)`, [confirmation.id, evidence.grantId, item.installment ? null : item.id, item.installment ? item.id : null, item.amount]);
    }
    const grant = await writeGrant(client, user, selected, period, null, input.requestId, fingerprint, adminId, confirmation.id);
    const threshold = decimal(cents(details.schedule[0].amount) > (selected.minimum_initial_payment ? cents(selected.minimum_initial_payment) : 0)
      ? cents(details.schedule[0].amount) : cents(selected.minimum_initial_payment));
    const next = details.schedule.find(row => cents(row.remaining) > 0)?.dueDate ?? null;
    const { rows: [arrangement] } = await client.query(`
      INSERT INTO offer_installment_arrangements(user_id,offer_id,quoted_price,required_initial_payment,quoted_access_mode,
        quoted_academic_year_start,quoted_cutoff_date,grant_id,paid_total,credit_total,next_due_date,created_by)
      VALUES($1,$2,$3,$4,'academic_year',$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [userId, token.targetId, details.price, threshold, selected.academic_year_start, selected.access_cutoff_date,
      grant.id, details.dueNow, details.credit, next, adminId ?? userId]);
    for (const [index, row] of details.schedule.entries()) {
      await client.query("INSERT INTO offer_installment_schedule(arrangement_id,position,amount,due_date) VALUES($1,$2,$3,$4)",
        [arrangement.id, index + 1, row.amount, row.dueDate]);
    }
    if (cents(details.dueNow)) {
      const source = external ? "external" : "wallet";
      const { transactionId } = await charge(client, user, details.dueNow, source, "Paiement offre : " + selected.title);
      await recordPayment(client, arrangement.id, { ...verified, source, requestId: input.requestId }, fingerprint,
        transactionId, details.dueNow, adminId ?? userId);
    }
    return { grantId: grant.id, expires_at: grant.expires_at, remaining: details.remaining };
  });
}

export async function saveUpgradePolicy(db, targetId, body) {
  if (!UUID.test(targetId)) fail(400, "Offre invalide.");
  const { maximum, offsets, enabled, rules } = body;
  if (![1, 2, 3].includes(maximum) || typeof enabled !== "boolean" ||
      !Array.isArray(offsets) || offsets.length !== maximum - 1 ||
      offsets.some((value, index) => value !== null && (!Number.isInteger(value) || value < 1 || value > 366 ||
        offsets.slice(0, index).some(previous => previous !== null && previous >= value))) ||
      !Array.isArray(rules) || rules.length > 100 || (!enabled && rules.length) ||
      rules.some(rule => !rule || !UUID.test(rule.sourceId) || rule.sourceId === targetId || typeof rule.allowPartial !== "boolean") ||
      new Set(rules.map(rule => rule.sourceId)).size !== rules.length) fail(400, "Règles de surclassement invalides.");
  return transaction(db, async client => {
    const { rows } = await client.query("SELECT id,access_mode FROM offers WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [[targetId, ...rules.map(rule => rule.sourceId)]]);
    const target = rows.find(row => row.id === targetId);
    if (!target) fail(404, "Offre introuvable.");
    if ((enabled || maximum > 1) && target.access_mode !== "academic_year") fail(400, "Sélectionnez une offre annuelle.");
    if (rules.some(rule => !rows.some(row => row.id === rule.sourceId && row.access_mode !== "monthly"))) {
      fail(400, "Une offre mensuelle ne peut fournir aucun crédit.");
    }
    await client.query("DELETE FROM offer_upgrade_rules WHERE target_offer_id=$1", [targetId]);
    await client.query("UPDATE offers SET installment_max=$2,installment_due_offsets=$3,upgrades_enabled=$4 WHERE id=$1",
      [targetId, maximum, offsets, enabled]);
    for (const rule of rules) {
      await client.query("INSERT INTO offer_upgrade_rules(source_offer_id,target_offer_id,allow_partial) VALUES($1,$2,$3)",
        [rule.sourceId, targetId, rule.allowPartial]);
    }
    return {};
  });
}

export async function correctUpgradeClaim(db, userId, claimId, actor, input) {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!UUID.test(claimId) || !UUID.test(input.requestId) || !reason || reason.length > 500) fail(400, "Motif ou demande invalide.");
  return transaction(db, async client => {
    await student(client, userId);
    const { rows: [claim] } = await client.query(`
      SELECT c.amount,a.id AS arrangement_id FROM offer_upgrade_claims c
      JOIN offer_upgrade_confirmations u ON u.id=c.confirmation_id
      JOIN offer_access_grants g ON g.upgrade_confirmation_id=u.id
      JOIN offer_installment_arrangements a ON a.grant_id=g.id
      WHERE c.id=$1 AND u.user_id=$2 FOR UPDATE OF a`, [claimId, userId]);
    if (!claim) fail(404, "Crédit introuvable.");
    const saved = await client.query(`INSERT INTO offer_upgrade_corrections(claim_id,request_id,actor_id,reason)
      VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING claim_id`, [claimId, input.requestId, actor, reason]);
    if (!saved.rowCount) {
      const { rows: [prior] } = await client.query(
        "SELECT claim_id,reason FROM offer_upgrade_corrections WHERE request_id=$1", [input.requestId]);
      if (prior?.claim_id === claimId && prior.reason === reason) return { alreadyRecorded: true };
      fail(409, "Crédit déjà corrigé ou demande déjà utilisée.");
    }
    await client.query("UPDATE offer_installment_arrangements SET credit_total=credit_total-$1 WHERE id=$2",
      [claim.amount, claim.arrangement_id]);
    await syncScheduledDeadline(client, claim.arrangement_id);
    return {};
  });
}
