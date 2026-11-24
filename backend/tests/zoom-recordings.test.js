import assert from "node:assert/strict";
import crypto, { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import express from "express";
import pg from "pg";
import {
  PART_SIZE, matchSession, processNextRecording, queueRecordingEvent, recordingObjectKey,
  selectRecordingSegments, urlValidationResponse, verifyZoomSignature,
} from "../services/zoom-recordings.js";
import { liveSessionAccess, setExtendedLiveAccess } from "../utils/offerAccess.js";

const SECRET = "synthetic-webhook-secret";
const sign = (body, timestamp = Math.floor(Date.now() / 1000)) => ({
  timestamp: String(timestamp),
  signature: "v0=" + crypto.createHmac("sha256", SECRET).update(`v0:${timestamp}:${body}`).digest("hex"),
});

test("Zoom webhook signatures are verified with the raw body, secret and a fresh timestamp", () => {
  const body = JSON.stringify({ event: "recording.completed" });
  const { timestamp, signature } = sign(body);
  assert.equal(verifyZoomSignature(SECRET, timestamp, body, signature), true);
  assert.equal(verifyZoomSignature(SECRET, timestamp, body + " ", signature), false);
  assert.equal(verifyZoomSignature("other-secret", timestamp, body, signature), false);
  assert.equal(verifyZoomSignature(SECRET, timestamp, body, "v0=00"), false);
  const stale = sign(body, Math.floor(Date.now() / 1000) - 600);
  assert.equal(verifyZoomSignature(SECRET, stale.timestamp, body, stale.signature), false);
  assert.equal(verifyZoomSignature(SECRET, undefined, body, signature), false);
});

test("URL validation answers Zoom's challenge but never signs text that could forge a webhook", () => {
  const answer = urlValidationResponse(SECRET, "qgg8vlvZRS6UYooatFL8Aw");
  assert.equal(answer.encryptedToken, crypto.createHmac("sha256", SECRET).update("qgg8vlvZRS6UYooatFL8Aw").digest("hex"));
  assert.equal(urlValidationResponse(SECRET, "v0:1700000000:{}"), null);
  assert.equal(urlValidationResponse(SECRET, ""), null);
  assert.equal(urlValidationResponse(SECRET, { token: 1 }), null);
});

test("one MP4 per recording segment, preferring screen share with speaker view", () => {
  const file = (id, start, type, extra = {}) => ({
    id, recording_start: start, recording_type: type, file_type: "MP4", status: "completed",
    download_url: `https://zoom.us/rec/download/${id}`, ...extra,
  });
  const segments = selectRecordingSegments([
    file("gallery-1", "2030-01-01T18:00:00Z", "gallery_view"),
    file("share-1", "2030-01-01T18:00:00Z", "shared_screen_with_speaker_view"),
    file("audio-1", "2030-01-01T18:00:00Z", "audio_only", { file_type: "M4A" }),
    file("speaker-2", "2030-01-01T18:20:00Z", "speaker_view"),
    file("processing-3", "2030-01-01T18:40:00Z", "speaker_view", { status: "processing" }),
    file("chat", "2030-01-01T18:00:00Z", "chat_file", { file_type: "CHAT" }),
  ]);
  assert.deepEqual(segments.map(segment => segment.id), ["share-1", "speaker-2"]);
  assert.deepEqual(selectRecordingSegments(null), []);
});

test("recordings match the closest occurrence of a recurring meeting, or go to review", () => {
  const sessions = [
    { id: "week-1", scheduled_at: "2030-01-01T18:00:00Z", duration_minutes: 90 },
    { id: "week-2", scheduled_at: "2030-01-08T18:00:00Z", duration_minutes: 90 },
  ];
  assert.deepEqual(matchSession(sessions, Date.parse("2030-01-08T18:07:00Z")), { sessionId: "week-2", reason: null });
  assert.deepEqual(matchSession(sessions, Date.parse("2030-01-08T20:10:00Z")), { sessionId: "week-2", reason: null });
  assert.equal(matchSession(sessions, Date.parse("2030-01-04T18:00:00Z")).reason, "no_matching_session");
  const twins = [...sessions, { id: "twin", scheduled_at: "2030-01-08T18:00:00Z", duration_minutes: 60 }];
  assert.equal(matchSession(twins, Date.parse("2030-01-08T18:05:00Z")).reason, "ambiguous_session");
  assert.notEqual(recordingObjectKey(null,"a/b"),recordingObjectKey(null,"a_b"));
});

test("pre-migration live access SQL is unchanged and never references the new columns", () => {
  setExtendedLiveAccess(false);
  const legacy = liveSessionAccess("$1");
  assert.doesNotMatch(legacy, /granted_student_ids|additional_offer_ids/);
  setExtendedLiveAccess(true);
  const extended = liveSessionAccess("$1");
  assert.match(extended, /granted_student_ids/);
  assert.match(extended, /additional_offer_ids/);
  setExtendedLiveAccess(false);
});

// ---------- Disposable PostgreSQL ----------

function fakeStorage() {
  const uploads = new Map();
  const objects = new Map();
  const aborted = [];
  let failNextPart = false;
  let nextId = 0;
  return {
    objects, aborted, uploads,
    failOnce() { failNextPart = true; },
    async createMultipart(key) {
      const id = `upload-${++nextId}`;
      uploads.set(id, { key, parts: new Map() });
      return id;
    },
    async uploadPart(key, uploadId, partNumber, body) {
      if (failNextPart) { failNextPart = false; throw Object.assign(new Error("synthetic R2 outage"), { name: "ServiceUnavailable" }); }
      uploads.get(uploadId).parts.set(partNumber, Buffer.from(body));
      return `etag-${partNumber}`;
    },
    async completeMultipart(key, uploadId, parts) {
      const upload = uploads.get(uploadId);
      objects.set(key, Buffer.concat(parts.map(part => upload.parts.get(part.PartNumber))));
      uploads.delete(uploadId);
    },
    async abortMultipart(key, uploadId) { aborted.push(uploadId); uploads.delete(uploadId); },
    async head(key) { return { ContentLength: objects.get(key)?.length }; },
    async delete(key) { objects.delete(key); },
  };
}

function fakeZoom(files) {
  return {
    calls: 0,
    async download(url) {
      this.calls++;
      const data = files.get(url);
      if (!data) return new Response(null, { status: 404 });
      let offset = 0;
      return new Response(new ReadableStream({
        pull(controller) {
          if (offset >= data.length) return controller.close();
          const size = 1024 * 1024 + 7;
          controller.enqueue(new Uint8Array(data.subarray(offset, offset + size)));
          offset += size;
        },
      }), { status: 200 });
    },
  };
}

test("live access and Zoom recording imports on disposable PostgreSQL", { skip: !process.env.BUGI_QA_POSTGRES_PORT, timeout: 120000 }, async t => {
  const connection = { host: "127.0.0.1", port: Number(process.env.BUGI_QA_POSTGRES_PORT),
    user: "bugi_qa", password: "bugi-synthetic-local-only", ssl: false, connectionTimeoutMillis: 5000 };
  const name = "zoom_qa_" + randomUUID().replaceAll("-", "");
  const maintenance = new pg.Pool({ ...connection, database: "postgres" });
  let db;
  try {
    await maintenance.query(`CREATE DATABASE "${name}"`);
    db = new pg.Pool({ ...connection, database: name });
    await db.query(await readFile(new URL("../../database/schema_postgres.sql", import.meta.url), "utf8"));
    const databaseUrl = `postgresql://${connection.user}:${connection.password}@127.0.0.1:${connection.port}/${name}`;
    await promisify(execFile)(process.execPath, [fileURLToPath(new URL("../scripts/migrate.js", import.meta.url))], {
      env: { ...process.env, DATABASE_URL: databaseUrl, DB_SSL: "false" }, timeout: 30000,
    });
    for (const file of ["202611200002_extend_live_session_access.sql", "202611200003_create_zoom_recording_imports.sql", "202611240001_zoom_recording_reliability.sql", "202611240002_recording_trash_retention.sql"]) {
      const sql = await readFile(new URL(`../../database/${file==='202611200002_extend_live_session_access.sql'?'pending-migrations':'migrations'}/${file}`, import.meta.url), "utf8");
      await db.query(sql);
      await db.query(sql);
    }

    const user = async label => (await db.query(
      "INSERT INTO users(email,password_hash,name,role) VALUES($1,'synthetic',$2,'user') RETURNING id",
      [label + "@example.invalid", label])).rows[0].id;
    const course = async title => (await db.query("INSERT INTO courses(title) VALUES($1) RETURNING id", [title])).rows[0].id;
    const offer = async (title, courseId) => {
      const id = (await db.query("INSERT INTO offers(title,fixed_price) VALUES($1,10) RETURNING id", [title])).rows[0].id;
      await db.query("INSERT INTO offer_courses(offer_id,course_id) VALUES($1,$2)", [id, courseId]);
      return id;
    };
    const buy = async (userId, offerId, courseId, expiresAt = null) => {
      await db.query("INSERT INTO payments(user_id,amount,status,offer_id) VALUES($1,10,'wallet_completed',$2)", [userId, offerId]);
      await db.query("INSERT INTO enrollments(user_id,course_id,offer_id,expires_at) VALUES($1,$2,$3,$4)", [userId, courseId, offerId, expiresAt]);
    };
    const courseX = await course("Algorithmique");
    const courseY = await course("Bases de données");
    const offerX = await offer("Offre algo", courseX);
    const offerY = await offer("Offre BD", courseY);
    const buyerX = await user("buyer-x");
    const buyerY = await user("buyer-y");
    const nobody = await user("nobody");
    const expired = await user("expired-x");
    const guest = await user("guest");
    const otherX = await user("other-x");
    await buy(buyerX, offerX, courseX);
    await buy(buyerY, offerY, courseY);
    await buy(expired, offerX, courseX, "2020-01-01");
    await buy(otherX, offerX, courseX);

    const session = async (fields = {}) => (await db.query(
      `INSERT INTO live_sessions(course_id, offer_id, title, scheduled_at, duration_minutes, zoom_meeting_id, zoom_join_url,
         audience_student_ids, additional_offer_ids, granted_student_ids, replay_url, status)
       VALUES($1,$2,$3,$4,$5,$6,'https://zoom.us/j/synthetic',$7,$8,$9,$10,COALESCE($11,'scheduled')) RETURNING id`,
      [fields.course ?? courseX, fields.offer ?? null, fields.title ?? "Séance", fields.at ?? new Date(Date.now() + 3600_000),
        fields.duration ?? 90, fields.meeting ?? null, fields.audience ?? null, fields.additional ?? null,
        fields.granted ?? null, fields.replay ?? null, fields.status ?? null])).rows[0].id;
    const canSee = async (sessionId, userId) => (await db.query(
      `SELECT ${liveSessionAccess("$2")} AS allowed FROM live_sessions ls WHERE ls.id = $1`, [sessionId, userId])).rows[0].allowed;

    await t.test("offer, extra offers, individual grants, expiry and legacy audience", async () => {
      const single = await session({ offer: offerX });
      const multi = await session({ offer: offerX, additional: [offerY] });
      const courseWideWithGuest = await session({ granted: [guest] });
      const legacyAudience = await session({ offer: offerX, audience: [buyerX] });
      const cancelled = await session({ offer: offerX, status: "cancelled", granted: [guest] });
      const matrix = {
        [single]: { buyerX: true, buyerY: false, nobody: false, expired: false, guest: false },
        [multi]: { buyerX: true, buyerY: true, nobody: false, expired: false, guest: false },
        [courseWideWithGuest]: { buyerX: true, buyerY: false, nobody: false, expired: false, guest: true },
        [legacyAudience]: { buyerX: true, otherX: false, buyerY: false },
        [cancelled]: { buyerX: false, guest: false },
      };
      const users = { buyerX, buyerY, nobody, expired, guest, otherX };
      setExtendedLiveAccess(true);
      for (const [sessionId, expected] of Object.entries(matrix)) {
        for (const [label, allowed] of Object.entries(expected)) {
          assert.equal(await canSee(sessionId, users[label]), allowed, `${label} on ${sessionId}`);
        }
      }
      setExtendedLiveAccess(false);
      assert.equal(await canSee(multi, buyerY), false, "pre-migration rule ignores extra offers");
      assert.equal(await canSee(courseWideWithGuest, guest), false, "pre-migration rule ignores grants");
      assert.equal(await canSee(single, buyerX), true);
      await db.query("UPDATE offers SET is_active = false WHERE id = $1", [offerY]);
      setExtendedLiveAccess(true);
      assert.equal(await canSee(multi, buyerY), true, "deactivating an offer keeps existing buyers");
      await db.query("UPDATE payments SET status = 'refunded' WHERE user_id = $1", [buyerY]);
      assert.equal(await canSee(multi, buyerY), false, "a refunded purchase loses access");
      await assert.rejects(db.query("UPDATE live_sessions SET additional_offer_ids = $2 WHERE id = $1", [courseWideWithGuest, [offerY]]),
        /live_sessions_additional_offers_nonempty/);
    });

    const files = new Map();
    const storage = fakeStorage();
    const zoom = fakeZoom(files);
    const deps = { zoom, storage };
    const recording = (meeting, uuid, start, segments) => ({
      object: {
        id: Number(meeting), uuid, start_time: start,
        recording_files: segments.map(segment => ({
          id: segment.id, file_type: "MP4", status: "completed", recording_type: "shared_screen_with_speaker_view",
          recording_start: segment.start, recording_end: segment.end, file_size: segment.declared ?? segment.data.length,
          download_url: `https://zoom.us/rec/download/${segment.id}`,
        })),
      },
    });
    const addFile = (id, bytes) => {
      const data = crypto.randomBytes(bytes);
      files.set(`https://zoom.us/rec/download/${id}`, data);
      return data;
    };
    const imports = async meeting => (await db.query(
      "SELECT * FROM zoom_recording_imports WHERE zoom_meeting_id = $1 ORDER BY recording_start", [meeting])).rows;
    const replayOf = async id => (await db.query("SELECT replay_url FROM live_sessions WHERE id = $1", [id])).rows[0].replay_url;
    const drain = async () => { while (await processNextRecording(db, deps)); };

    await t.test("single segment: streamed in equal parts, verified, reviewed on the matching occurrence", async () => {
      const week1 = await session({ meeting: "9001", at: "2030-01-01T17:00:00Z" });
      const week2 = await session({ meeting: "9001", at: "2030-01-08T17:00:00Z" });
      const data = addFile("rec-9001-a", PART_SIZE * 2 + 5_000_000);
      const event = recording("9001", "uuid-9001-w2", "2030-01-08T17:04:00Z",
        [{ id: "rec-9001-a", start: "2030-01-08T17:05:00Z", end: "2030-01-08T18:30:00Z", data }]);
      assert.equal((await queueRecordingEvent(db, event)).queued, 1);
      assert.equal((await queueRecordingEvent(db, event)).queued, 0, "duplicate webhook delivery");
      assert.equal((await processNextRecording(db, deps)).status, "needs_review");
      const [row] = await imports("9001");
      assert.equal(row.live_session_id, week2);
      assert.equal(row.status, "needs_review");
      assert.equal(row.multipart_upload_id, null);
      assert.equal(Number(row.bytes_transferred), data.length);
      assert.equal(await replayOf(week2), null, "admin approval required even for one segment");
      assert.equal(await replayOf(week1), null);
      assert.ok(storage.objects.get(row.object_key).equals(data), "stored bytes equal the Zoom MP4");
      assert.equal(await processNextRecording(db, deps), null, "nothing left to import");
    });

    await t.test("unknown meetings are ignored; no session or two equal candidates go to review", async () => {
      assert.deepEqual(await queueRecordingEvent(db, recording("9999", "uuid-x", "2030-01-01T10:00:00Z",
        [{ id: "rec-unknown", start: "2030-01-01T10:00:00Z", data: Buffer.alloc(10) }])), { queued: 0, ignored: true });
      await session({ meeting: "9002", at: "2030-02-01T17:00:00Z" });
      await session({ meeting: "9002", at: "2030-02-01T17:00:00Z", title: "Doublon" });
      addFile("rec-9002", 2048);
      await queueRecordingEvent(db, recording("9002", "uuid-9002", "2030-02-01T17:01:00Z",
        [{ id: "rec-9002", start: "2030-02-01T17:01:00Z", data: files.get("https://zoom.us/rec/download/rec-9002") }]));
      await drain();
      const [row] = await imports("9002");
      assert.equal(row.status, "needs_review");
      assert.equal(row.review_reason, "ambiguous_session");
      assert.equal(row.live_session_id, null);
      assert.ok(row.object_key.startsWith("live-replays/unassigned/"));
      assert.ok(storage.objects.has(row.object_key), "stored for review, not published");
    });

    await t.test("several segments are all imported and wait for the admin's choice", async () => {
      const lesson = await session({ meeting: "9003", at: "2030-03-01T17:00:00Z" });
      const intro = addFile("rec-9003-intro", 3000);
      const main = addFile("rec-9003-main", 9000);
      await queueRecordingEvent(db, recording("9003", "uuid-9003", "2030-03-01T16:55:00Z", [
        { id: "rec-9003-intro", start: "2030-03-01T16:55:00Z", data: intro },
        { id: "rec-9003-main", start: "2030-03-01T17:10:00Z", data: main },
      ]));
      await drain();
      const rows = await imports("9003");
      assert.deepEqual(rows.map(row => [row.status, row.review_reason]), [["needs_review", "multiple_segments"], ["needs_review", "multiple_segments"]]);
      assert.equal(await replayOf(lesson), null);
    });

    await t.test("an existing manual replay is never overwritten", async () => {
      const manual = await session({ meeting: "9004", at: "2030-04-01T17:00:00Z", replay: "live-replays/manual/upload.mp4" });
      const data = addFile("rec-9004", 4096);
      await queueRecordingEvent(db, recording("9004", "uuid-9004", "2030-04-01T17:00:00Z", [{ id: "rec-9004", start: "2030-04-01T17:00:00Z", data }]));
      await drain();
      assert.equal((await imports("9004"))[0].review_reason, "admin_approval_required");
      assert.equal(await replayOf(manual), "live-replays/manual/upload.mp4");
    });

    await t.test("an R2 failure aborts the upload, keeps the replay unpublished and retries later", async () => {
      const target = await session({ meeting: "9005", at: "2030-05-01T17:00:00Z" });
      const data = addFile("rec-9005", PART_SIZE + 1000);
      await queueRecordingEvent(db, recording("9005", "uuid-9005", "2030-05-01T17:00:00Z", [{ id: "rec-9005", start: "2030-05-01T17:00:00Z", data }]));
      storage.failOnce();
      const abortedBefore = storage.aborted.length;
      assert.equal((await processNextRecording(db, deps)).status, "pending");
      let [row] = await imports("9005");
      assert.equal(row.attempts, 1);
      assert.equal(row.last_error, "ServiceUnavailable");
      assert.ok(new Date(row.next_attempt_at) > new Date(), "backs off before retrying");
      assert.equal(row.multipart_upload_id, null);
      assert.equal(storage.aborted.length, abortedBefore + 1, "failed multipart upload is aborted");
      assert.equal(await replayOf(target), null);
      assert.equal(await processNextRecording(db, deps), null, "not retried before its time");
      await db.query("UPDATE zoom_recording_imports SET next_attempt_at = NOW() WHERE id = $1", [row.id]);
      assert.equal((await processNextRecording(db, deps)).status, "needs_review");
      [row] = await imports("9005");
      assert.ok(storage.objects.get(row.object_key).equals(data));
    });

    await t.test("size mismatch and missing Zoom file fail safely", async () => {
      await session({ meeting: "9006", at: "2030-06-01T17:00:00Z" });
      const data = addFile("rec-9006", 1000);
      await queueRecordingEvent(db, recording("9006", "uuid-9006", "2030-06-01T17:00:00Z",
        [{ id: "rec-9006", start: "2030-06-01T17:00:00Z", data, declared: 2000 }]));
      assert.equal((await processNextRecording(db, deps)).status, "pending");
      assert.match((await imports("9006"))[0].last_error, /Size mismatch/);
      await session({ meeting: "9007", at: "2030-07-01T17:00:00Z" });
      await queueRecordingEvent(db, recording("9007", "uuid-9007", "2030-07-01T17:00:00Z",
        [{ id: "rec-9007-gone", start: "2030-07-01T17:00:00Z", data: Buffer.alloc(10) }]));
      assert.equal((await processNextRecording(db, deps)).status, "failed");
      assert.match((await imports("9007"))[0].last_error, /404/);
      await db.query("UPDATE zoom_recording_imports SET next_attempt_at = NOW() + INTERVAL '1 day' WHERE zoom_meeting_id = '9006'");
    });

    await t.test("an import interrupted by a restart is reclaimed, its stale upload aborted, then completed", async () => {
      const target = await session({ meeting: "9008", at: "2030-08-01T17:00:00Z" });
      const data = addFile("rec-9008", 5000);
      await queueRecordingEvent(db, recording("9008", "uuid-9008", "2030-08-01T17:00:00Z", [{ id: "rec-9008", start: "2030-08-01T17:00:00Z", data }]));
      await db.query(`UPDATE zoom_recording_imports SET status = 'importing', attempts = 1,
        locked_until = NOW() - INTERVAL '1 minute', multipart_upload_id = 'upload-before-restart' WHERE zoom_meeting_id = '9008'`);
      const [first, second] = await Promise.all([processNextRecording(db, deps), processNextRecording(db, deps)]);
      assert.deepEqual([first?.status, second?.status].filter(Boolean), ["needs_review"], "claimed exactly once");
      assert.ok((await imports("9008"))[0].object_key, "restart produced a stored review object");
      assert.equal(await replayOf(target), null);
    });

    await t.test("webhook route: signature, URL validation, disabled mode and duplicate deliveries", async st => {
      const previous = { ...process.env };
      st.after(() => { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); });
      for (const key of ["ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "R2_ACCESS_KEY", "R2_SECRET_KEY", "CLOUDFLARE_ACCOUNT_ID"]) delete process.env[key];
      Object.assign(process.env, { DATABASE_URL: databaseUrl, DB_SSL: "false", ZOOM_WEBHOOK_SECRET_TOKEN: SECRET });
      const { default: router } = await import("../routes/zoom-webhook.js");
      const { liveFeatures, detectLiveFeatures } = await import("../services/live-features.js");
      const { recordingWorker } = await import("../services/recording-worker.js");
      const { default: appPool } = await import("../config/db.js");
      st.after(() => appPool.end());
      recordingWorker.kick = () => {};
      await detectLiveFeatures(appPool);
      assert.deepEqual({ ...liveFeatures }, { extendedAccess: true, recordingsTable: true, multiAudience: false });
      const app = express();
      app.use(router);
      const server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      st.after(() => server.close());
      const post = (body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/zoom/webhook`, {
        method: "POST", headers: { "content-type": "application/json", ...headers }, body,
      });
      const signedPost = body => { const { timestamp, signature } = sign(body); return post(body, { "x-zm-request-timestamp": timestamp, "x-zm-signature": signature }); };

      const challenge = JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: "abcDEF123" } });
      const answer = await (await signedPost(challenge)).json();
      assert.equal(answer.encryptedToken, crypto.createHmac("sha256", SECRET).update("abcDEF123").digest("hex"));
      assert.equal((await post(JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: "v0:1:{}" } }))).status, 400);

      await session({ meeting: "9010", at: "2030-10-01T17:00:00Z" });
      const body = JSON.stringify({ event: "recording.completed", payload: recording("9010", "uuid-9010", "2030-10-01T17:00:00Z",
        [{ id: "rec-9010", start: "2030-10-01T17:00:00Z", data: Buffer.alloc(100) }]) });
      assert.equal((await post(body)).status, 401, "unsigned");
      assert.equal((await post(body, { "x-zm-request-timestamp": "1", "x-zm-signature": "v0=bad" })).status, 401, "bad signature");
      delete process.env.ZOOM_RECORDING_IMPORT_ENABLED;
      assert.equal((await signedPost(body)).status, 503, "import switched off: Zoom retries later");
      assert.equal((await imports("9010")).length, 0);
      process.env.ZOOM_RECORDING_IMPORT_ENABLED = "true";
      assert.equal((await signedPost(body)).status, 200);
      assert.equal((await signedPost(body)).status, 200);
      assert.equal((await imports("9010")).length, 1, "duplicate delivery creates no second import");
      assert.equal((await signedPost(JSON.stringify({ event: "meeting.started", payload: {} }))).status, 200);
    });
  } finally {
    setExtendedLiveAccess(false);
    await db?.end();
    await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => {});
    await maintenance.end();
  }
});
