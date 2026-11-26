// =====================================================
// ACCOUNT STATUS — deactivation and safe deletion of students
// Deactivation needs the held migration 202611260003 (users.deactivated_at).
// Until it is applied, every account counts as active and deactivation is
// unavailable; deletion protection works without it.
// =====================================================
import { revokeAllUserSessions } from "./sessions.js";

let readiness = null;

/** True when users.deactivated_at exists. Cached; call resetAccountStatusCache() in tests. */
export function accountDeactivationReady(db) {
  readiness ??= db.query(
    `SELECT COUNT(*)::int AS count FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'users'
       AND column_name IN ('deactivated_at', 'deactivated_by')`
  ).then(result => result.rows[0]?.count === 2)
    .catch(error => { readiness = null; throw error; });
  return readiness;
}

export function resetAccountStatusCache() {
  readiness = null;
}

/** True when the account exists and is not deactivated. */
export async function isAccountActive(db, userId) {
  if (!(await accountDeactivationReady(db))) return true;
  const result = await db.query("SELECT deactivated_at IS NULL AS active FROM users WHERE id = $1", [userId]);
  return result.rows[0]?.active === true;
}

export const DEACTIVATED_MESSAGE = "Ce compte est désactivé. Contacte l’équipe Synta pour le réactiver.";

/**
 * Express guard for student money actions (purchases, deposits, installments). Runs after
 * authApiMiddleware, so a deactivated student cannot spend during the remaining lifetime
 * of an already-issued access token.
 */
export function requireActiveAccount(db) {
  return async (req, res, next) => {
    try {
      if (await isAccountActive(db, req.user.id)) return next();
      return res.status(403).json({ error: DEACTIVATED_MESSAGE, deactivated: true });
    } catch (error) {
      console.error("[account-status] Check failed:", error.code || error.name);
      return res.status(503).json({ error: "Service momentanément indisponible. Réessaie." });
    }
  };
}

/**
 * Every place a deletion would destroy money or audit history. Checked before any delete;
 * tables that are not deployed yet are skipped.
 */
const HISTORY_CHECKS = [
  ["transactions", "SELECT 1 FROM transactions WHERE user_id = $1 LIMIT 1"],
  ["payments", "SELECT 1 FROM payments WHERE user_id = $1 LIMIT 1"],
  ["purchases", "SELECT 1 FROM purchases WHERE user_id = $1 LIMIT 1"],
  ["offer_access_grants", "SELECT 1 FROM offer_access_grants WHERE user_id = $1 LIMIT 1"],
  ["offer_installment_arrangements", "SELECT 1 FROM offer_installment_arrangements WHERE user_id = $1 LIMIT 1"],
  ["offer_upgrade_confirmations", "SELECT 1 FROM offer_upgrade_confirmations WHERE user_id = $1 LIMIT 1"],
  ["enrollments", "SELECT 1 FROM enrollments WHERE user_id = $1 AND COALESCE(amount_paid, 0) <> 0 LIMIT 1"],
];

/**
 * Hard-delete a student only when nothing financial would be lost.
 * Returns { deleted: true } or throws an error with status + French message.
 */
export async function deleteStudentSafely(pool, studentId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT id, balance, COALESCE(to_jsonb(users)->>'debt', '0') AS debt FROM users WHERE id = $1 AND role = 'user' FOR UPDATE",
      [studentId]
    );
    const student = found.rows[0];
    if (!student) throw statusError(404, "Étudiant introuvable.");
    if (Number(student.balance) !== 0 || Number(student.debt) !== 0) {
      throw statusError(409, "Suppression impossible : cet étudiant a un solde ou une dette. Désactivez le compte à la place pour conserver l’historique financier.");
    }
    for (const [table, sql] of HISTORY_CHECKS) {
      const exists = await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [table]);
      if (!exists.rows[0].present) continue;
      if ((await client.query(sql, [studentId])).rowCount) {
        throw statusError(409, "Suppression impossible : cet étudiant a un historique de paiements ou d’inscriptions payées. Désactivez le compte à la place pour tout conserver.");
      }
    }
    await client.query("SAVEPOINT student_delete");
    try {
      await client.query("DELETE FROM users WHERE id = $1 AND role = 'user'", [studentId]);
    } catch (error) {
      // Other records still point to this student (e.g. free-session sign-ups): keep everything.
      if (error.code === "23503") {
        await client.query("ROLLBACK TO SAVEPOINT student_delete");
        throw statusError(409, "Suppression impossible : d’autres données sont liées à cet étudiant. Désactivez le compte à la place.");
      }
      throw error;
    }
    await client.query("COMMIT");
    return { deleted: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Deactivate (active=false) or reactivate a student. Never touches financial rows.
 * Deactivation also ends every renewable session.
 */
export async function setStudentActive(pool, studentId, active, adminId) {
  if (!(await accountDeactivationReady(pool))) {
    throw statusError(503, "La désactivation des comptes nécessite la migration 202611260003 (en attente d’approbation).");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      active
        ? "UPDATE users SET deactivated_at = NULL, deactivated_by = NULL, updated_at = NOW() WHERE id = $1 AND role = 'user' RETURNING id, deactivated_at"
        : "UPDATE users SET deactivated_at = COALESCE(deactivated_at, NOW()), deactivated_by = COALESCE(deactivated_by, $2), updated_at = NOW() WHERE id = $1 AND role = 'user' RETURNING id, deactivated_at",
      active ? [studentId] : [studentId, adminId ?? null]
    );
    if (!result.rowCount) throw statusError(404, "Étudiant introuvable.");
    if (!active) await revokeAllUserSessions(client, studentId);
    await client.query("COMMIT");
    return { active, deactivated_at: result.rows[0].deactivated_at };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function statusError(status, message) {
  return Object.assign(new Error(message), { status });
}
