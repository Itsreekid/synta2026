import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { matchesOfferTarget, legacyOfferEntitlement } from "../utils/offerAccess.js";

export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const timedSalesEnabled = () => process.env.TIMED_OFFER_SALES_ENABLED === "true";

export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
export function amount(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) fail(400, "Montant invalide.");
  const [whole, fraction = ""] = value.split(".");
  return whole + "." + fraction.padEnd(2, "0");
}
export function validDate(value) {
  if (typeof value !== "string" || !DATE.test(value) || value.startsWith("0000")) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function nextMonthlyDate(date, anchor) {
  const [year, month] = date.split("-").map(Number);
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchor, last))).toISOString().slice(0, 10);
}
export function offerTerms(body) {
  const mode = body.access_mode ?? null;
  if (mode !== null && !["monthly", "academic_year"].includes(mode)) fail(400, "Durée d’accès invalide.");
  const year = mode === "academic_year" ? body.academic_year_start : null;
  const cutoff = mode === "academic_year" ? body.access_cutoff_date : null;
  if (mode === "academic_year" && (!Number.isInteger(year) || year < 2000 || year > 9998 ||
      !validDate(cutoff) || cutoff < year + "-09-01" || cutoff >= (year + 1) + "-09-01")) {
    fail(400, "Date de fin invalide pour cette année scolaire.");
  }
  const minimum = mode && body.minimum_initial_payment != null && body.minimum_initial_payment !== ""
    ? amount(body.minimum_initial_payment) : null;
  if (mode) {
    const price = amount(body.fixed_price);
    if (minimum && (minimum === "0.00" || BigInt(minimum.replace(".", "")) > BigInt(price.replace(".", "")))) {
      fail(400, "La première tranche doit être positive et inférieure ou égale au prix.");
    }
  }
  return [mode, year, cutoff, minimum];
}

export async function transaction(db, work) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
async function student(db, id) {
  const { rows } = await db.query("SELECT id,balance,class,branch FROM users WHERE id=$1 AND role='user' FOR UPDATE", [id]);
  if (!rows[0]) fail(404, "Étudiant introuvable.");
  return rows[0];
}
async function offer(db, id) {
  const { rows } = await db.query(
    `SELECT o.id,o.title,o.fixed_price,o.minimum_initial_payment,o.target_classes,o.target_branches,
       o.access_mode,o.academic_year_start,o.access_cutoff_date::text,
       o.is_active AND (o.valid_from IS NULL OR o.valid_from<=clock_timestamp())
       AND (o.valid_until IS NULL OR o.valid_until>clock_timestamp()) AS available,
       ARRAY(SELECT oc.course_id FROM offer_courses oc WHERE oc.offer_id=o.id ORDER BY oc.course_id) AS courses
     FROM offers o WHERE o.id=$1 FOR SHARE`, [id]);
  const value = rows[0];
  if (!value?.available || !value.access_mode || !value.courses.length) fail(409, "Offre indisponible.");
  amount(value.fixed_price);
  return value;
}
async function windowFor(db, userId, offer, allowRenewal) {
  const { rows: [clock] } = await db.query(
    `SELECT t AS now, (t AT TIME ZONE 'Africa/Tunis')::date::text AS today
       FROM (SELECT clock_timestamp() AS t) clock`);
  const { rows: [owned] } = await db.query(`SELECT ${legacyOfferEntitlement("$1", "$2")} AS owned`, [userId, offer.id]);
  if (owned.owned) fail(409, "Cette offre est déjà acquise.");
  const { rows: [current] } = await db.query(
    `SELECT starts_at,expires_at,monthly_anchor_day,access_mode,
       (expires_at AT TIME ZONE 'Africa/Tunis')::date::text AS local_expiry
     FROM offer_access_grants WHERE user_id=$1 AND offer_id=$2 AND revoked_at IS NULL AND expires_at>$3
     ORDER BY expires_at DESC LIMIT 1`, [userId, offer.id, clock.now]);
  if (current && (!allowRenewal || offer.access_mode !== "monthly" || current.access_mode !== "monthly" ||
      current.starts_at > clock.now)) fail(409, "Un accès est déjà actif ou planifié.");
  const anchor = offer.access_mode === "monthly" ? current?.monthly_anchor_day ?? Number(clock.today.slice(-2)) : null;
  const date = anchor ? nextMonthlyDate(current?.local_expiry ?? clock.today, anchor) : offer.access_cutoff_date;
  const { rows: [{ expiry }] } = await db.query(
    `SELECT (($1::date + $2::integer)::timestamp AT TIME ZONE 'Africa/Tunis') AS expiry`,
    [date, anchor ? 0 : 1]);
  const start = current?.expires_at ?? clock.now;
  if (expiry <= start) fail(409, "La période de cette offre est terminée.");
  return { starts_at: start, expires_at: expiry, anchor };
}
function quoteKey() {
  if (!process.env.JWT_SECRET) fail(503, "Devis indisponible.");
  return createHmac("sha256", process.env.JWT_SECRET).update("synta-timed-offer-quote-v1").digest();
}
function signature(text) {
  return createHmac("sha256", quoteKey()).update(text).digest("base64url");
}
function readQuote(token) {
  if (typeof token !== "string" || token.length > 2000) fail(400, "Devis invalide.");
  const [text, supplied, extra] = token.split(".");
  if (!text || !supplied || extra !== undefined) fail(400, "Devis invalide.");
  const expected = Buffer.from(signature(text));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) fail(400, "Devis invalide.");
  try { return JSON.parse(Buffer.from(text, "base64url").toString("utf8")); } catch { fail(400, "Devis invalide."); }
}
const termsHash = o => hash([o.access_mode, o.academic_year_start, o.access_cutoff_date, o.fixed_price, o.courses]);
export async function createOfferQuote(db, userId, offerId) {
  if (!timedSalesEnabled()) fail(503, "Achats à durée limitée indisponibles.");
  if (!UUID.test(offerId)) fail(400, "Offre invalide.");
  return transaction(db, async client => {
    const user = await student(client, userId);
    const selected = await offer(client, offerId);
    if (!matchesOfferTarget(selected, user)) fail(403, "Offre indisponible pour ce profil.");
    const period = await windowFor(client, userId, selected, true);
    const requestId = randomUUID();
    const expires_at = period.expires_at.toISOString();
    const text = Buffer.from(JSON.stringify({
      userId, offerId, requestId, expires_at, terms: termsHash(selected), deadline: Date.now() + 300000
    })).toString("base64url");
    return { quote: text + "." + signature(text), requestId, expires_at,
      price: selected.fixed_price, currency: "TND", access_mode: selected.access_mode };
  });
}

