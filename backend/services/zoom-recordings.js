// =====================================================
// ZOOM CLOUD RECORDING → PRIVATE R2 REPLAYS
// The webhook only queues work. A background worker streams each MP4 from
// Zoom into an R2 multipart upload, verifies the stored object, then either
// publishes it as the session replay or leaves it for admin review.
// Zoom recordings are never deleted.
// =====================================================
import crypto from "node:crypto";

export const PART_SIZE = 16 * 1024 * 1024;
export const MAX_ATTEMPTS = 6;
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];
const LOCK_MS = 15 * 60_000;
const STALL_MS = 2 * 60_000;
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

class ImportError extends Error {
  constructor(message, { permanent = false } = {}) {
    super(message);
    this.permanent = permanent;
  }
}

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

const safeKeyPart = value => String(value).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);

export function recordingObjectKey(sessionId, fileId) {
  return `live-replays/${sessionId || "unassigned"}/zoom-${safeKeyPart(fileId)}.mp4`;
}

/**
 * Queue every segment of a recording.completed event. Duplicate deliveries
 * are ignored by the unique Zoom file id. Meetings unknown to Synta are ignored.
 */
export async function queueRecordingEvent(pool, payload) {
  const meeting = payload?.object;
  const meetingId = meeting?.id == null ? "" : String(meeting.id);
  const segments = selectRecordingSegments(meeting?.recording_files);
  if (!meetingId || !meeting?.uuid || !segments.length) return { queued: 0, ignored: true };

  const { rows: sessions } = await pool.query(
    `SELECT id, scheduled_at, duration_minutes FROM live_sessions
     WHERE zoom_meeting_id = $1 AND status <> 'cancelled'`,
    [meetingId]
  );
  if (!sessions.length) return { queued: 0, ignored: true };

  const startedAt = Date.parse(meeting.start_time);
  const match = matchSession(sessions, Number.isFinite(startedAt) ? startedAt : Date.parse(segments[0].recording_start));
  let queued = 0;
  for (const file of segments) {
    const result = await pool.query(
      `INSERT INTO zoom_recording_imports
         (zoom_meeting_id, zoom_meeting_uuid, zoom_file_id, recording_type, recording_start, recording_end,
          file_size, download_url, live_session_id, review_reason, object_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (zoom_file_id) DO NOTHING`,
      [
        meetingId, String(meeting.uuid), String(file.id), file.recording_type || null,
        file.recording_start, file.recording_end || null,
        Number(file.file_size) > 0 ? Number(file.file_size) : null,
        file.download_url, match.sessionId, match.reason,
        recordingObjectKey(match.sessionId, file.id),
      ]
    );
    queued += result.rowCount;
  }
  return { queued, sessionId: match.sessionId, reason: match.reason };
}

// ---------- Background worker ----------

async function claimNextJob(pool) {
  const { rows } = await pool.query(
    `UPDATE zoom_recording_imports
     SET status = 'importing', attempts = attempts + 1, locked_until = NOW() + $1 * INTERVAL '1 millisecond',
         updated_at = NOW()
     WHERE id = (
       SELECT id FROM zoom_recording_imports
       WHERE (status = 'pending' AND next_attempt_at <= NOW())
          OR (status = 'importing' AND locked_until < NOW())
       ORDER BY next_attempt_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`,
    [LOCK_MS]
  );
  return rows[0] || null;
}

async function heartbeat(pool, jobId, bytes) {
  const result = await pool.query(
    `UPDATE zoom_recording_imports
     SET locked_until = NOW() + $2 * INTERVAL '1 millisecond', bytes_transferred = $3, updated_at = NOW()
     WHERE id = $1 AND status = 'importing'`,
    [jobId, LOCK_MS, bytes]
  );
  if (!result.rowCount) throw new ImportError("Import was cancelled", { permanent: true });
}

