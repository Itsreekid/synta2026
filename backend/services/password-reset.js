// =====================================================
// PASSWORD RESET TOKENS
// Stateless, single-use reset links without a schema change:
// - signed with a key derived from JWT_SECRET, so a reset token can never verify as a session;
// - bound to a fingerprint of the current password hash and email, so the link stops working
//   as soon as the password (or email) changes — which also makes it single-use;
// - valid for one hour.
// =====================================================
import { createHash, createHmac } from "node:crypto";
import jwt from "jsonwebtoken";

export const RESET_TTL_SECONDS = 60 * 60;
const PURPOSE = "password_reset";

function resetKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return createHmac("sha256", secret).update("synta-password-reset-v1").digest();
}

/** Fingerprint of the credential state the link was issued for. Never reveals the hash. */
export function credentialFingerprint(user) {
  return createHash("sha256")
    .update(`${user.id}\n${String(user.email || "").toLowerCase()}\n${user.password_hash || "no-password"}`)
    .digest("base64url")
    .slice(0, 32);
}

export function createResetToken(user) {
  return jwt.sign(
    { sub: String(user.id), purpose: PURPOSE, fp: credentialFingerprint(user) },
    resetKey(),
    { algorithm: "HS256", expiresIn: RESET_TTL_SECONDS }
  );
}

/** Returns { userId, fingerprint } for a well-formed, unexpired token, otherwise null. */
export function readResetToken(token) {
  if (typeof token !== "string" || !token || token.length > 1024) return null;
  try {
    const payload = jwt.verify(token, resetKey(), { algorithms: ["HS256"] });
    if (payload?.purpose !== PURPOSE || typeof payload.sub !== "string" || typeof payload.fp !== "string") return null;
    return { userId: payload.sub, fingerprint: payload.fp };
  } catch {
    return null;
  }
}

/** True when the token still matches the user's current credentials. */
export function resetTokenMatches(claims, user) {
  return Boolean(claims && user && String(user.id) === claims.userId && credentialFingerprint(user) === claims.fingerprint);
}
