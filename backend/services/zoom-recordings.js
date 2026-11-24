// =====================================================
// ZOOM CLOUD RECORDING → PRIVATE R2 REPLAYS
// The webhook only queues work. A background worker streams each MP4 from
// Zoom into an R2 multipart upload, verifies the stored object, then either
// leaves it for explicit admin review and publication.
// Zoom recordings are never deleted.
// =====================================================
import crypto from "node:crypto";

export const PART_SIZE = 16 * 1024 * 1024;
export const MAX_ATTEMPTS = 6;
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];
const MATCH_MARGIN_MS = 60 * 60_000;
const SIGNATURE_MAX_AGE_S = 300;

const VIEW_PREFERENCE = [
  "shared_screen_with_speaker_view",
  "shared_screen_with_speaker_view(CC)",
  "shared_screen_with_gallery_view",
  "speaker_view",
  "active_speaker",
  "gallery_view",
  "shared_screen",
];


// ---------- Webhook verification ----------

const hmac = (secret, value) => crypto.createHmac("sha256", secret).update(value).digest("hex");

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function verifyZoomSignature(secret, timestamp, rawBody, signature, nowMs = Date.now()) {
  if (!secret || !timestamp || !signature || !/^\d+$/.test(String(timestamp))) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > SIGNATURE_MAX_AGE_S) return false;
  return safeEqual(signature, "v0=" + hmac(secret, `v0:${timestamp}:${rawBody}`));
}

// Signed messages always contain ':' so a validation token can never be used to forge one.
export function urlValidationResponse(secret, plainToken) {
  if (typeof plainToken !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(plainToken)) return null;
  return { plainToken, encryptedToken: hmac(secret, plainToken) };
}

// ---------- Recording selection and session matching ----------

/** One MP4 per recording segment (Zoom creates a segment each time recording restarts). */
export function selectRecordingSegments(files) {
  const segments = new Map();
  for (const file of Array.isArray(files) ? files : []) {
    if (String(file?.file_type).toUpperCase() !== "MP4" || !file.id || !file.download_url) continue;
    if (file.status && file.status !== "completed") continue;
    const start = Date.parse(file.recording_start);
    if (!Number.isFinite(start)) continue;
    const rank = VIEW_PREFERENCE.indexOf(file.recording_type);
    const score = rank === -1 ? VIEW_PREFERENCE.length : rank;
    const current = segments.get(start);
    if (!current || score < current.score) segments.set(start, { file, score });
  }
  return [...segments.entries()].sort(([a], [b]) => a - b).map(([, { file }]) => file);
}

export function matchSession(sessions, startedAtMs) {
  const candidates = sessions
    .map(session => {
      const start = new Date(session.scheduled_at).getTime();
      const end = start + Number(session.duration_minutes || 60) * 60_000;
      return { session, start, end, distance: Math.abs(startedAtMs - start) };
    })
    .filter(({ start, end }) => startedAtMs >= start - MATCH_MARGIN_MS && startedAtMs <= end + MATCH_MARGIN_MS)
    .sort((a, b) => a.distance - b.distance);
  if (!candidates.length) return { sessionId: null, reason: "no_matching_session" };
  if (candidates.length > 1 && candidates[1].distance - candidates[0].distance < 60_000) {
    return { sessionId: null, reason: "ambiguous_session" };
  }
  return { sessionId: candidates[0].session.id, reason: null };
}

export function recordingObjectKey(sessionId, fileId) {
  return `live-replays/${sessionId || "unassigned"}/zoom-${crypto.createHash('sha256').update(String(fileId)).digest('hex')}.mp4`;
}

export { queueRecordingEvent, processNextRecording, createRecordingWorker } from './recording-jobs.js';