async function transfer(pool, job, { zoom, storage }) {
  const key = job.object_key || recordingObjectKey(job.live_session_id, job.zoom_file_id);
  if (job.multipart_upload_id) {
    await storage.abortMultipart(key, job.multipart_upload_id).catch(() => {});
  }
  const uploadId = await storage.createMultipart(key, "video/mp4");
  await pool.query(
    `UPDATE zoom_recording_imports SET object_key = $2, multipart_upload_id = $3, bytes_transferred = 0, updated_at = NOW()
     WHERE id = $1`,
    [job.id, key, uploadId]
  );

  const controller = new AbortController();
  let stallTimer;
  const resetStall = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), STALL_MS);
  };
  try {
    resetStall();
    const response = await zoom.download(job.download_url, controller.signal);
    if (!response.ok || !response.body) {
      await response.body?.cancel?.().catch(() => {});
      const permanent = response.status === 404 || response.status === 410;
      throw new ImportError(`Zoom download failed (${response.status})`, { permanent });
    }

    const parts = [];
    let buffered = [];
    let bufferedBytes = 0;
    let total = 0;
    const flush = async (chunk) => {
      const partNumber = parts.length + 1;
      const etag = await storage.uploadPart(key, uploadId, partNumber, chunk);
      parts.push({ ETag: etag, PartNumber: partNumber });
      await heartbeat(pool, job.id, total);
    };
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      resetStall();
      const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      total += chunk.length;
      buffered.push(chunk);
      bufferedBytes += chunk.length;
      while (bufferedBytes >= PART_SIZE) {
        const joined = Buffer.concat(buffered, bufferedBytes);
        const rest = joined.subarray(PART_SIZE);
        buffered = rest.length ? [rest] : [];
        bufferedBytes = rest.length;
        await flush(joined.subarray(0, PART_SIZE));
        resetStall();
      }
    }
    if (bufferedBytes > 0) await flush(Buffer.concat(buffered, bufferedBytes));
    if (!total) throw new ImportError("Zoom returned an empty recording");
    if (job.file_size && Number(job.file_size) !== total) {
      throw new ImportError(`Size mismatch (expected ${job.file_size}, received ${total})`);
    }

    await storage.completeMultipart(key, uploadId, parts);
    const stored = await storage.head(key);
    if (Number(stored?.ContentLength) !== total) throw new ImportError("Stored object size does not match the download");
    await pool.query(
      `UPDATE zoom_recording_imports SET multipart_upload_id = NULL, bytes_transferred = $2, updated_at = NOW() WHERE id = $1`,
      [job.id, total]
    );
    return key;
  } catch (error) {
    await storage.abortMultipart(key, uploadId).catch(() => {});
    await pool.query(
      `UPDATE zoom_recording_imports SET multipart_upload_id = NULL WHERE id = $1 AND multipart_upload_id = $2`,
      [job.id, uploadId]
    ).catch(() => {});
    if (controller.signal.aborted && !(error instanceof ImportError)) throw new ImportError("Zoom download stalled");
    throw error;
  } finally {
    clearTimeout(stallTimer);
  }
}

/** Publish automatically only for one segment, a matched session and no existing replay. */
async function settle(pool, job, key) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let reason = job.review_reason;
    let session = null;
    if (job.live_session_id) {
      ({ rows: [session] } = await client.query(
        "SELECT id, replay_url FROM live_sessions WHERE id = $1 FOR UPDATE", [job.live_session_id]));
    }
    if (!reason && !session) reason = "no_matching_session";
    if (!reason) {
      const { rows: [{ segments }] } = await client.query(
        `SELECT COUNT(*)::int AS segments FROM zoom_recording_imports
         WHERE zoom_meeting_uuid = $1 AND status <> 'discarded'`,
        [job.zoom_meeting_uuid]
      );
      if (segments > 1) reason = "multiple_segments";
      else if (session.replay_url) reason = "replay_exists";
    }
    if (reason) {
      await client.query(
        `UPDATE zoom_recording_imports
         SET status = 'needs_review', review_reason = $2, locked_until = NULL, last_error = NULL, updated_at = NOW()
         WHERE id = $1`,
        [job.id, reason]
      );
    } else {
      await client.query("UPDATE live_sessions SET replay_url = $2 WHERE id = $1", [session.id, key]);
      await client.query(
        `UPDATE zoom_recording_imports
         SET status = 'published', review_reason = NULL, locked_until = NULL, last_error = NULL, updated_at = NOW()
         WHERE id = $1`,
        [job.id]
      );
    }
    await client.query("COMMIT");
    return reason ? "needs_review" : "published";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function describeError(error) {
  if (error instanceof ImportError) return error.message.slice(0, 300);
  return String(error?.name || "Error").slice(0, 100);
}

async function recordFailure(pool, job, error) {
  const permanent = error instanceof ImportError && error.permanent;
  const giveUp = permanent || job.attempts >= MAX_ATTEMPTS;
  const delay = RETRY_DELAYS_MS[Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)];
  await pool.query(
    `UPDATE zoom_recording_imports
     SET status = $2, last_error = $3, locked_until = NULL,
         next_attempt_at = NOW() + $4 * INTERVAL '1 millisecond', updated_at = NOW()
     WHERE id = $1 AND status = 'importing'`,
    [job.id, giveUp ? "failed" : "pending", describeError(error), giveUp ? 0 : delay]
  );
  return giveUp ? "failed" : "pending";
}

export async function processNextRecording(pool, deps) {
  const job = await claimNextJob(pool);
  if (!job) return null;
  try {
    const key = await transfer(pool, job, deps);
    return { id: job.id, status: await settle(pool, job, key) };
  } catch (error) {
    console.error("[Recordings] Import attempt failed:", describeError(error));
    return { id: job.id, status: await recordFailure(pool, job, error) };
  }
}

export function createRecordingWorker(pool, deps, { intervalMs = 30_000 } = {}) {
  let running = false;
  let timer = null;
  const drain = async () => {
    if (running) return;
    running = true;
    try {
      while (await processNextRecording(pool, deps));
    } catch (error) {
      console.error("[Recordings] Worker error:", error.code ?? error.name);
    } finally {
      running = false;
    }
  };
  return {
    kick: () => { drain(); },
    start() {
      if (timer) return;
      timer = setInterval(drain, intervalMs);
      timer.unref?.();
      drain();
    },
    stop() { clearInterval(timer); timer = null; },
    drain,
  };
}
