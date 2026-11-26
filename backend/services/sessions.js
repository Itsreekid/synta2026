// =====================================================
// SESSION SERVICE
// Short-lived JWT access tokens plus opaque, rotating refresh tokens stored as SHA-256 hashes.
// =====================================================
import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const ACCESS_TTL_MS = HOUR_MS;
// Owner decision 2026-11-26: signed out after 30 days without a visit, and at most 90 days after signing in.
export const REFRESH_IDLE_MS = 30 * DAY_MS;
export const SESSION_MAX_MS = 90 * DAY_MS;
// Parallel requests from several tabs may present the same token right after it rotates.
export const ROTATION_GRACE_MS = 20 * 1000;

const jwtSecret = () => process.env.JWT_SECRET;
const isProd = () => process.env.NODE_ENV === "production";

// Deployment diagnostic only. Never creates or alters authentication tables.
export async function sessionRenewalReady(db) {
  const result = await db.query("SELECT to_regclass('refresh_tokens') IS NOT NULL AS ready");
  return result.rows[0]?.ready === true;
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role || "user" },
    jwtSecret(),
    { algorithm: "HS256", expiresIn: ACCESS_TTL_MS / 1000 }
  );
}

function cookieBase() {
  // Lax keeps students signed in when they open a Synta link from WhatsApp or email; cross-site POSTs still carry no cookie.
  return { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/" };
}

export function setAccessCookie(res, accessToken) {
  res.cookie("synta_access", accessToken, { ...cookieBase(), maxAge: ACCESS_TTL_MS });
}

function setRefreshCookie(res, refreshToken, expiresAt) {
  res.cookie("synta_refresh", refreshToken, { ...cookieBase(), maxAge: Math.max(0, expiresAt.getTime() - Date.now()) });
}

export function clearSessionCookies(res) {
  res.clearCookie("synta_access", { path: "/" });
  res.clearCookie("synta_refresh", { path: "/" });
}

async function insertRefreshToken(db, userId, familyId, familyExpiresAt) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Math.min(Date.now() + REFRESH_IDLE_MS, familyExpiresAt.getTime()));
  await db.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, family_expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, familyId, hashToken(token), expiresAt, familyExpiresAt]
  );
  return { token, expiresAt };
}

async function revokeFamily(db, familyId) {
  await db.query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL",
    [familyId]
  );
}

/**
 * Start a new session family for a user who just proved their identity.
 * Pass renewable=false for sessions that must end with their access token (admin "log in as").
 */
export async function startSession(pool, res, user, { renewable = true, previousRefreshToken } = {}) {
  setAccessCookie(res, signAccessToken(user));
  if (!renewable) {
    res.clearCookie("synta_refresh", { path: "/" });
    if (previousRefreshToken) await revokeRefreshToken(pool, previousRefreshToken).catch(() => {});
    return;
  }
  if (previousRefreshToken) await revokeRefreshToken(pool, previousRefreshToken).catch(() => {});
  await pool.query(
    `DELETE FROM refresh_tokens
     WHERE user_id = $1 AND (family_expires_at < NOW() OR expires_at < NOW() - INTERVAL '1 day')`,
    [user.id]
  ).catch(() => {});
  try {
    const { token, expiresAt } = await insertRefreshToken(pool, user.id, randomUUID(), new Date(Date.now() + SESSION_MAX_MS));
    setRefreshCookie(res, token, expiresAt);
  } catch (err) {
    // Without a stored refresh token the student still gets a normal one-hour session.
    console.error("[sessions] Could not store the refresh token:", err.code || err.message);
    res.clearCookie("synta_refresh", { path: "/" });
  }
}

async function loadUser(db, userId) {
  // to_jsonb keeps this working before the deactivation migration adds the column.
  const result = await db.query(
    "SELECT id, email, name, role, to_jsonb(users)->>'deactivated_at' AS deactivated_at FROM users WHERE id = $1",
    [userId]
  );
  const user = result.rows[0];
  // A deactivated account renews nothing: its refresh family is revoked like a deleted user's.
  if (!user || user.deactivated_at) return null;
  const { deactivated_at, ...active } = user;
  return active;
}