async function charge(db, user, total, source, description) {
  let balance = user.balance;
  if (source === "wallet") {
    const { rows } = await db.query(
      "UPDATE users SET balance=balance-$1::numeric WHERE id=$2 AND balance >= $1::numeric RETURNING balance",
      [total, user.id]);
    if (!rows[0]) fail(409, "Solde insuffisant.");
    balance = rows[0].balance;
  }
  const { rows: [{ id }] } = await db.query(
    `INSERT INTO transactions(user_id,amount,type,status,description,processed_at)
     VALUES($1,$2,'purchase','completed',$3,NOW()) RETURNING id`, [user.id, total, description]);
  return { transactionId: id, balance };
}

async function writeGrant(db, user, offer, period, paid, requestId, fingerprint, actor) {
  const { rows: [payment] } = await db.query(
    "INSERT INTO payments(user_id,offer_id,amount,status) VALUES($1,$2,$3,$4) RETURNING id",
    [user.id, offer.id, paid, actor ? "timed_admin_authorized" : "timed_wallet_completed"]);
  const { rows: [grant] } = await db.query(
    `INSERT INTO offer_access_grants
     (user_id,offer_id,payment_id,request_id,request_fingerprint,access_mode,monthly_anchor_day,starts_at,expires_at,granted_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,expires_at`,
    [user.id, offer.id, payment.id, requestId, fingerprint, offer.access_mode, period.anchor,
      period.starts_at, period.expires_at, actor]);
  await db.query("INSERT INTO offer_access_grant_courses(grant_id,course_id) SELECT $1,unnest($2::uuid[])", [grant.id, offer.courses]);
  await db.query(
    `INSERT INTO enrollments(user_id,course_id,offer_id,expires_at,timed_access_only)
     SELECT $1,unnest($2::uuid[]),$3,clock_timestamp(),true ON CONFLICT(user_id,course_id) DO NOTHING`,
    [user.id, offer.courses, offer.id]);
  return grant;
}
export async function buyTimedOffer(db, userId, { offerId, quote, requestId }) {
  const data = readQuote(quote);
  if (!UUID.test(offerId) || !UUID.test(requestId) || data.userId !== userId ||
      data.offerId !== offerId || data.requestId !== requestId) fail(400, "Devis invalide.");
  return transaction(db, async client => {
    const user = await student(client, userId);
    const fingerprint = hash(["wallet", quote]);
    const { rows: [existing] } = await client.query(
      "SELECT id,request_fingerprint,expires_at FROM offer_access_grants WHERE user_id=$1 AND request_id=$2", [userId, requestId]);
    if (existing) {
      if (existing.request_fingerprint !== fingerprint) fail(409, "Demande déjà utilisée.");
      return { success: true, alreadyPurchased: true, grantId: existing.id, expires_at: existing.expires_at, newBalance: user.balance };
    }
    if (!timedSalesEnabled()) fail(503, "Achats à durée limitée indisponibles.");
    if (Date.now() >= data.deadline) fail(409, "Devis expiré. Actualisez le prix et la date.");
    const selected = await offer(client, offerId);
    if (!matchesOfferTarget(selected, user)) fail(403, "Offre indisponible pour ce profil.");
    const period = await windowFor(client, userId, selected, true);
    if (data.terms !== termsHash(selected) || data.expires_at !== period.expires_at.toISOString()) {
      fail(409, "Les conditions ont changé. Demandez un nouveau devis.");
    }
    const { balance } = await charge(client, user, selected.fixed_price, "wallet", "Achat offre : " + selected.title);
    const grant = await writeGrant(client, user, selected, period, selected.fixed_price, requestId, fingerprint, null);
    return { success: true, grantId: grant.id, expires_at: grant.expires_at, newBalance: balance };
  });
}

