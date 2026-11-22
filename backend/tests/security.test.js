import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import jwt from "jsonwebtoken";
import ejs from "ejs";
import { authRateLimit } from "../middleware/authRateLimit.js";
import * as offerAccess from "../utils/offerAccess.js";
import * as learnerProfile from "../utils/learnerProfile.js";
import * as courseImages from "../utils/courseImages.js";
import * as timedOffers from "../services/timed-offers.js";
import * as returnPath from "../utils/returnPath.js";
import * as sessions from "../services/sessions.js";

const SECRET = "local-test-secret";
const USER = "10000000-0000-0000-0000-000000000001";
const COURSE = "20000000-0000-0000-0000-000000000001";
const OFFER = "30000000-0000-0000-0000-000000000001";
const OTHER_OFFER = "30000000-0000-0000-0000-000000000002";
const DATES = [
  "40000000-0000-0000-0000-000000000001",
  "40000000-0000-0000-0000-000000000002",
  "40000000-0000-0000-0000-000000000003",
];
const guard = (req, res, next) => req.user ? next() : res.status(401).json({});
const admin = (req, res, next) => req.user?.role === "admin" ? next() : res.status(403).json({});

async function loadRoute(name, doubles, env = {}) {
  const routes = new Map();
  const router = {};
  for (const method of ["get", "post", "delete", "patch", "put"]) {
    router[method] = (path, ...handlers) => routes.set(`${method} ${path}`, handlers);
  }
  const context = vm.createContext({
    process: { env: { JWT_SECRET: SECRET, NODE_ENV: "production", ...env } }, Buffer, console,
  });
  const dependencies = {
    express: { default: { Router: () => router } },
    bcrypt: { default: { hash: async password => `hash:${password}` } },
    jsonwebtoken: { default: jwt },
    crypto: { default: crypto },
    "node:crypto": { randomUUID: crypto.randomUUID },
    "../utils/courseImages.js": courseImages,
    "../services/timed-offers.js": timedOffers,
    "../middleware/requireAdmin.js": { requireAdmin: admin },
    "../middleware/requireAuth.js": { authApiMiddleware: guard },
    "../services/sessions.js": {
      startSession: async (pool, res, user) => res.cookie("synta_access", jwt.sign({ id: user.id }, SECRET)),
      revokeRefreshToken: async () => {},
      clearSessionCookies: res => { res.clearCookie("synta_access"); res.clearCookie("synta_refresh"); },
    },
    "../middleware/authRateLimit.js": { authRateLimit },
    "../services/live-features.js": { liveFeatures: { extendedAccess: false, recordingsTable: false } },
    "../services/recording-worker.js": { recordingStorage: {}, recordingWorker: { kick() {} } },
    "../utils/offerAccess.js": offerAccess,
    "../utils/learnerProfile.js": learnerProfile,
    ...doubles,
  };
  const file = new URL(`../routes/${name}.js`, import.meta.url);
  const source = new vm.SourceTextModule(await readFile(file, "utf8"), { context });
  await source.link(specifier => {
    const exports = dependencies[specifier];
    assert.ok(exports, `Missing test dependency ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await source.evaluate();
  return async (route, req = {}) => {
    const handlers = routes.get(route);
    assert.ok(handlers, `Unknown route ${route}`);
    const res = {
      statusCode: 200, cookies: {}, headers: {},
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      set(name, value) { this.headers[name] = value; },
      sendStatus(code) { this.statusCode = code; return this; },
      redirect(code, url) { this.statusCode = code; this.headers.Location = url; return this; },
      cookie(name, value, options) { this.cookies[name] = { value, options }; },
      clearCookie(name) { delete this.cookies[name]; },
    };
    req = { ip: "test-client", body: {}, params: {}, query: {}, is: type => type === "application/json", ...req };
    async function run(index) {
      let next;
      await handlers[index](req, res, () => { next = run(index + 1); });
      await next;
    }
    await run(0);
    return res;
  };
}

test("placement keeps existing credentials private and requires a fresh verified email proof", async () => {
  const existing = { id: "existing-user", password_hash: "original" };
  const users = new Map([["existing@example.invalid", existing]]);
  const emails = [];
  let registration;
  let revision = 0;
  const query = async (sql, args = []) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.includes("INSERT INTO session_registrations")) {
      assert.match(sql, /NOT EXISTS.*users/);
      if (!users.has(args[1]) && !registration) {
        registration = { id: DATES[0], full_name: args[0], email: args[1], phone: args[2] };
      }
      return { rows: [] };
    }
    if (sql.includes("updated_at::text")) {
      const rows = registration?.email === args[0] && !users.has(args[0])
        ? [{ id: registration.id, revision: String(revision) }] : [];
      return { rows };
    }
    if (sql.includes("GREATEST(clock_timestamp()")) {
      const valid = args[0] === registration?.id && args[1] === String(revision) && !users.has(registration.email);
      if (valid) revision++;
      return { rowCount: Number(valid), rows: valid ? [registration] : [] };
    }
    if (sql.includes("FROM session_questions")) return { rows: [{ id: "q1", correct_answer: "yes" }] };
    if (sql.includes("INSERT INTO session_submissions")) return { rows: [] };
    if (sql.includes("SET score")) {
      registration.completed = true;
      return { rowCount: 1, rows: [registration] };
    }
    if (sql.includes("FOR UPDATE")) {
      const valid = registration?.id === args[0] && registration.completed && !registration.account_activated;
      return { rowCount: Number(valid), rows: valid ? [registration] : [] };
    }
    if (sql.includes("INSERT INTO users")) {
      assert.match(sql, /ON CONFLICT \(email\) DO NOTHING/);
      assert.doesNotMatch(sql, /DO UPDATE/);
      if (users.has(args[0])) return { rowCount: 0, rows: [] };
      const row = { id: USER, email: args[0], name: args[2], role: "user" };
      users.set(args[0], { ...row, password_hash: args[1] });
      return { rowCount: 1, rows: [row] };
    }
    if (sql.includes("SET account_activated")) {
      registration.account_activated = true;
      registration.auth_user_id = args[1];
      return { rows: [] };
    }
    throw new Error(`Unexpected query ${sql}`);
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const call = await loadRoute("session", {
    "../config/db.js": { default: pool },
    "../services/email.js": { sendPlacementVerificationEmail: async (email, token) => emails.push({ email, token }) },
  });
  const register = email => call("post /register", { body: { email, full_name: "Test Learner", phone: "12345678" } });
  const response = await register("EXISTING@example.invalid");
  assert.equal(response.statusCode, 202);
  assert.equal(emails.length, 0);
  assert.equal(Object.keys(response.cookies).length, 0);
  assert.equal((await call("post /set-password", {
    body: { registration_id: existing.id, password: "malicious" }, cookies: { synta_session_token: existing.id },
  })).statusCode, 401);
  assert.equal(existing.password_hash, "original");

  const newUserResponse = await register("new@example.invalid");
  assert.deepEqual(JSON.parse(JSON.stringify(response.body)), JSON.parse(JSON.stringify(newUserResponse.body)));
  const token = emails[0].token;
  const key = crypto.createHmac("sha256", SECRET).update("synta-placement-v1").digest();
  const sign = (subject, audience, expiresIn) => jwt.sign({ revision: "0" }, key, {
    issuer: "synta-placement", subject, audience, expiresIn,
  });
  const verify = value => call("post /verify", { body: { token: value } });
  assert.equal((await call("post /verify", { body: { token }, is: () => false })).statusCode, 415);
  for (const invalid of [
    "invalid", sign(DATES[0], "placement-email", -1), sign(DATES[1], "placement-email", "30m"),
    sign(DATES[0], "placement-verified", "30m"),
  ]) assert.equal((await verify(invalid)).statusCode, 400);

  const verification = await verify(token);
  assert.equal(verification.statusCode, 200);
  assert.equal(verification.cookies.synta_placement.options.httpOnly, true);
  assert.equal((await verify(token)).statusCode, 400);
  const cookies = { synta_placement: verification.cookies.synta_placement.value };
  const activate = () => call("post /set-password", { cookies, body: { password: "real-password" } });
  assert.equal((await activate()).statusCode, 409);
  assert.equal((await call("post /submit", { cookies, body: { answers: { q1: "yes" }, track: "bac" } })).statusCode, 200);
  users.set(registration.email, existing);
  assert.equal((await activate()).statusCode, 409);
  assert.equal(existing.password_hash, "original");
  users.delete(registration.email);
  const activations = await Promise.all([activate(), activate()]);
  assert.deepEqual(activations.map(result => result.statusCode).sort(), [200, 409]);
  const activated = activations.find(result => result.statusCode === 200);
  assert.equal(activated.statusCode, 200);
  assert.equal(jwt.verify(activated.cookies.synta_access.value, SECRET).id, USER);
  assert.equal(registration.auth_user_id, USER);
  assert.equal((await activate()).statusCode, 409);
});

test("rate limit isolates clients and returns a retry interval", () => {
  const limit = authRateLimit(1);
  let count = 0;
  const res = {
    set(name, value) { assert.equal(name, "Retry-After"); assert.ok(Number(value) > 0); },
    status(code) { assert.equal(code, 429); return this; },
    json() {},
  };
  for (const ip of ["first", "first", "second"]) limit({ ip }, res, () => count++);
  assert.equal(count, 2);
});

test("legacy enrollment rejects all paid payment references and still permits free enrollment", async () => {
  let free = false;
  let created = 0;
  const query = async sql => {
    if (sql.includes("SELECT id, title, price")) return { rowCount: 1, rows: [{ is_free: free, title: "Course" }] };
    if (sql.includes("INSERT INTO enrollments")) {
      assert.match(sql, /VALUES \(\$1, \$2, 0/);
      created++;
      return { rowCount: 1, rows: [{ course_id: COURSE }] };
    }
    return { rowCount: 0, rows: [] };
  };
  const call = await loadRoute("enrollment", {
    "../config/db.js": { default: { connect: async () => ({ query, release() {} }) } },
  });
  for (const paymentId of ["fabricated", "pending", "someone-elses-payment", "completed-deposit"]) {
    const result = await call("post /enroll", { user: { id: USER }, body: { courseId: COURSE, paymentId, amountPaid: 1 } });
    assert.equal(result.statusCode, 403);
  }
  assert.equal(created, 0);
  free = true;
  assert.equal((await call("post /enroll", { user: { id: USER }, body: { courseId: COURSE } })).statusCode, 200);
  assert.equal(created, 1);
});

test("user deposit requests cannot fabricate completed purchases or refund ledger entries", async () => {
  const queries = [];
  const call = await loadRoute("user-api", {
    "../config/db.js": { default: { query: async (sql, args) => {
      queries.push({ sql, args });
      return { rows: [{ id: "deposit" }] };
    } } },
  });
  const result = await call("post /api/user/transactions", {
    user: { id: USER },
    body: { amount: 10, type: "refund", status: "completed", userId: "another-user" },
  });
  assert.equal(result.statusCode, 200);
  const insert = queries.find(query => query.sql.includes("INSERT INTO transactions"));
  assert.match(insert.sql, /'deposit', 'pending'/);
  assert.equal(insert.args[0], USER);
});

function walletPool({ balance = 100, failGrant = false, courseOwned = true, offerActive = () => true } = {}) {
  const wallet = { balance, payments: new Set(), courses: new Set(courseOwned ? [COURSE] : []), ledger: [] };
  let queue = Promise.resolve();
  return {
    wallet,
    connect: async () => {
      let snapshot;
      let unlock;
      return {
        release() { assert.equal(unlock, undefined); },
        async query(sql, args = []) {
          if (sql === "BEGIN") return { rows: [] };
          if (sql.includes("FOR UPDATE")) {
            const previous = queue;
            queue = new Promise(resolve => { unlock = resolve; });
            await previous;
            snapshot = structuredClone(wallet);
            return { rowCount: 1, rows: [{ balance: wallet.balance, class: "bac", branch: "informatique" }] };
          }
          if (sql === "COMMIT" || sql === "ROLLBACK") {
            if (sql === "ROLLBACK" && snapshot) Object.assign(wallet, snapshot);
            unlock?.();
            unlock = undefined;
            return { rows: [] };
          }
          if (sql.includes(" AS owned")) {
            assert.ok(unlock, "Ownership must be checked under the wallet lock");
            return { rows: [{ owned: wallet.payments.has(args[1]) }] };
          }
          if (sql.includes("FROM offers o")) {
            assert.match(sql, /o\.is_active = true/);
            return { rows: offerActive(args[0]) ? [{ fixed_price: "30", course_ids: [COURSE], title: "Offer" }] : [] };
          }
          if (sql.includes("FROM courses")) return { rowCount: 1, rows: [{ price: "20", title: "Course", is_free: false }] };
          if (sql.includes("SELECT id FROM enrollments")) return { rowCount: Number(wallet.courses.has(args[1])), rows: [] };
          if (sql.includes("INSERT INTO payments")) {
            assert.equal(wallet.payments.has(args[1]), false);
            wallet.payments.add(args[1]);
            return { rows: [{ id: "payment" }] };
          }
          if (sql.includes("UPDATE users SET balance")) {
            wallet.balance -= Number(args[0]);
            return { rows: [{ balance: wallet.balance }] };
          }
          if (sql.includes("INSERT INTO transactions")) {
            wallet.ledger.push(args);
            return { rows: [{ id: "ledger" }] };
          }
          if (sql.includes("INSERT INTO enrollments")) {
            if (failGrant) throw new Error("synthetic failure");
            if (!Array.isArray(args[1])) assert.equal(args[3], "ledger");
            for (const course of Array.isArray(args[1]) ? args[1] : [args[1]]) wallet.courses.add(course);
            return { rows: [] };
          }
          throw new Error(`Unexpected query ${sql}`);
        },
      };
    },
  };
}

const purchaseRoute = pool => loadRoute("purchase", { "../config/db.js": { default: pool } });
const purchaseOffer = (call, offerId = OFFER) => call("post /offer", { user: { id: USER }, body: { offerId } });

test("concurrent and sequential retries debit once and overlapping offers each grant access", async () => {
  const pool = walletPool();
  const call = await purchaseRoute(pool);
  const results = await Promise.all([purchaseOffer(call), purchaseOffer(call)]);
  assert.deepEqual(results.map(result => result.statusCode), [200, 200]);
  assert.equal(results.filter(result => result.body.alreadyPurchased).length, 1);
  assert.equal((await purchaseOffer(call)).body.alreadyPurchased, true);
  assert.equal(pool.wallet.balance, 70);
  assert.equal(pool.wallet.ledger.length, 1);
  assert.equal(pool.wallet.ledger[0][2], "wallet-offer:payment");
  assert.equal((await purchaseOffer(call, OTHER_OFFER)).statusCode, 200);
  assert.equal(pool.wallet.balance, 40);
  assert.equal(pool.wallet.courses.size, 1);
  assert.deepEqual([...pool.wallet.payments], [OFFER, OTHER_OFFER]);
});

test("wallet purchase rejects insufficient funds and rolls back debit, ledger and grant on failure", async () => {
  for (const [options, status] of [[{ balance: 10 }, 400], [{ failGrant: true }, 500]]) {
    const pool = walletPool(options);
    assert.equal((await purchaseOffer(await purchaseRoute(pool))).statusCode, status);
    assert.equal(pool.wallet.balance, options.balance ?? 100);
    assert.equal(pool.wallet.ledger.length, 0);
    assert.equal(pool.wallet.payments.size, 0);
  }
});

test("concurrent different offers cannot overspend one wallet", async () => {
  const pool = walletPool({ balance: 40 });
  const call = await purchaseRoute(pool);
  const results = await Promise.all([purchaseOffer(call), purchaseOffer(call, OTHER_OFFER)]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 400]);
  assert.equal(pool.wallet.balance, 10);
  assert.equal(pool.wallet.ledger.length, 1);
  assert.equal(pool.wallet.payments.size, 1);
});

test("the authoritative paid course path debits the configured price and links the enrollment to the ledger", async () => {
  const pool = walletPool({ courseOwned: false });
  const call = await purchaseRoute(pool);
  const result = await call("post /course", {
    user: { id: USER }, body: { courseId: COURSE, amountPaid: 1, paymentId: "fabricated" },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(pool.wallet.balance, 80);
  assert.equal(pool.wallet.ledger.length, 1);
  assert.equal(pool.wallet.courses.has(COURSE), true);
});

test("admin installment enrollment grants an overlapping offer once and enforces administrator access", async () => {
  let balance = 100;
  let grants = 0;
  let ledger = 0;
  const query = async (sql, args = []) => {
    if (sql.includes("FROM offers o")) return { rowCount: 1, rows: [{ fixed_price: "30", course_ids: [COURSE] }] };
    if (sql.includes("FOR UPDATE")) return { rowCount: 1, rows: [{ balance }] };
    if (sql.includes(" AS owned")) return { rows: [{ owned: grants > 0 }] };
    if (sql.includes("UPDATE users SET balance")) balance -= args[0];
    if (sql.includes("INSERT INTO transactions")) ledger++;
    if (sql.includes("INSERT INTO payments")) {
      assert.match(sql, /'admin_authorized'/);
      grants++;
    }
    if (sql.includes("INSERT INTO enrollments")) assert.match(sql, /ON CONFLICT/);
    return { rows: [], rowCount: 0 };
  };
  const call = await loadRoute("admin-api", {
    "../config/db.js": { default: { query, connect: async () => ({ query, release() {} }) } },
    "../utils/r2Utils.js": { createR2UploadUrl() {}, deleteFromR2() {}, readR2ObjectMetadata() {}, listRecentR2Objects() {}, uploadToR2() {} },
  });
  const request = {
    user: { id: USER, role: "admin" }, params: { id: USER },
    body: { offerId: OFFER, amountPaid: 10, isExternal: false },
  };
  assert.equal((await call("post /api/admin/student/:id/enroll-partial", { ...request, user: { id: USER } })).statusCode, 403);
  assert.equal((await call("post /api/admin/student/:id/enroll-partial", request)).statusCode, 200);
  assert.equal((await call("post /api/admin/student/:id/enroll-partial", request)).statusCode, 409);
  assert.equal(balance, 90);
  assert.equal(grants, 1);
  assert.equal(ledger, 1);
});

test("the placement page renders with its real route locals and both changed pages have valid inline scripts", async () => {
  const page = await ejs.renderFile(fileURLToPath(new URL("../views/pages/session/index.ejs", import.meta.url)), {
    sessionConfig: { session_date: "", session_matiere: "Test" },
  });
  const adminPage = await readFile(new URL("../public/admin/pages/sessions.html", import.meta.url), "utf8");
  for (const html of [page, adminPage]) {
    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
  }
  assert.match(page, /identity-notice/);
  assert.match(adminPage, /Annuler la série/);
});

test("Zoom recurrence keeps other dates, cancels a series and rolls back failed Zoom deletion", async () => {
  const rows = new Map();
  const removed = [];
  let externalFailure = false;
  let queue = Promise.resolve();
  let unlock;
  const query = async (sql, args = []) => {
    if (sql === "BEGIN") return { rows: [] };
    if (sql.includes("pg_advisory_xact_lock")) {
      const previous = queue;
      let release;
      queue = new Promise(resolve => { release = resolve; });
      await previous;
      unlock = release;
      return { rows: [] };
    }
    if (sql === "COMMIT" || sql === "ROLLBACK") {
      unlock?.();
      unlock = undefined;
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO live_sessions")) {
      const scheduled = args[4].map((date, index) => ({ id: DATES[index], date, zoom_meeting_id: args[6], status: "scheduled" }));
      for (const row of scheduled) rows.set(row.id, row);
      return { rows: scheduled };
    }
    if (sql.includes("SELECT zoom_meeting_id")) {
      const row = rows.get(args[0]);
      return { rowCount: Number(Boolean(row)), rows: row ? [row] : [] };
    }
    if (sql.includes("SELECT status FROM live_sessions")) return { rows: [rows.get(args[0])] };
    if (sql.includes("SELECT id FROM live_sessions WHERE zoom_meeting_id")) {
      return { rows: [...rows.values()].filter(row => row.zoom_meeting_id === args[0] && row.id !== args[1] && row.status !== "cancelled") };
    }
    if (sql.includes("UPDATE live_sessions SET status")) {
      return { rows: args[0].map(id => Object.assign(rows.get(id), { status: "cancelled" })) };
    }
    throw new Error(`Unexpected query ${sql}`);
  };
  const call = await loadRoute("live", {
    "../config/db.js": { default: { query, connect: async () => ({ query, release() {} }) } },
    "@aws-sdk/client-s3": { GetObjectCommand: class {} },
    "../config/r2.js": { r2Client: {}, R2_BUCKET: "test" },
    "../utils/r2Utils.js": { createR2UploadUrl() {}, generateSignedUrl() {} },
    "../utils/zoomClient.js": {
      createZoomMeeting: async options => {
        assert.equal(options.isRecurring, true);
        return { zoom_meeting_id: "zoom-1", zoom_join_url: "https://example.invalid/join" };
      },
      deleteZoomMeeting: async id => {
        if (externalFailure) throw new Error("synthetic Zoom error");
        removed.push(id);
      },
    },
  });
  const user = { id: USER, role: "admin" };
  assert.equal((await call("post /schedule", { user })).statusCode, 400);
  const schedule = () => call("post /schedule", {
    user, body: { courseId: COURSE, title: "Group class", startTimes: ["2030-11-12", "2030-11-19", "2030-11-26"] },
  });
  const cancel = (sessionId, series = "false") => call("delete /:sessionId", { user, params: { sessionId }, query: { series } });
  assert.equal((await schedule()).statusCode, 201);
  assert.equal((await cancel(DATES[0])).statusCode, 200);
  assert.equal((await cancel(DATES[1])).statusCode, 200);
  assert.deepEqual(removed, []);
  assert.equal(rows.get(DATES[2]).status, "scheduled");
  externalFailure = true;
  assert.equal((await cancel(DATES[2])).statusCode, 502);
  assert.equal(rows.get(DATES[2]).status, "scheduled");
  externalFailure = false;
  assert.equal((await cancel(DATES[2])).statusCode, 200);
  assert.deepEqual(removed, ["zoom-1"]);
  assert.equal((await cancel(DATES[2])).statusCode, 200);
  assert.deepEqual(removed, ["zoom-1"]);
  assert.equal((await schedule()).statusCode, 201);
  assert.equal((await cancel(DATES[1], "true")).statusCode, 200);
  assert.ok([...rows.values()].every(row => row.status === "cancelled"));
  await schedule();
  const concurrent = await Promise.all(DATES.map(id => cancel(id)));
  assert.ok(concurrent.every(result => result.statusCode === 200));
  assert.equal(removed.length, 3);
  assert.equal((await call("delete /:sessionId", { user: { id: USER }, params: { sessionId: DATES[0] } })).statusCode, 403);
});

test("Zoom client accepts an already deleted meeting and surfaces API failures", async () => {
  const responses = [
    { ok: true, json: async () => ({ access_token: "synthetic", expires_in: 3600 }) },
    { ok: false, status: 404, json: async () => ({ code: 3001 }) },
    { ok: false, status: 500, json: async () => ({}) },
  ];
  const context = vm.createContext({
    console, Buffer, AbortSignal,
    process: { env: { ZOOM_ACCOUNT_ID: "test", ZOOM_CLIENT_ID: "test", ZOOM_CLIENT_SECRET: "test" } },
    fetch: async () => responses.shift(),
  });
  const module = new vm.SourceTextModule(
    await readFile(new URL("../utils/zoomClient.js", import.meta.url), "utf8"), { context }
  );
  await module.link(() => { throw new Error("Unexpected dependency"); });
  await module.evaluate();
  await module.namespace.deleteZoomMeeting("test-meeting");
  await assert.rejects(module.namespace.deleteZoomMeeting("test-meeting"), /cancellation failed/);
});

test("shared session authorization requires active course and offer rights, audience and non-cancelled state", () => {
  const predicate = offerAccess.liveSessionAccess("$1");
  assert.match(predicate, /e\.user_id = \$1 AND e\.course_id = ls\.course_id/);
  assert.match(predicate, /p\.user_id = \$1 AND p\.offer_id = ls\.offer_id/);
  assert.match(predicate, /p\.status IN \('wallet_completed', 'admin_authorized'\)/);
  assert.match(predicate, /revoked\.status IN \('refunded', 'cancelled', 'canceled', 'expired'\)/);
  assert.match(predicate, /ANY\(ls\.audience_student_ids\)/);
  assert.match(predicate, /ls\.status <> 'cancelled'/);
});

test("deployment reconciles legacy payments status before the index and safely skips applied migrations", async () => {
  const migrations = new URL("../../database/migrations/", import.meta.url);
  const recovery = "202611100002_ensure_offer_payment_status.sql";
  const index = "202611100003_unique_active_offer_payments.sql";
  const files = (await readdir(migrations)).filter(name => name.endsWith(".sql")).sort();
  assert.ok(files.indexOf(recovery) < files.indexOf(index));
  const applied = new Map();
  for (const filename of files.filter(name => ![recovery, index].includes(name))) {
    const sql = (await readFile(new URL(filename, migrations), "utf8")).replace(/\r\n/g, "\n");
    applied.set(filename, crypto.createHash("sha256").update(sql).digest("hex"));
  }
  let hasStatus = false;
  let indexCreated = false;
  let schemaChanges = 0;
  const client = {
    release() {},
    async query(sql, args = []) {
      if (sql.startsWith("SELECT checksum")) {
        return { rowCount: Number(applied.has(args[0])), rows: applied.has(args[0]) ? [{ checksum: applied.get(args[0]) }] : [] };
      }
      if (sql.includes("ALTER TABLE payments")) {
        assert.match(sql, /ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'/);
        hasStatus = true;
        schemaChanges++;
      }
      if (sql.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_active_offer")) {
        assert.ok(hasStatus, "The index cannot run before legacy status reconciliation");
        indexCreated = true;
        schemaChanges++;
      }
      if (sql.startsWith("INSERT INTO schema_migrations")) applied.set(args[0], args[1]);
      return { rows: [] };
    },
  };
  async function run() {
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const errors = [];
    const pool = { connect: async () => client, end: async () => finish() };
    const context = vm.createContext({ console: { log() {}, error: (...args) => errors.push(args) }, process: {} });
    const file = new URL("../scripts/migrate.js", import.meta.url);
    const module = new vm.SourceTextModule(await readFile(file, "utf8"), {
      context, initializeImportMeta: meta => { meta.url = file.href; },
    });
    await module.link(async specifier => {
      const exports = specifier === "../config/db.js" ? { default: pool } : await import(specifier);
      return new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    await module.evaluate();
    await finished;
    assert.deepEqual(errors, []);
  }
  await run();
  assert.equal(hasStatus, true);
  assert.equal(indexCreated, true);
  assert.equal(schemaChanges, 2);
  await run();
  assert.equal(schemaChanges, 2);
});

test("admin offer status affects the active KPI and checkout without revoking a grant", async () => {
  const offers = new Map([[OFFER, true], [OTHER_OFFER, false]]);
  const wallet = walletPool({ offerActive: id => offers.get(id) });
  const buy = await purchaseRoute(wallet);
  const query = async (sql, args = []) => {
    if (sql.startsWith("UPDATE offers")) {
      assert.equal(sql, "UPDATE offers SET is_active = $1 WHERE id = $2 RETURNING is_active");
      const [active, id] = args;
      if (!offers.has(id)) return { rows: [] };
      offers.set(id, active);
      return { rows: [{ is_active: active }] };
    }
    if (sql.startsWith("SELECT *, access_cutoff_date::text")) return {
      rows: [...offers].map(([id, is_active]) => ({ id, is_active }))
    };
    if (sql.includes("FROM offers")) {
      assert.match(sql, /WHERE is_active = true/);
      return { rows: [{ count: [...offers.values()].filter(Boolean).length }] };
    }
    if (sql.includes("FROM users")) return { rows: [{ count: 1 }] };
    if (sql.includes("FROM purchases")) return { rows: [{ total: 0 }] };
    throw new Error("Unexpected query: " + sql);
  };
  const call = await loadRoute("admin-api", {
    "../config/db.js": { default: { query } },
    "../utils/r2Utils.js": { createR2UploadUrl() {}, deleteFromR2() {}, readR2ObjectMetadata() {}, listRecentR2Objects() {}, uploadToR2() {} },
  });
  const route = "patch /api/admin/offers/:id/status";
  const adminUser = { id: USER, role: "admin" };
  const request = { user: adminUser, params: { id: OFFER }, body: { is_active: false } };
  assert.equal((await call(route, { ...request, user: null })).statusCode, 403);
  assert.equal((await call(route, { ...request, user: { id: USER } })).statusCode, 403);
  assert.equal((await call(route, { ...request, body: { is_active: "false" } })).statusCode, 400);
  assert.equal((await call(route, { ...request, params: { id: "bad" } })).statusCode, 400);
  assert.equal((await call(route, { ...request, params: { id: COURSE } })).statusCode, 404);
  assert.equal((await call("get /api/admin/offers", { user: adminUser })).body.data.length, 2);
  assert.equal((await call("get /api/admin/overview-stats", { user: adminUser })).body.offers, 1);
  assert.equal((await purchaseOffer(buy, OTHER_OFFER)).statusCode, 404);
  assert.equal((await purchaseOffer(buy)).statusCode, 200);

  assert.equal((await call(route, request)).body.is_active, false);
  assert.equal((await call("get /api/admin/overview-stats", { user: adminUser })).body.offers, 0);
  assert.equal((await call("get /api/admin/offers", { user: adminUser })).body.data.length, 2);
  assert.equal((await purchaseOffer(buy)).body.alreadyPurchased, true);
  assert.equal(wallet.wallet.courses.has(COURSE), true);
  assert.equal(wallet.wallet.payments.has(OFFER), true);
  assert.equal(wallet.wallet.ledger.length, 1);

  assert.equal((await call(route, { ...request, params: { id: OTHER_OFFER }, body: { is_active: true } })).body.is_active, true);
  assert.equal((await purchaseOffer(buy, OTHER_OFFER)).statusCode, 200);
});

test("admin rows encode harmless HTML-like text and bind original action data as values", async () => {
  const value = `<b data-marker="synthetic">O'Reilly & friends</b>`;
  const helper = await readFile(new URL("../public/admin/js/admin-render.js", import.meta.url), "utf8");
  const bound = {};
  const events = {};
  const row = {
    addEventListener(type, action) { events[type] = action; },
    querySelector(selector) { return { addEventListener(_type, action) { bound[selector] = action; } }; },
  };
  const table = { rows: [row] };
  const context = vm.createContext({
    document: {
      getElementById: () => table,
      createElement: () => ({
        get innerHTML() {
          return this.textContent.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
        }
      })
    },
    openPaymentRowWithKeyboard() {},
  });
  vm.runInContext(helper, context);
  const studentPage = await readFile(new URL("../public/admin/pages/students.html", import.meta.url), "utf8");
  const paymentPage = await readFile(new URL("../public/admin/pages/payments.html", import.meta.url), "utf8");
  function loadFunction(html, start, end) {
    vm.runInContext(html.slice(html.indexOf("function " + start), html.indexOf("function " + end)), context);
  }
  let passwordArgs;
  context.openPassModal = (...args) => { passwordArgs = args; };
  loadFunction(studentPage, "renderStudents", "openPassModal");
  context.renderStudents([{ id: "student-id", fullname: value, email: value }]);
  assert.ok(!table.innerHTML.includes(value));
  assert.match(table.innerHTML, /&lt;b data-marker=&quot;synthetic&quot;&gt;O&#39;Reilly &amp; friends&lt;\/b&gt;/);
  bound["[data-student-password]"]();
  assert.deepEqual(passwordArgs, ["student-id", value]);

  let paymentId;
  context.confirmPayment = id => { paymentId = id; };
  vm.runInContext("let currentPayments = [];", context);
  loadFunction(paymentPage, "renderPayments", "openPaymentRowWithKeyboard");
  context.renderPayments([{ id: value, user_name: value, user_email: value, status: "pending" }]);
  assert.ok(!table.innerHTML.includes(value));
  assert.match(table.innerHTML, /&lt;b data-marker=&quot;synthetic&quot;&gt;/);
  bound["[data-confirm-payment]"]({ stopPropagation() {} });
  assert.equal(paymentId, value);
  assert.equal(typeof events.keydown, "function");
});

test("admin thumbnail URLs accept existing image formats and reject unsafe schemes", async () => {
  const source = await readFile(new URL("../public/admin/js/admin-render.js", import.meta.url), "utf8");
  const sandbox = vm.createContext({ URL });
  vm.runInContext(source, sandbox);
  const base = "https://academy.example/admin/pages/courses.html";
  const safe = value => sandbox.adminImageUrl(value, base);
  assert.equal(safe("/source/course.webp"), "https://academy.example/source/course.webp");
  assert.equal(safe("../../source/course.jpg"), "https://academy.example/source/course.jpg");
  assert.equal(safe("//cdn.example/course.png"), "https://cdn.example/course.png");
  assert.equal(safe("http://cdn.example/legacy.png"), "http://cdn.example/legacy.png");
  assert.equal(safe("https://cdn.example/course.jpg?size=400&v=1"), "https://cdn.example/course.jpg?size=400&v=1");
  assert.equal(safe("data:image/png;base64,AA=="), "data:image/png;base64,AA==");
  for (const url of [
    "", null, "javascript:synthetic", "  JaVaScRiPt:synthetic", "java\tscript:synthetic",
    "data:text/html;base64,PGI+", "data:image/svg+xml;base64,PHN2Zz4=",
    "vbscript:synthetic", "file:///synthetic.png", "blob:https://academy.example/id", "http://[broken"
  ]) assert.equal(safe(url), null, String(url));
});

test("placement records, questions and answers are serialized as text and actions keep original values", async () => {
  const value = `<b data-marker="synthetic">O'Reilly & friends</b>`;
  const page = await readFile(new URL("../public/admin/pages/free-session.html", import.meta.url), "utf8");
  const helper = await readFile(new URL("../public/admin/js/admin-render.js", import.meta.url), "utf8");
  const actions = new Map();
  const row = { querySelector: selector => ({ addEventListener: (_event, fn) => actions.set(selector, fn) }) };
  const ids = {
    "questions-list": { children: [row] },
    "students-list": { rows: [row] },
    studentModalTitle: {},
    studentModalContent: {},
    studentModalOverlay: { classList: { add() {} } }
  };
  let toggled;
  const sandbox = vm.createContext({
    value,
    document: {
      getElementById: id => ids[id],
      createElement: () => ({
        get innerHTML() {
          return this.textContent.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
        }
      })
    },
    toggleQuestion: (...args) => { toggled = args; }
  });
  vm.runInContext(helper, sandbox);
  vm.runInContext(`const questions = [{id:value,text:value,correct_answer:value,is_active:true,type:"multiple_choice"}];
    const studentsData = [{id:value,full_name:value,email:value,phone:value,filier:value,track:value,score:0,
      quiz_details:{[value]:{user_answer:value,correct_answer:value}}}];`, sandbox);
  vm.runInContext(page.slice(page.indexOf("function renderQuestions()"), page.indexOf("// --- Modals & Actions")), sandbox);
  vm.runInContext(page.slice(page.indexOf("function renderStudents()"), page.indexOf("function closeStudentModal()")), sandbox);
  sandbox.renderQuestions();
  sandbox.renderStudents();
  actions.get("[data-toggle-question]")();
  assert.deepEqual(toggled, [value, true]);
  actions.get("[data-view-placement]")();
  assert.ok(ids.studentModalTitle.textContent.includes(value));
  for (const node of [ids["questions-list"], ids["students-list"], ids.studentModalContent]) {
    assert.ok(!node.innerHTML.includes(value));
    assert.match(node.innerHTML, /&lt;b data-marker=&quot;synthetic&quot;&gt;O&#39;Reilly &amp; friends&lt;\/b&gt;/);
  }
});

test("course image upload and recent picker use only the course image folder", async () => {
  const key = "Courses-th/existing.webp";
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7k0AAAAASUVORK5CYII=";
  let uploaded;
  const call = await loadRoute("admin-api", {
    "../config/db.js": { default: { query() { throw new Error("No database access expected"); } } },
    "../utils/r2Utils.js": {
      createR2UploadUrl() {}, deleteFromR2() {}, readR2ObjectMetadata() {},
      async listRecentR2Objects(prefix, filter, limit) {
        assert.equal(prefix, "Courses-th/");
        assert.equal(limit, 24);
        assert.equal(filter(key), true);
        assert.equal(filter("receipts/private.png"), false);
        assert.equal(filter("Courses-th/../receipts/private.png"), false);
        assert.equal(filter("Courses-th/invalid.svg"), false);
        return [{ Key: key }];
      },
      async uploadToR2(path, bytes, contentType) { uploaded = { path, bytes, contentType }; }
    },
  });
  const user = { id: USER, role: "admin" };
  assert.equal((await call("get /api/admin/course-images", { user: { id: USER } })).statusCode, 403);
  const list = await call("get /api/admin/course-images", { user });
  assert.equal(list.body.images[0].url, "/api/content/course-image/Courses-th%2Fexisting.webp");
  assert.equal((await call("post /api/admin/course-images", { user: { id: USER }, body: { data: png } })).statusCode, 403);
  assert.equal((await call("post /api/admin/course-images", { user, body: { data: "PGI+" } })).statusCode, 400);
  assert.equal(uploaded, undefined);
  const result = await call("post /api/admin/course-images", { user, body: { data: png } });
  assert.equal(result.statusCode, 201);
  assert.match(uploaded.path, /^Courses-th\/[a-f0-9-]+\.png$/);
  assert.equal(uploaded.contentType, "image/png");
  assert.equal(uploaded.bytes.toString("base64"), png);
  assert.equal(result.body.url, courseImages.courseImagePath(uploaded.path));
});

test("lesson video replacement verifies the uploaded object and removal only clears the lesson reference", async () => {
  const lessonId = USER;
  const user = { id: USER, role: "admin" };
  const path = "/api/admin/lessons/:lessonId/video";
  const params = { lessonId };
  let key;
  let metadata;
  const updates = [];
  const call = await loadRoute("admin-api", {
    "../config/db.js": { default: { async query(sql, values) {
      if (sql.startsWith("SELECT")) return { rows: [{ id: lessonId }] };
      updates.push(Array.from(values));
      return { rowCount: 1 };
    } } },
    "../utils/r2Utils.js": {
      createR2UploadUrl(path, type) { key = path; assert.equal(type, "video/mp4"); return "https://example.invalid/upload"; },
      readR2ObjectMetadata(path) { assert.equal(path, key); return metadata; },
      deleteFromR2() { assert.fail("Removing a lesson reference must preserve the stored object"); },
      listRecentR2Objects() {}, uploadToR2() {}
    }
  });
  const prepared = await call("post " + path + "-upload-url", { params, user, body: { fileName: "test.MP4", size: 16 } });
  assert.equal(prepared.statusCode, 200);
  assert.match(key, /^lesson-videos\//);
  assert.equal((await call("patch " + path, { params, user: { id: USER }, body: { key: null } })).statusCode, 403);
  assert.equal((await call("patch " + path, { params, user, body: { key: "another/file.mp4" } })).statusCode, 400);
  metadata = { ContentType: "text/plain", ContentLength: 16 };
  assert.equal((await call("patch " + path, { params, user, body: { key } })).statusCode, 400);
  metadata.ContentType = "video/mp4";
  assert.equal((await call("patch " + path, { params, user, body: { key } })).statusCode, 200);
  assert.equal((await call("patch " + path, { params, user, body: { key: null } })).statusCode, 200);
  assert.deepEqual(updates, [[key, lessonId], [null, lessonId]]);
});

test("course image delivery requires a session and refuses keys outside the image folder", async () => {
  const allowed = "Courses-th/Un cours.webp";
  const call = await loadRoute("content", {
    "../config/db.js": { default: {} },
    "../config/r2.js": { r2Client: {}, R2_BUCKET: "synthetic" },
    "@aws-sdk/client-s3": { GetObjectCommand: class {} },
    "../middleware/auth.js": { checkLessonAccess() {} },
    "../utils/r2Utils.js": { async generateSignedUrl(key, ttl) {
      assert.equal(key, allowed);
      assert.equal(ttl, 900);
      return "https://storage.example.invalid/synthetic-signed-image";
    } },
  });
  const route = "get /course-image/:key";
  assert.equal((await call(route, { params: { key: allowed } })).statusCode, 401);
  assert.equal((await call(route, { user: { id: USER }, params: { key: "receipts/private.png" } })).statusCode, 404);
  const image = await call(route, { user: { id: USER }, params: { key: allowed } });
  assert.equal(image.statusCode, 302);
  assert.equal(image.headers.Location, "https://storage.example.invalid/synthetic-signed-image");
  assert.equal(image.headers["Cache-Control"], "private, max-age=300");
});

test("student profile updates keep class and section locked and validate the phone", async () => {
  const queries = [];
  const call = await loadRoute("user-api", {
    "../config/db.js": { default: { query: async (sql, args) => {
      queries.push({ sql, args });
      return { rows: [], rowCount: 1 };
    } } },
  });
  const route = "put /api/user/me";
  const saved = await call(route, {
    user: { id: USER },
    body: { full_name: "  Amira  ", phone: "+216 22 123 456", user_class: "", user_branch: "lettres" },
  });
  assert.equal(saved.statusCode, 200);
  const update = queries.at(-1);
  assert.doesNotMatch(update.sql, /\bclass\b|\bbranch\b/);
  assert.deepEqual([...update.args], ["Amira", "22123456", USER]);

  const keptPhone = await call(route, { user: { id: USER }, body: { full_name: "Amira", phone: "" } });
  assert.equal(keptPhone.statusCode, 200);
  assert.deepEqual([...queries.at(-1).args], ["Amira", null, USER]);

  const before = queries.length;
  const invalid = await call(route, { user: { id: USER }, body: { full_name: "Amira", phone: "123" } });
  assert.equal(invalid.statusCode, 400);
  assert.equal(queries.length, before);
});

test("upcoming live sessions stay listed until their scheduled duration ends", async () => {
  let listed;
  const call = await loadRoute("live", {
    "../config/db.js": { default: { query: async sql => {
      listed = sql;
      return { rows: [] };
    } } },
    "@aws-sdk/client-s3": { GetObjectCommand: class {} },
    "../config/r2.js": { r2Client: {}, R2_BUCKET: "test" },
    "../utils/r2Utils.js": { createR2UploadUrl() {}, generateSignedUrl() {} },
    "../utils/zoomClient.js": { createZoomMeeting() {}, deleteZoomMeeting() {} },
  });
  const result = await call("get /upcoming", { user: { id: USER } });
  assert.equal(result.statusCode, 200);
  assert.match(listed, /ls\.scheduled_at \+ make_interval\(mins => COALESCE\(ls\.duration_minutes, 60\)\) > NOW\(\)/);
  assert.doesNotMatch(listed, /ls\.scheduled_at >= NOW\(\)/);
});

test("post-login return paths only allow student pages", () => {
  for (const safe of ["/dashboard", "/app/courses", "/app/course-details?id=abc&replay=1", "/app/code-pratique?source=lesson-file"]) {
    assert.equal(returnPath.safeReturnPath(safe), safe);
  }
  for (const unsafe of [
    "", "https://evil.example/app/x", "//evil.example", "/\\evil.example", "/app//evil", "/login", "/register",
    "/api/user/me", "/admin/dashboard.html", "/app/../admin", "/dashboardx", "javascript:alert(1)", "/app/x\n",
    "/app/" + "a".repeat(600), ["/app/courses"], null,
  ]) {
    assert.equal(returnPath.safeReturnPath(unsafe), null, String(unsafe));
  }
  assert.equal(returnPath.loginUrlFor("/app/course-details?id=1", true), "/login?next=%2Fapp%2Fcourse-details%3Fid%3D1&reason=expired");
  assert.equal(returnPath.loginUrlFor("//evil.example", false), "/login");
});

test("protected pages send students to login with their destination and an expiry hint", async () => {
  process.env.JWT_SECRET = SECRET;
  const { requireAuth } = await import("../middleware/requireAuth.js");
  const run = async req => {
    const res = { cleared: [], locals: {}, redirect(url) { this.location = url; }, clearCookie(name) { this.cleared.push(name); } };
    let passed = false;
    await requireAuth({ method: "GET", originalUrl: "/app/course-details?id=1", cookies: {}, ...req }, res, () => { passed = true; });
    return { res, passed };
  };
  const destination = "/login?next=%2Fapp%2Fcourse-details%3Fid%3D1";
  assert.equal((await run({})).res.location, destination);
  assert.equal((await run({ cookies: { synta_refresh: "anything" } })).res.location, destination + "&reason=expired");
  const expiredToken = jwt.sign({ id: USER, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET);
  const expired = await run({ cookies: { synta_access: expiredToken } });
  assert.equal(expired.res.location, destination + "&reason=expired");
  assert.deepEqual(expired.res.cleared, ["synta_access"]);
  const refreshAsAccess = await run({ cookies: { synta_access: jwt.sign({ id: USER, type: "refresh" }, SECRET) } });
  assert.equal(refreshAsAccess.passed, false);
  assert.equal((await run({ method: "POST" })).res.location, "/login");
  assert.equal((await run({ originalUrl: "/admin/dashboard.html" })).res.location, "/login");
  assert.equal((await run({ cookies: { synta_access: jwt.sign({ id: USER }, SECRET, { expiresIn: "1h" }) } })).passed, true);
});

test("iPhone Google sign-in returns to the validated page the student came from", async () => {
  const user = { id: USER, email: "student@example.test", name: "Student", role: "user", phone: "22123456", class: "bac", branch: "info" };
  const call = await loadRoute("google-auth", {
    "node:crypto": { timingSafeEqual: crypto.timingSafeEqual },
    "google-auth-library": { OAuth2Client: class {
      async verifyIdToken() { return { getPayload: () => ({ sub: "google-1", email: user.email, name: user.name, email_verified: true }) }; }
    } },
    "../config/db.js": { default: { query: async () => ({ rows: [user], rowCount: 1 }) } },
    "../utils/returnPath.js": returnPath,
  }, { GOOGLE_CLIENT_ID: "test-client" });
  const callback = cookies => call("post /api/auth/google/callback", {
    cookies: { g_csrf_token: "csrf", ...cookies }, body: { g_csrf_token: "csrf", credential: "synthetic" },
  });
  const returned = await callback({ synta_next: "/app/course-details?id=1" });
  assert.equal(returned.statusCode, 303);
  assert.equal(returned.headers.Location, "/app/course-details?id=1");
  assert.ok(returned.cookies.synta_access);
  assert.equal((await callback({ synta_next: "//evil.example" })).headers.Location, "/dashboard");
  assert.equal((await callback({})).headers.Location, "/dashboard");
});

const SESSION_USER = { id: USER, email: "student@example.test", name: "Student", role: "user" };

function refreshTokenDb(users = [SESSION_USER]) {
  const rows = [];
  let nextId = 1;
  const query = async (sql, params = []) => {
    const statement = sql.replace(/\s+/g, " ").trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(statement)) return { rows: [] };
    if (statement.startsWith("SELECT id, email, name, role FROM users")) return { rows: users.filter(user => user.id === params[0]) };
    if (statement.startsWith("DELETE FROM refresh_tokens")) return { rows: [] };
    if (statement.startsWith("INSERT INTO refresh_tokens")) {
      const [userId, familyId, tokenHash, expiresAt, familyExpiresAt] = params;
      if (rows.some(row => row.token_hash === tokenHash)) {
        if (statement.includes("ON CONFLICT (token_hash) DO NOTHING")) return { rows: [] };
        throw Object.assign(new Error("duplicate token_hash"), { code: "23505" });
      }
      const row = {
        id: nextId++, user_id: userId, family_id: familyId, token_hash: tokenHash,
        expires_at: new Date(expiresAt), family_expires_at: new Date(familyExpiresAt),
        used_at: statement.includes("used_at) VALUES") ? new Date() : null, revoked_at: null,
      };
      rows.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (statement.includes("WHERE token_hash = $1 FOR UPDATE")) return { rows: rows.filter(row => row.token_hash === params[0]).map(row => ({ ...row })) };
    if (statement === "UPDATE refresh_tokens SET used_at = NOW() WHERE id = $1") {
      rows.find(row => row.id === params[0]).used_at = new Date();
      return { rows: [] };
    }
    if (statement.startsWith("UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1")) {
      for (const row of rows) if (row.family_id === params[0] && !row.revoked_at) row.revoked_at = new Date();
      return { rows: [] };
    }
    if (statement.includes("family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)")) {
      const family = rows.find(row => row.token_hash === params[0])?.family_id;
      for (const row of rows) if (family && row.family_id === family && !row.revoked_at) row.revoked_at = new Date();
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  };
  return { rows, query, connect: async () => ({ query, release() {} }) };
}

function cookieJar() {
  return {
    cookies: {},
    cookie(name, value, options) { this.cookies[name] = { value, options }; },
    clearCookie(name) { this.cookies[name] = { cleared: true }; },
  };
}

test("refresh tokens rotate once and a replayed old token ends the whole session family", async () => {
  process.env.JWT_SECRET = SECRET;
  const db = refreshTokenDb();
  const login = cookieJar();
  await sessions.startSession(db, login, SESSION_USER);
  const first = login.cookies.synta_refresh;
  assert.equal(jwt.verify(login.cookies.synta_access.value, SECRET).id, USER);
  assert.equal(first.options.httpOnly, true);
  assert.equal(first.options.sameSite, "lax");
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].token_hash, sessions.hashToken(first.value));
  assert.ok(!JSON.stringify(db.rows).includes(first.value), "raw refresh token must not be stored");

  const rotated = await sessions.rotateRefreshToken(db, first.value);
  assert.equal(jwt.verify(rotated.accessToken, SECRET).id, USER);
  assert.notEqual(rotated.refresh.token, first.value);
  assert.ok(db.rows[0].used_at);
  assert.equal(db.rows[1].family_id, db.rows[0].family_id);

  const parallel = await sessions.rotateRefreshToken(db, first.value);
  assert.ok(parallel.accessToken, "a parallel request right after rotation still succeeds");
  assert.equal(parallel.refresh, undefined);
  assert.equal(db.rows.length, 2);

  db.rows[0].used_at = new Date(Date.now() - sessions.ROTATION_GRACE_MS - 1000);
  assert.equal(await sessions.rotateRefreshToken(db, first.value), null);
  assert.ok(db.rows.every(row => row.revoked_at), "reuse revokes every token in the family");
  assert.equal(await sessions.rotateRefreshToken(db, rotated.refresh.token), null);
});

test("refresh tokens expire after 14 idle days and never outlive the 30-day session cap", async () => {
  process.env.JWT_SECRET = SECRET;
  const db = refreshTokenDb();
  const login = cookieJar();
  await sessions.startSession(db, login, SESSION_USER);
  const [row] = db.rows;
  const now = Date.now();
  assert.equal(sessions.REFRESH_IDLE_MS,14*24*60*60*1000);
  assert.ok(Math.abs(row.expires_at - (now + sessions.REFRESH_IDLE_MS)) < 5000);
  assert.ok(Math.abs(row.family_expires_at - (now + sessions.SESSION_MAX_MS)) < 5000);

  row.expires_at = new Date(now - 1000);
  assert.equal(await sessions.rotateRefreshToken(db, login.cookies.synta_refresh.value), null);

  const capped = cookieJar();
  await sessions.startSession(db, capped, SESSION_USER);
  db.rows[1].family_expires_at = new Date(now + 60 * 60 * 1000);
  const renewed = await sessions.rotateRefreshToken(db, capped.cookies.synta_refresh.value);
  assert.ok(renewed.refresh.expiresAt <= db.rows[1].family_expires_at, "renewal never extends past the family cap");
  const renewedJar = cookieJar();
  sessions.applyRotation(renewedJar, renewed);
  assert.ok(renewedJar.cookies.synta_refresh.options.maxAge <= 60 * 60 * 1000);

  db.rows[2].revoked_at = new Date();
  assert.equal(await sessions.rotateRefreshToken(db, renewed.refresh.token), null);
  db.rows[2].revoked_at = null;
  db.rows[2].family_expires_at = new Date(now - 1000);
  assert.equal(await sessions.rotateRefreshToken(db, renewed.refresh.token), null);

  assert.equal(await sessions.rotateRefreshToken(db, crypto.randomBytes(32).toString("base64url")), null);
  assert.equal(await sessions.rotateRefreshToken(db, ["not-a-token"]), null);
  assert.equal(await sessions.rotateRefreshToken(db, "x".repeat(3000)), null);
});

test('active renewal extends the 14-day window, and missing storage is detectable',async()=>{
  process.env.JWT_SECRET=SECRET;
  const db=refreshTokenDb(),login=cookieJar();
  await sessions.startSession(db,login,SESSION_USER);
  // Represent a session near the end of its idle window, then resume browsing.
  db.rows[0].expires_at=new Date(Date.now()+60*60*1000);
  const refreshed=await sessions.rotateRefreshToken(db,login.cookies.synta_refresh.value);
  assert.ok(refreshed.refresh);
  assert.ok(Math.abs(refreshed.refresh.expiresAt.getTime()-Date.now()-14*24*60*60*1000)<5000);
  const renewed=cookieJar();sessions.applyRotation(renewed,refreshed);
  assert.ok(Math.abs(renewed.cookies.synta_refresh.options.maxAge-14*24*60*60*1000)<5000);
  assert.equal(await sessions.sessionRenewalReady({query:async()=>({rows:[{ready:true}]})}),true);
  assert.equal(await sessions.sessionRenewalReady({query:async()=>({rows:[{ready:false}]})}),false);
});

test("pre-rotation refresh JWTs are accepted once and only when genuine", async () => {
  process.env.JWT_SECRET = SECRET;
  const db = refreshTokenDb();
  const legacy = jwt.sign({ id: USER, type: "refresh" }, SECRET, { expiresIn: "7d" });
  const converted = await sessions.rotateRefreshToken(db, legacy);
  assert.equal(jwt.verify(converted.accessToken, SECRET).id, USER);
  assert.ok(converted.refresh.token);
  assert.equal(db.rows[0].token_hash, sessions.hashToken(legacy));
  assert.ok(db.rows[0].used_at);

  db.rows[0].used_at = new Date(Date.now() - sessions.ROTATION_GRACE_MS - 1000);
  assert.equal(await sessions.rotateRefreshToken(db, legacy), null);
  assert.equal(await sessions.rotateRefreshToken(db, converted.refresh.token), null, "legacy replay revokes the converted session");

  for (const forged of [
    jwt.sign({ id: USER }, SECRET, { expiresIn: "1h" }),
    jwt.sign({ id: USER, magic: true }, SECRET, { expiresIn: "5m" }),
    jwt.sign({ id: USER, type: "refresh" }, "wrong-secret", { expiresIn: "7d" }),
    jwt.sign({ id: USER, type: "refresh", exp: Math.floor(Date.now() / 1000) - 60 }, SECRET),
    jwt.sign({ id: "10000000-0000-0000-0000-000000000099", type: "refresh" }, SECRET, { expiresIn: "7d" }),
  ]) {
    assert.equal(await sessions.rotateRefreshToken(db, forged), null);
  }
});

test("logout revokes renewal, admin log-in-as sessions never renew, and a storage failure still signs in", async () => {
  process.env.JWT_SECRET = SECRET;
  const db = refreshTokenDb();
  const login = cookieJar();
  await sessions.startSession(db, login, SESSION_USER);
  const token = login.cookies.synta_refresh.value;
  await sessions.revokeRefreshToken(db, token);
  assert.equal(await sessions.rotateRefreshToken(db, token), null);

  const adminBrowser = cookieJar();
  await sessions.startSession(db, adminBrowser, SESSION_USER);
  const adminToken = adminBrowser.cookies.synta_refresh.value;
  const magic = cookieJar();
  await sessions.startSession(db, magic, SESSION_USER, { renewable: false, previousRefreshToken: adminToken });
  assert.ok(magic.cookies.synta_access.value);
  assert.deepEqual(magic.cookies.synta_refresh, { cleared: true });
  assert.equal(db.rows.length, 2, "no refresh token is created for a log-in-as session");
  assert.equal(await sessions.rotateRefreshToken(db, adminToken), null);

  const broken = { query: async sql => { if (sql.includes("INSERT")) throw new Error("relation does not exist"); return { rows: [] }; } };
  const fallback = cookieJar();
  const originalError = console.error;
  console.error = () => {};
  try {
    await sessions.startSession(broken, fallback, SESSION_USER);
  } finally {
    console.error = originalError;
  }
  assert.ok(fallback.cookies.synta_access.value);
  assert.deepEqual(fallback.cookies.synta_refresh, { cleared: true });
});

test("session renewal middleware renews before guards and fails safe", async () => {
  process.env.JWT_SECRET = SECRET;
  const { sessionRenewal } = await import("../middleware/requireAuth.js");
  const db = refreshTokenDb();
  const login = cookieJar();
  await sessions.startSession(db, login, SESSION_USER);
  const run = async (middleware, req) => {
    const res = cookieJar();
    let passed = false;
    req = { path: "/app/courses", ip: "198.51.100.7", ...req };
    await middleware(req, res, () => { passed = true; });
    return { req, res, passed };
  };

  const renewal = sessionRenewal(db);
  const renewed = await run(renewal, { cookies: { synta_refresh: login.cookies.synta_refresh.value } });
  assert.equal(renewed.passed, true);
  assert.equal(jwt.verify(renewed.req.cookies.synta_access, SECRET).id, USER);
  assert.equal(renewed.res.cookies.synta_access.value, renewed.req.cookies.synta_access);
  assert.equal(renewed.res.cookies.synta_refresh.value, renewed.req.cookies.synta_refresh);

  let connects = 0;
  const counting = { connect: async () => { connects++; return db.connect(); } };
  const valid = jwt.sign({ id: USER }, SECRET, { expiresIn: "1h" });
  await run(sessionRenewal(counting), { cookies: { synta_access: valid, synta_refresh: "unused" } });
  await run(sessionRenewal(counting), { path: "/api/auth/logout", cookies: { synta_refresh: "unused" } });
  await run(sessionRenewal(counting), { cookies: {} });
  assert.equal(connects, 0, "no renewal when access is valid, on auth routes, or without a refresh cookie");

  const refused = await run(renewal, { cookies: { synta_refresh: "stolen-or-unknown" } });
  assert.equal(refused.passed, true);
  assert.deepEqual(refused.res.cookies.synta_refresh, { cleared: true });
  assert.equal(refused.req.cookies.synta_refresh, "stolen-or-unknown", "login can still explain that the session expired");
  assert.equal(refused.req.cookies.synta_access, undefined);

  const limited = sessionRenewal(counting);
  for (let attempt = 0; attempt < 31; attempt++) await run(limited, { cookies: { synta_refresh: `guess-${attempt}` } });
  assert.equal(connects, 30, "renewal attempts are throttled per IP after repeated failures");

  const down = sessionRenewal({ connect: async () => { throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }); } });
  const originalError = console.error;
  console.error = () => {};
  let outage;
  try {
    outage = await run(down, { cookies: { synta_refresh: login.cookies.synta_refresh.value } });
  } finally {
    console.error = originalError;
  }
  assert.equal(outage.passed, true);
  assert.equal(outage.res.cookies.synta_refresh, undefined, "a database outage must not log the student out");
});

test("login starts a rotating session, logout revokes it, and magic login is not renewable", async () => {
  const calls = [];
  const sessionDouble = {
    startSession: async (pool, res, user, options = {}) => { calls.push(["start", user.id, { ...options }]); res.cookie("synta_access", "access"); },
    revokeRefreshToken: async (pool, token) => calls.push(["revoke", token]),
    clearSessionCookies: res => { res.clearCookie("synta_access"); res.clearCookie("synta_refresh"); },
  };
  const user = { ...SESSION_USER, password_hash: "stored", email_verified: true };
  const call = await loadRoute("auth-api", {
    bcrypt: { default: { hash: async password => `hash:${password}`, compare: async () => true } },
    "../config/db.js": { default: { query: async () => ({ rows: [user], rowCount: 1 }) } },
    "../services/sessions.js": sessionDouble,
    "../services/email.js": { generateVerificationToken() {}, async sendVerificationEmail() {} },
  });

  const login = await call("post /api/auth/login", {
    body: { email: user.email, password: "local-only" }, cookies: { synta_refresh: "previous" },
  });
  assert.equal(login.body.success, true);
  assert.equal(JSON.stringify(login.body).includes("stored"), false);
  assert.deepEqual(calls.shift(), ["start", USER, { previousRefreshToken: "previous" }]);

  const logout = await call("post /api/auth/logout", { cookies: { synta_refresh: "current" } });
  assert.deepEqual(calls.shift(), ["revoke", "current"]);
  assert.equal(logout.cookies.synta_access, undefined);

  const magicToken = jwt.sign({ id: USER, magic: true }, SECRET, { expiresIn: "5m" });
  await call("get /api/auth/magic-login", { query: { token: magicToken }, cookies: { synta_refresh: "admin" } });
  assert.deepEqual(calls.shift(), ["start", USER, { renewable: false, previousRefreshToken: "admin" }]);
});
