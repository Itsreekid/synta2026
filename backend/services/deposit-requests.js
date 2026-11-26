// =====================================================
// DEPOSIT REQUESTS — student "add money to my wallet" requests
// A request is only a pending transaction: the wallet is credited exclusively by an
// admin through POST /api/admin/payments/:id/confirm. Limits are enforced here under
// a row lock on the student, so parallel submissions cannot bypass them.
// =====================================================
import { randomUUID } from "node:crypto";

function configuredNumber(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

/** Maximum amount (DT) of one deposit request. Env DEPOSIT_MAX_AMOUNT, default 1500. */
export const depositMaxAmount = () => configuredNumber("DEPOSIT_MAX_AMOUNT", 1500, 1, 1000000);
/** Maximum simultaneous pending requests per student. Env DEPOSIT_MAX_PENDING, default 5. */
export const depositMaxPending = () => Math.floor(configuredNumber("DEPOSIT_MAX_PENDING", 5, 1, 100));

export const DEPOSIT_PAYMENT_METHODS = Object.freeze([
  "En attente de confirmation", "D17", "Flouci", "Virement bancaire", "Mandat postal", "Espèces",
]);
const DEFAULT_METHOD = DEPOSIT_PAYMENT_METHODS[0];
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{2,63}$/;
const DESCRIPTION_MAX = 200;
// A second identical amount inside this window is treated as a double submission.
const DUPLICATE_WINDOW_SECONDS = 120;

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

/**
 * Validate and normalize a student's request. Returns { amount, method, reference, description }.
 * amount is a string with exactly two decimals, never a float.
 */
export function validateDepositInput(body = {}) {
  const raw = typeof body.amount === "number" ? String(body.amount) : body.amount;
  if (typeof raw !== "string" || !/^\d{1,7}(\.\d{1,2})?$/.test(raw.trim())) {
    fail(400, "Indiquez un montant valide en dinars, avec au maximum deux décimales.");
  }
  const [whole, fraction = ""] = raw.trim().split(".");
  const amount = `${Number(whole)}.${fraction.padEnd(2, "0")}`;
  if (Number(amount) <= 0) fail(400, "Le montant doit être supérieur à 0 DT.");
  const max = depositMaxAmount();
  if (Number(amount) > max) fail(400, `Le montant maximum par demande est de ${max} DT.`);

  const method = body.payment_method == null || body.payment_method === "" ? DEFAULT_METHOD : body.payment_method;
  if (!DEPOSIT_PAYMENT_METHODS.includes(method)) fail(400, "Moyen de paiement invalide.");

  let reference = body.transaction_code;
  if (reference == null || reference === "") reference = "TXN-" + randomUUID();
  if (typeof reference !== "string" || !REFERENCE_PATTERN.test(reference.trim())) {
    fail(400, "La référence du paiement doit contenir entre 3 et 64 caractères (lettres, chiffres, - _ . : /).");
  }

  let description = body.description == null || body.description === "" ? "Demande de dépôt" : body.description;
  if (typeof description !== "string") fail(400, "Description invalide.");
  description = description.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!description || description.length > DESCRIPTION_MAX) fail(400, `La description doit faire entre 1 et ${DESCRIPTION_MAX} caractères.`);

  return { amount, method, reference: reference.trim(), description };
}

/** Cheap check before uploading a receipt, so rejected requests store nothing. Not authoritative. */
export async function precheckDepositLimits(db, userId) {
  const { rows: [row] } = await db.query(
    "SELECT COUNT(*)::int AS pending FROM transactions WHERE user_id = $1 AND type = 'deposit' AND status = 'pending'",
    [userId]
  );
  if (row.pending >= depositMaxPending()) fail(429, pendingLimitMessage());
}

function pendingLimitMessage() {
  return `Vous avez déjà ${depositMaxPending()} demandes en attente. Attendez leur validation avant d’en envoyer une nouvelle.`;
}

/**
 * Insert the pending request under a lock on the student row. Re-checks every limit inside
 * the transaction. Never touches users.balance.
 */
export async function insertDepositRequest(pool, userId, input, receiptUrl) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!locked.rowCount) fail(404, "Compte introuvable.");

    const { rows: [state] } = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE lower(transaction_code) = lower($2))::int AS same_reference,
         COUNT(*) FILTER (WHERE status = 'pending' AND amount = $3::numeric
                          AND created_at > NOW() - make_interval(secs => $4))::int AS recent_same_amount
       FROM transactions WHERE user_id = $1 AND type = 'deposit'`,
      [userId, input.reference, input.amount, DUPLICATE_WINDOW_SECONDS]
    );
    if (state.same_reference > 0) fail(409, "Cette référence de paiement a déjà été envoyée.");
    if (state.recent_same_amount > 0) fail(409, "Une demande identique vient d’être envoyée. Elle est en attente de validation.");
    if (state.pending >= depositMaxPending()) fail(429, pendingLimitMessage());

    const { rows: [transaction] } = await client.query(
      `INSERT INTO transactions
         (user_id, amount, type, status, payment_method, transaction_code, description, created_at, receipt_url)
       VALUES ($1, $2::numeric, 'deposit', 'pending', $3, $4, $5, NOW(), $6)
       RETURNING id, amount, type, status, payment_method, transaction_code, description, created_at`,
      [userId, input.amount, input.method, input.reference, input.description, receiptUrl]
    );
    await client.query("COMMIT");
    return transaction;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