export async function createInstallment(db, userId, offerId, actor) {
  if (!timedSalesEnabled()) fail(503, "Nouvelles tranches indisponibles.");
  if (!UUID.test(offerId)) fail(400, "Offre invalide.");
  return transaction(db, async client => {
    await student(client, userId);
    const selected = await offer(client, offerId);
    if (!selected.minimum_initial_payment) fail(409, "Cette offre ne prévoit pas de paiement en tranches.");
    const { rows: [draft] } = await client.query(
      `INSERT INTO offer_installment_arrangements
       (user_id,offer_id,quoted_price,required_initial_payment,quoted_access_mode,quoted_academic_year_start,quoted_cutoff_date,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(user_id,offer_id) WHERE grant_id IS NULL AND cancelled_at IS NULL
       DO UPDATE SET user_id=EXCLUDED.user_id
       RETURNING id,quoted_price,required_initial_payment`,
      [userId, offerId, selected.fixed_price, selected.minimum_initial_payment, selected.access_mode,
        selected.academic_year_start, selected.access_cutoff_date, actor]);
    return draft;
  });
}
function paymentInput(input) {
  const paid = amount(input.amount);
  if (paid === "0.00" || !["wallet", "external"].includes(input.source) ||
      !UUID.test(input.requestId) || (input.source === "external" && input.externalConfirmed !== true)) {
    fail(400, "Paiement invalide ou non vérifié.");
  }
  return paid;
}
function dueDate(value) {
  if (value != null && !validDate(value)) fail(400, "Échéance invalide.");
  return value ?? null;
}
async function installment(db, userId, id) {
  if (!UUID.test(id)) fail(400, "Tranche invalide.");
  const { rows: [draft] } = await db.query(
    `SELECT a.*,a.quoted_cutoff_date::text AS cutoff,a.next_due_date::text AS due,
       g.expires_at FROM offer_installment_arrangements a
       LEFT JOIN offer_access_grants g ON g.id=a.grant_id
       WHERE a.user_id=$1 AND a.id=$2 FOR UPDATE OF a`, [userId, id]);
  if (!draft || draft.cancelled_at) fail(404, "Tranche introuvable.");
  return draft;
}
async function recordPayment(db, id, input, fingerprint, transactionId, paid, actor) {
  const { rows: [payment] } = await db.query(
    `INSERT INTO offer_installment_payments(arrangement_id,request_id,request_fingerprint,transaction_id,amount,source,recorded_by)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [id, input.requestId, fingerprint, transactionId, paid, input.source, actor]);
  return payment.id;
}
async function priorOperation(db, table, id, requestId, fingerprint) {
  // Table is a fixed internal identifier, never request data.
  const { rows: [prior] } = await db.query(
    `SELECT * FROM ${table} WHERE arrangement_id=$1 AND request_id=$2`, [id, requestId]);
  if (prior && prior.request_fingerprint !== fingerprint) fail(409, "Demande déjà utilisée.");
  return prior;
}
export async function confirmInstallment(db, userId, id, actor, input) {
  const paid = paymentInput(input);
  const due = dueDate(input.nextDueDate);
  const fingerprint = hash(["confirm", paid, input.source, due]);
  return transaction(db, async client => {
    const user = await student(client, userId);
    const { rows: [identity] } = await client.query(
      "SELECT offer_id FROM offer_installment_arrangements WHERE user_id=$1 AND id=$2", [userId, UUID.test(id) ? id : null]);
    if (!identity) fail(404, "Tranche introuvable.");
    const { rows: [prior] } = await client.query(
      "SELECT id,expires_at,request_fingerprint FROM offer_access_grants WHERE user_id=$1 AND request_id=$2",
      [userId, input.requestId]);
    if (prior) {
      const draft = await installment(client, userId, id);
      if (draft.grant_id !== prior.id || prior.request_fingerprint !== fingerprint) fail(409, "Demande déjà utilisée.");
      return { grantId: prior.id, expires_at: prior.expires_at, alreadyConfirmed: true };
    }
    if (!timedSalesEnabled()) fail(503, "Nouvelles tranches indisponibles.");
    const selected = await offer(client, identity.offer_id);
    const draft = await installment(client, userId, id);
    if (draft.grant_id) fail(409, "Cette tranche est déjà confirmée.");
    if (selected.fixed_price !== draft.quoted_price || selected.minimum_initial_payment !== draft.required_initial_payment ||
        selected.access_mode !== draft.quoted_access_mode || selected.academic_year_start !== draft.quoted_academic_year_start ||
        selected.access_cutoff_date !== draft.cutoff) fail(409, "Les conditions de l’offre ont changé.");
    const { rows: [validation] } = await client.query(
      "SELECT $1::numeric BETWEEN $2::numeric AND $3::numeric AS valid", [paid, draft.required_initial_payment, draft.quoted_price]);
    if (!validation.valid) fail(400, "Montant inférieur au minimum ou supérieur au prix.");
    const period = await windowFor(client, userId, selected, false);
    const { transactionId } = await charge(client, user, paid, input.source, "Première tranche : " + selected.title);
    const grant = await writeGrant(client, user, selected, period, paid, input.requestId, fingerprint, actor);
    await recordPayment(client, id, input, fingerprint, transactionId, paid, actor);
    await client.query(
      `UPDATE offer_installment_arrangements SET grant_id=$1,paid_total=$2,
       next_due_date=CASE WHEN $2::numeric=quoted_price THEN NULL ELSE $3::date END WHERE id=$4`,
      [grant.id, paid, due, id]);
    return { grantId: grant.id, expires_at: grant.expires_at };
  });
}
export async function collectInstallment(db, userId, id, actor, input) {
  const paid = paymentInput(input);
  const fingerprint = hash(["collect", paid, input.source]);
  return transaction(db, async client => {
    const user = await student(client, userId);
    const draft = await installment(client, userId, id);
    if (!draft.grant_id) fail(409, "Confirmez la première tranche.");
    const prior = await priorOperation(client, "offer_installment_payments", id, input.requestId, fingerprint);
    if (prior) {
      const { rows: [balance] } = await client.query(
        "SELECT quoted_price-paid_total AS remaining FROM offer_installment_arrangements WHERE id=$1", [id]);
      return { paymentId: prior.id, remaining: balance.remaining, alreadyRecorded: true };
    }
    const { rows: [updated] } = await client.query(
      `UPDATE offer_installment_arrangements SET paid_total=paid_total+$1::numeric,
       next_due_date=CASE WHEN paid_total+$1::numeric=quoted_price THEN NULL ELSE next_due_date END
       WHERE id=$2 AND paid_total+$1::numeric<=quoted_price RETURNING quoted_price-paid_total AS remaining`, [paid, id]);
    if (!updated) fail(400, "Le montant dépasse le solde de cette tranche.");
    const { transactionId } = await charge(client, user, paid, input.source, "Paiement de tranche");
    const paymentId = await recordPayment(client, id, input, fingerprint, transactionId, paid, actor);
    return { paymentId, remaining: updated.remaining };
  });
}
export async function changeInstallmentDeadline(db, userId, id, actor, input) {
  const due = dueDate(input.nextDueDate);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || reason.length > 500 || !UUID.test(input.requestId)) fail(400, "Motif ou demande invalide.");
  const fingerprint = hash([due, reason]);
  return transaction(db, async client => {
    await student(client, userId);
    const draft = await installment(client, userId, id);
    const prior = await priorOperation(client, "offer_installment_deadline_events", id, input.requestId, fingerprint);
    if (prior) return { next_due_date: due, alreadyRecorded: true };
    if (!draft.grant_id || draft.paid_total === draft.quoted_price) fail(409, "Aucun solde à payer.");
    await client.query(
      `INSERT INTO offer_installment_deadline_events
       (arrangement_id,request_id,request_fingerprint,previous_due_date,new_due_date,reason,changed_by)
       VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, input.requestId, fingerprint, draft.due, due, reason, actor]);
    await client.query("UPDATE offer_installment_arrangements SET next_due_date=$1 WHERE id=$2", [due, id]);
    return { next_due_date: due };
  });
}