function verifyLegacyRefreshToken(token) {
  try {
    const payload = jwt.verify(token, jwtSecret(), { algorithms: ["HS256"] });
    return payload?.type === "refresh" && payload.id ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Exchange a refresh token for a new access token (and, normally, a new refresh token).
 * Returns { user, accessToken, refresh?: { token, expiresAt } } or null when renewal is refused.
 */
export async function rotateRefreshToken(pool, presented) {
  if (typeof presented !== "string" || !presented || presented.length > 2048) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tokenHash = hashToken(presented);
    const found = await client.query(
      `SELECT id, user_id, family_id, expires_at, family_expires_at, used_at, revoked_at
       FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash]
    );
    const row = found.rows[0];
    let outcome = null;

    if (!row) {
      // Pre-rotation tokens were stateless JWTs. Accept a valid one once by recording it as used in a new family.
      const legacy = presented.includes(".") ? verifyLegacyRefreshToken(presented) : null;
      const user = legacy && await loadUser(client, legacy.id);
      if (user) {
        const familyId = randomUUID();
        const familyExpiresAt = new Date(Date.now() + SESSION_MAX_MS);
        const converted = await client.query(
          `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, family_expires_at, used_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (token_hash) DO NOTHING
           RETURNING id`,
          [user.id, familyId, tokenHash, new Date(Math.min(legacy.exp * 1000, familyExpiresAt.getTime())), familyExpiresAt]
        );
        outcome = converted.rows.length
          ? { user, accessToken: signAccessToken(user), refresh: await insertRefreshToken(client, user.id, familyId, familyExpiresAt) }
          // A concurrent request converted it a moment ago; later replays find the used row and revoke the family.
          : { user, accessToken: signAccessToken(user) };
      }
    } else if (!row.revoked_at && new Date(row.expires_at) > new Date() && new Date(row.family_expires_at) > new Date()) {
      const user = await loadUser(client, row.user_id);
      if (!user) {
        await revokeFamily(client, row.family_id);
      } else if (!row.used_at) {
        await client.query("UPDATE refresh_tokens SET used_at = NOW() WHERE id = $1", [row.id]);
        outcome = { user, accessToken: signAccessToken(user), refresh: await insertRefreshToken(client, user.id, row.family_id, new Date(row.family_expires_at)) };
      } else if (Date.now() - new Date(row.used_at).getTime() <= ROTATION_GRACE_MS) {
        // A concurrent request already rotated this token; its response carries the new refresh cookie.
        outcome = { user, accessToken: signAccessToken(user) };
      } else {
        // An old token came back after rotation: treat the family as stolen and end every session in it.
        await revokeFamily(client, row.family_id);
        console.warn("[sessions] Refresh token reuse detected; session family revoked.");
      }
    }

    await client.query("COMMIT");
    return outcome;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Revoke the whole family of a refresh token (logout). Unknown tokens are ignored.
 */
export async function revokeRefreshToken(pool, presented) {
  if (typeof presented !== "string" || !presented || presented.length > 2048) return;
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE revoked_at IS NULL
       AND family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
    [hashToken(presented)]
  );
}

/**
 * End every renewable session of a user (password change: "log out everywhere").
 * Access tokens already issued expire within ACCESS_TTL_MS. Returns false when the
 * refresh-token table is not deployed yet (nothing to revoke then).
 */
export async function revokeAllUserSessions(db, userId) {
  // Checked first (not caught) so this is safe inside a caller's transaction.
  if (!(await sessionRenewalReady(db))) return false;
  await db.query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId]
  );
  return true;
}

/**
 * Apply a successful rotation to the response cookies.
 */
export function applyRotation(res, outcome) {
  setAccessCookie(res, outcome.accessToken);
  if (outcome.refresh) setRefreshCookie(res, outcome.refresh.token, outcome.refresh.expiresAt);
}
