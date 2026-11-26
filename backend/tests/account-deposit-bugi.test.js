// Student deletion/deactivation, deposit-request limits and Bugi daily quota.
// Unit tests use an in-memory database double whose FOR UPDATE really serializes
// transactions, so concurrency rules are exercised without PostgreSQL. The PostgreSQL
// integration test at the bottom runs only when BUGI_QA_POSTGRES_PORT is set.
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import * as accountStatus from "../services/account-status.js";
import * as deposits from "../services/deposit-requests.js";
import * as quota from "../services/bugi-quota.js";
import * as character from "../services/bugi-character.js";
import * as provider from "../services/bugi-provider.js";
import * as learning from "../services/bugi-learning.js";

const USER = "10000000-0000-0000-0000-0000000000aa";
const tick = () => new Promise(resolve => setImmediate(resolve));

/** Minimal pool whose "FOR UPDATE" (per user) and advisory locks hold until COMMIT/ROLLBACK. */
function lockingPool(handle) {
  const locks = new Map();
  const log = [];
  const releaseAll = session => { for (const unlock of session.unlocks.splice(0)) unlock(); };
  async function acquire(key, session) {
    const previous = locks.get(key) ?? Promise.resolve();
    let unlock;
    const held = new Promise(resolve => { unlock = resolve; });
    locks.set(key, previous.then(() => held));
    await previous;
    session.unlocks.push(unlock);
  }
  async function run(sql, args, session) {
    log.push(sql);
    await tick();
    if (/^\s*(BEGIN|SAVEPOINT|ROLLBACK TO SAVEPOINT)/.test(sql)) return { rows: [] };
    if (/^\s*(COMMIT|ROLLBACK)\s*$/.test(sql)) { if (session) releaseAll(session); return { rows: [] }; }
    if (/FROM users WHERE id = \$1[^]*FOR UPDATE/.test(sql) && session) await acquire("user:" + args[0], session);
    if (/pg_advisory_xact_lock/.test(sql) && session) { await acquire("advisory", session); return { rows: [{}] }; }
    return handle(sql, args);
  }
  return {
    log,
    query: (sql, args) => run(sql, args, null),
    connect: async () => {
      const session = { unlocks: [] };
      return { query: (sql, args) => run(sql, args, session), release() { releaseAll(session); } };
    },
  };
}

// ── 1. Student deletion and deactivation ───────────────────────────────────

function studentDb({ balance = "0.00", debt = "0", history = [], fkViolation = false, deactivationReady = true } = {}) {
  const state = { deleted: false, deactivated_at: null, revoked: 0 };
  const pool = lockingPool(async (sql, args) => {
    if (sql.includes("information_schema.columns")) return { rows: [{ count: deactivationReady ? 2 : 0 }] };
    if (sql.includes("to_regclass($1)")) return { rows: [{ present: true }] };
    if (sql.includes("to_regclass('refresh_tokens')")) return { rows: [{ ready: true }] };
    if (sql.includes("FROM users WHERE id = $1 AND role = 'user' FOR UPDATE")) return { rows: [{ id: args[0], balance, debt }], rowCount: 1 };
    const table = sql.match(/^SELECT 1 FROM (\w+) WHERE user_id/)?.[1];
    if (table) return { rows: history.includes(table) ? [{}] : [], rowCount: history.includes(table) ? 1 : 0 };
    if (sql.startsWith("DELETE FROM users")) {
      if (fkViolation) throw Object.assign(new Error("fk"), { code: "23503" });
      state.deleted = true;
      return { rowCount: 1, rows: [] };
    }
    if (sql.startsWith("UPDATE users SET deactivated_at = NULL")) { state.deactivated_at = null; return { rowCount: 1, rows: [{ id: args[0], deactivated_at: null }] }; }
    if (sql.startsWith("UPDATE users SET deactivated_at")) { state.deactivated_at = new Date(); return { rowCount: 1, rows: [{ id: args[0], deactivated_at: state.deactivated_at }] }; }
    if (sql.startsWith("UPDATE refresh_tokens SET revoked_at")) { state.revoked++; return { rows: [] }; }
    if (sql.includes("deactivated_at IS NULL AS active")) return { rows: [{ active: !state.deactivated_at }] };
    throw new Error("Unexpected SQL: " + sql);
  });
  return { pool, state };
}

test("a student with a balance, debt or any financial history is never hard-deleted", async () => {
  for (const setup of [{ balance: "12.50" }, { debt: "40" }, { balance: "-1.00" }]) {
    const { pool, state } = studentDb(setup);
    await assert.rejects(accountStatus.deleteStudentSafely(pool, USER), error => error.status === 409 && /solde ou une dette/.test(error.message));
    assert.equal(state.deleted, false);
    assert.equal(pool.log.some(sql => sql.startsWith("DELETE")), false, "no DELETE is attempted");
  }
  for (const table of ["transactions", "payments", "purchases", "offer_access_grants", "offer_installment_arrangements", "offer_upgrade_confirmations", "enrollments"]) {
    const { pool, state } = studentDb({ history: [table] });
    await assert.rejects(accountStatus.deleteStudentSafely(pool, USER), error => error.status === 409 && /Désactivez le compte/.test(error.message), table);
    assert.equal(state.deleted, false, table);
  }
});

test("other linked records block deletion cleanly, and a clean account can still be deleted", async () => {
  const blocked = studentDb({ fkViolation: true });
  await assert.rejects(accountStatus.deleteStudentSafely(blocked.pool, USER), error => error.status === 409 && /d’autres données/.test(error.message));
  assert.ok(blocked.pool.log.includes("ROLLBACK TO SAVEPOINT student_delete"));

  const clean = studentDb();
  assert.deepEqual(await accountStatus.deleteStudentSafely(clean.pool, USER), { deleted: true });
  assert.equal(clean.state.deleted, true);
});

test("deactivation keeps records, ends sessions, can be undone, and needs its migration", async () => {
  accountStatus.resetAccountStatusCache();
  const { pool, state } = studentDb();
  const off = await accountStatus.setStudentActive(pool, USER, false, "admin");
  assert.equal(off.active, false);
  assert.ok(state.deactivated_at);
  assert.equal(state.revoked, 1, "every refresh token is revoked");
  assert.equal(pool.log.some(sql => /transactions|payments|enrollments|balance/.test(sql) && /UPDATE|DELETE/.test(sql)), false,
    "no financial row is touched");
  assert.equal(await accountStatus.isAccountActive(pool, USER), false);

  const guard = accountStatus.requireActiveAccount(pool);
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  let passed = false;
  await guard({ user: { id: USER } }, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(res.code, 403);
  assert.match(res.body.error, /désactivé/);

  await accountStatus.setStudentActive(pool, USER, true, "admin");
  assert.equal(await accountStatus.isAccountActive(pool, USER), true);

  accountStatus.resetAccountStatusCache();
  const missing = studentDb({ deactivationReady: false });
  await assert.rejects(accountStatus.setStudentActive(missing.pool, USER, false, "admin"), error => error.status === 503);
  assert.equal(await accountStatus.isAccountActive(missing.pool, USER), true, "without the migration every account stays active");
  accountStatus.resetAccountStatusCache();
});

test("a deactivated student with a still-valid access token loses API, page and live access at once", async () => {
  process.env.JWT_SECRET ??= "synthetic-deactivation-test";
  const jwt = (await import("jsonwebtoken")).default;
  const auth = await import("../middleware/requireAuth.js?deactivation");
  const token = jwt.sign({ id: USER, email: "s@example.invalid", role: "user" }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: 3600 });
  accountStatus.resetAccountStatusCache();
  const { pool, state } = studentDb();
  auth.configureAccountChecks(pool);
  const response = () => ({ cleared: [], status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; },
    redirect(url) { this.location = url; return this; }, clearCookie(name) { this.cleared.push(name); } });
  const call = async middleware => { const res = response(); let passed = false; await middleware({ cookies: { synta_access: token }, method: "GET", originalUrl: "/app/courses" }, res, () => { passed = true; }); return { res, passed }; };

  assert.equal((await call(auth.authApiMiddleware)).passed, true, "active student passes");
  await accountStatus.setStudentActive(pool, USER, false, "admin");
  const api = await call(auth.authApiMiddleware);
  assert.equal(api.passed, false);
  assert.equal(api.res.code, 403);
  assert.ok(api.res.cleared.includes("synta_access"));
  const page = await call(auth.requireAuth);
  assert.equal(page.passed, false);
  assert.equal(page.res.location, "/login");
  assert.equal(await auth.accountAllowed(USER), false, "live join and optional-auth routes use the same check");
  assert.ok(state.deactivated_at);

  await accountStatus.setStudentActive(pool, USER, true, "admin");
  assert.equal((await call(auth.authApiMiddleware)).passed, true, "reactivation restores access");
  auth.configureAccountChecks(null);
  accountStatus.resetAccountStatusCache();
});

// ── 2. Deposit requests ────────────────────────────────────────────────────

test("deposit amounts, methods, references and descriptions are validated on the server", () => {
  const ok = deposits.validateDepositInput({ amount: 1500 });
  assert.equal(ok.amount, "1500.00");
  assert.equal(ok.method, "En attente de confirmation");
  assert.match(ok.reference, /^TXN-/);
  assert.equal(deposits.validateDepositInput({ amount: "0.5" }).amount, "0.50");
  assert.equal(deposits.validateDepositInput({ amount: "12.3" }).amount, "12.30");
  for (const amount of [0, "0.00", -5, "1500.01", 1501, "1.234", "abc", "", null, "1e3", " ", "10,5", Infinity, NaN]) {
    assert.throws(() => deposits.validateDepositInput({ amount }), error => error.status === 400, String(amount));
  }
  assert.throws(() => deposits.validateDepositInput({ amount: 10, payment_method: "Bitcoin" }), /Moyen de paiement/);
  assert.throws(() => deposits.validateDepositInput({ amount: 10, transaction_code: "ab" }), /référence/);
  assert.throws(() => deposits.validateDepositInput({ amount: 10, transaction_code: "x".repeat(65) }), /référence/);
  assert.throws(() => deposits.validateDepositInput({ amount: 10, transaction_code: "<script>" }), /référence/);
  assert.throws(() => deposits.validateDepositInput({ amount: 10, description: "d".repeat(201) }), /description/);
  assert.equal(deposits.validateDepositInput({ amount: 10, description: "ligne\u0000deux" }).description, "ligne deux");
  assert.equal(deposits.validateDepositInput({ amount: 10, payment_method: "D17", transaction_code: "D17-123456" }).method, "D17");

  process.env.DEPOSIT_MAX_AMOUNT = "200";
  assert.throws(() => deposits.validateDepositInput({ amount: 201 }), /200 DT/);
  delete process.env.DEPOSIT_MAX_AMOUNT;
});

function depositDb() {
  const rows = [];
  const pool = lockingPool(async (sql, args) => {
    if (sql.includes("FROM users WHERE id = $1 FOR UPDATE")) return { rowCount: 1, rows: [{ id: args[0] }] };
    if (sql.includes("COUNT(*)::int AS pending FROM transactions")) {
      return { rows: [{ pending: rows.filter(row => row.status === "pending").length }] };
    }
    if (sql.includes("COUNT(*) FILTER")) {
      return { rows: [{
        pending: rows.filter(row => row.status === "pending").length,
        same_reference: rows.filter(row => row.reference.toLowerCase() === args[1].toLowerCase()).length,
        recent_same_amount: rows.filter(row => row.status === "pending" && row.amount === args[2] && Date.now() - row.created < args[3] * 1000).length,
      }] };
    }
    if (sql.includes("INSERT INTO transactions")) {
      assert.match(sql, /'deposit', 'pending'/);
      const row = { id: rows.length + 1, amount: args[1], reference: args[3], status: "pending", created: Date.now() };
      rows.push(row);
      return { rows: [row] };
    }
    throw new Error("Unexpected SQL: " + sql);
  });
  return { pool, rows };
}

test("parallel deposit requests cannot exceed five pending, duplicates are refused and the wallet is never credited", async () => {
  const { pool, rows } = depositDb();
  const attempts = Array.from({ length: 12 }, (_, index) => deposits.insertDepositRequest(pool, USER,
    deposits.validateDepositInput({ amount: 10 + index, transaction_code: "REF-" + index }), null));
  const results = await Promise.allSettled(attempts);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 5);
  assert.ok(results.filter(result => result.status === "rejected").every(result => result.reason.status === 429));
  assert.equal(rows.length, 5);
  assert.equal(pool.log.some(sql => /balance/.test(sql)), false, "a request never touches the wallet balance");

  const fresh = depositDb();
  await deposits.insertDepositRequest(fresh.pool, USER, deposits.validateDepositInput({ amount: 50, transaction_code: "D17-777" }), null);
  await assert.rejects(deposits.insertDepositRequest(fresh.pool, USER, deposits.validateDepositInput({ amount: 60, transaction_code: "d17-777" }), null),
    error => error.status === 409 && /référence/.test(error.message));
  await assert.rejects(deposits.insertDepositRequest(fresh.pool, USER, deposits.validateDepositInput({ amount: 50 }), null),
    error => error.status === 409 && /identique/.test(error.message));
  const twins = await Promise.allSettled([1, 2].map(() =>
    deposits.insertDepositRequest(fresh.pool, USER, deposits.validateDepositInput({ amount: 75 }), null)));
  assert.equal(twins.filter(result => result.status === "fulfilled").length, 1, "a double-click creates one request");
  await assert.rejects(deposits.precheckDepositLimits({ query: async () => ({ rows: [{ pending: 5 }] }) }, USER), error => error.status === 429);
});

test("receipts: new uploads store a private random key, old public URLs still resolve for admins, students never see locations", async () => {
  const routes = await readFile(new URL("../routes/user-api.js", import.meta.url), "utf8");
  assert.doesNotMatch(routes, /R2_PUBLIC_DOMAIN|r2\.dev/, "no public receipt URL is built any more");
  assert.match(routes, /receipts\/\$\{userId\}-\$\{Date\.now\(\)\}-\$\{randomUUID\(\)\}/);
  assert.match(routes, /finalReceiptUrl = fileName;/);
  assert.match(routes, /has_receipt: Boolean\(receipt_url\)/);
  const admin = await readFile(new URL("../routes/admin-api.js", import.meta.url), "utf8");
  assert.match(admin, /receipt_url\.startsWith\("receipts\/"\)/, "admin proxy accepts the new key form");
  assert.match(admin, /split\("\/receipts\/"\)\[1\]/, "and the historical public URL form");
});

// ── 3. Bugi daily quota ────────────────────────────────────────────────────

function quotaDb({ eligible = () => false, tableReady = true } = {}) {
  const usage = [];
  let nextId = 1;
  const live = row => row.status === "used" || Date.now() - row.created < 120000;
  const pool = lockingPool(async (sql, args) => {
    if (sql.includes("to_regclass('bugi_question_usage')")) return { rows: [{ ready: tableReady }] };
    if (sql.includes("AS eligible")) return { rows: [{ eligible: typeof eligible === "function" ? eligible(args[0]) : eligible }] };
    if (sql.includes("FROM users WHERE id = $1 FOR UPDATE")) return { rowCount: 1, rows: [{ id: args[0] }] };
    if (sql.includes("COUNT(*)::int AS used FROM bugi_question_usage") && sql.includes("user_id = $1")) {
      return { rows: [{ used: usage.filter(row => row.user_id === args[0] && live(row)).length }] };
    }
    if (sql.includes("COUNT(*)::int AS used FROM bugi_question_usage")) return { rows: [{ used: usage.filter(live).length }] };
    if (sql.includes("INSERT INTO bugi_question_usage")) {
      const row = { id: nextId++, user_id: args[0], status: "reserved", created: Date.now() };
      usage.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (sql.startsWith("UPDATE bugi_question_usage SET status = 'used'")) { usage.find(row => row.id === args[0]).status = "used"; return { rows: [] }; }
    if (sql.startsWith("DELETE FROM bugi_question_usage")) {
      const index = usage.findIndex(row => row.id === args[0] && row.status === "reserved");
      if (index >= 0) usage.splice(index, 1);
      return { rows: [] };
    }
    throw new Error("Unexpected SQL: " + sql);
  });
  return { pool, usage };
}

test("free and non-Bugi students get 3 questions, Bugi offers 15, and limits are configurable", async () => {
  quota.resetBugiQuotaForTests();
  assert.deepEqual(quota.bugiDailyLimits(), { free: 3, bugi: 15 });
  process.env.BUGI_DAILY_LIMIT_FREE = "5"; process.env.BUGI_DAILY_LIMIT_BUGI = "50";
  assert.deepEqual(quota.bugiDailyLimits(), { free: 5, bugi: 50 });
  process.env.BUGI_DAILY_LIMIT_FREE = "-1"; process.env.BUGI_DAILY_LIMIT_BUGI = "abc";
  assert.deepEqual(quota.bugiDailyLimits(), { free: 3, bugi: 15 }, "invalid values fall back to defaults");
  delete process.env.BUGI_DAILY_LIMIT_FREE; delete process.env.BUGI_DAILY_LIMIT_BUGI;

  const free = quota.createBugiQuota(quotaDb().pool);
  assert.deepEqual(await free.planFor(USER), { plan: "free", limit: 3 });
  const premium = quota.createBugiQuota(quotaDb({ eligible: () => true }).pool);
  assert.deepEqual(await premium.planFor(USER), { plan: "bugi", limit: 15 });
});

test("eligibility reuses the offer flag and requires live access, not a bare purchase", () => {
  const sql = quota.bugiEligibility("$1");
  assert.match(sql, /"key":"bugi","active":true/);
  assert.match(sql, /g\.revoked_at IS NULL/);
  assert.match(sql, /g\.expires_at > NOW\(\)/);
  assert.match(sql, /e\.expires_at IS NULL OR e\.expires_at > NOW\(\)/);
  assert.match(sql, /NOT e\.timed_access_only/);
  assert.match(sql, /'refunded', 'cancelled', 'canceled', 'expired'/);
  assert.match(sql, /^EXISTS \(\s*SELECT 1 FROM offers o/, "one EXISTS: several eligible offers never add up");
});

test("quota boundaries: the 4th free question is refused before Gemini, failures are free, purchases raise the limit without a reset", () => withEnv({ BUGI_GLOBAL_PER_MINUTE: "1000", BUGI_GLOBAL_DAILY_LIMIT: "100000" }, async () => {
  // Per-student limits only; the shared platform budget has its own test.
  quota.resetBugiQuotaForTests();
  let eligible = false;
  const { pool, usage } = quotaDb({ eligible: () => eligible });
  const bugi = quota.createBugiQuota(pool);

  const failed = await bugi.reserve(USER);
  await failed.release();
  assert.equal(usage.length, 0, "a failed Gemini answer gives the question back");

  for (let index = 0; index < 3; index++) {
    const slot = await bugi.reserve(USER);
    assert.equal(slot.quota.remaining, 2 - index);
    await slot.commit();
  }
  await assert.rejects(bugi.reserve(USER), error => error.status === 429 && error.code === "BUGI_DAILY_LIMIT"
    && error.quota.plan === "free" && error.quota.remaining === 0);

  eligible = true; // student buys an offer with Bugi included
  const after = await bugi.status(USER);
  assert.deepEqual([after.plan, after.limit, after.used, after.remaining], ["bugi", 15, 3, 12], "used questions are kept");
  const next = await bugi.reserve(USER);
  await next.commit();
  assert.equal((await bugi.status(USER)).remaining, 11);

  eligible = false; // offer expired or revoked
  assert.equal((await bugi.status(USER)).remaining, 0, "back to the free limit");
}));

test("concurrent questions cannot bypass the daily quota (database and in-memory modes)", () => withEnv({ BUGI_GLOBAL_PER_MINUTE: "1000", BUGI_GLOBAL_DAILY_LIMIT: "100000" }, async () => {
  for (const tableReady of [true, false]) {
    quota.resetBugiQuotaForTests();
    const bugi = quota.createBugiQuota(quotaDb({ tableReady }).pool);
    const results = await Promise.allSettled(Array.from({ length: 10 }, async () => {
      const slot = await bugi.reserve(USER);
      await tick();
      await slot.commit();
    }));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 3, tableReady ? "database" : "memory");
    assert.ok(results.filter(result => result.status === "rejected").every(result => result.reason.code === "BUGI_DAILY_LIMIT"));
  }
  quota.resetBugiQuotaForTests();
}));

function withEnv(values, work) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  return Promise.resolve().then(work).finally(() => {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : (process.env[key] = value);
  });
}

test("the shared Gemini budget keeps priority capacity for Bugi-offer students", async () => {
  assert.deepEqual(quota.bugiGlobalLimits(), { daily: 200, perMinute: 8, freeDaily: 40, freePerMinute: 1 }, "defaults");
  const premium = new Set(["p1", "p2", "p3", "p4", "p5", "p6"]);
  const reserveAs = (bugi, id) => bugi.reserve(id).then(slot => slot.commit().then(() => "ok"), error => error.code + ":" + error.scope);

  await withEnv({ BUGI_GLOBAL_PER_MINUTE: "5", BUGI_FREE_SHARE_PERCENT: "60", BUGI_GLOBAL_DAILY_LIMIT: "1000" }, async () => {
    quota.resetBugiQuotaForTests();
    const bugi = quota.createBugiQuota(quotaDb({ eligible: id => premium.has(id) }).pool);
    const results = [];
    for (const id of ["f1", "f2", "f3", "f4", "p1", "p2", "p3"]) results.push(await reserveAs(bugi, id));
    assert.deepEqual(results, ["ok", "ok", "ok", "BUGI_GLOBAL_LIMIT:minute", "ok", "ok", "BUGI_GLOBAL_LIMIT:minute"],
      "free students stop at 60% of the per-minute budget; Bugi students may use the rest");
  });

  await withEnv({ BUGI_GLOBAL_PER_MINUTE: "1000", BUGI_FREE_SHARE_PERCENT: "50", BUGI_GLOBAL_DAILY_LIMIT: "4" }, async () => {
    quota.resetBugiQuotaForTests();
    const bugi = quota.createBugiQuota(quotaDb({ eligible: id => premium.has(id) }).pool);
    const results = [];
    for (const id of ["f1", "f2", "f3", "p1", "p2", "p3"]) results.push(await reserveAs(bugi, id));
    assert.deepEqual(results, ["ok", "ok", "BUGI_GLOBAL_LIMIT:daily", "ok", "ok", "BUGI_GLOBAL_LIMIT:daily"]);
  });

  for (const tableReady of [true, false]) {
    await withEnv({ BUGI_GLOBAL_PER_MINUTE: "3", BUGI_FREE_SHARE_PERCENT: "100", BUGI_GLOBAL_DAILY_LIMIT: "1000" }, async () => {
      quota.resetBugiQuotaForTests();
      const bugi = quota.createBugiQuota(quotaDb({ tableReady }).pool);
      const results = await Promise.all(Array.from({ length: 10 }, (_, index) => reserveAs(bugi, "student-" + index)));
      assert.equal(results.filter(result => result === "ok").length, 3, "parallel students cannot overshoot the platform budget");
    });
  }
  quota.resetBugiQuotaForTests();
});

test("the daily reset follows midnight in Africa/Tunis", () => {
  assert.equal(quota.tunisDay(new Date("2026-11-26T22:59:59Z")), "2026-11-26");
  assert.equal(quota.tunisDay(new Date("2026-11-26T23:00:00Z")), "2026-11-27");
  assert.equal(quota.nextTunisMidnight(new Date("2026-11-26T10:15:30Z")), "2026-11-26T23:00:00.000Z");
});

async function loadAiRoute({ quotaService, gemini }) {
  const routes = new Map();
  const router = {};
  for (const method of ["get", "post", "delete"]) router[method] = (path, ...handlers) => routes.set(`${method} ${path}`, handlers);
  const query = async sql => {
    if (sql.includes("bugi_history_revision::text AS revision FROM users WHERE id = $1 FOR UPDATE")) return { rows: [{ revision: "0" }] };
    if (sql.includes("bugi_history_revision::text AS revision")) return { rows: [{ class: "bac", branch: "informatique", revision: "0" }] };
    if (sql.includes("INSERT INTO bugi_messages")) return { rows: [{ id: "1", role: "student" }, { id: "2", role: "tutor" }] };
    return { rows: [] };
  };
  const db = { query, connect: async () => ({ query, release() {} }) };
  const context = vm.createContext({ console: { warn: (...args) => process.env.DEBUG_AI_ROUTE && console.warn(...args), error: (...args) => process.env.DEBUG_AI_ROUTE && console.error(...args), log() {} }, AbortSignal, fetch: gemini,
    process: { env: { GEMINI_API_KEY: "synthetic-key-never-shown" } } });
  const source = new vm.SourceTextModule(await readFile(new URL("../routes/ai-api.js", import.meta.url), "utf8"), { context });
  const dependencies = {
    "node:crypto": { createHash }, express: { default: { Router: () => router } }, "../config/db.js": { default: db },
    "../services/bugi-character.js": character, "../services/bugi-learning.js": { ...learning, getBugiLearningProfile: async () => { throw new Error("no profile in this test"); } },
    "../services/bugi-provider.js": provider, "../middleware/authRateLimit.js": { authRateLimit: () => (_q, _r, next) => next() },
    "../middleware/requireAuth.js": { authApiMiddleware: (req, res, next) => next() },
    "../middleware/requireAdmin.js": { requireAdmin: (req, res, next) => next() },
    "../services/bugi-quota.js": { createBugiQuota: () => quotaService },
  };
  await source.link(specifier => new vm.SyntheticModule(Object.keys(dependencies[specifier]), function () {
    for (const [name, value] of Object.entries(dependencies[specifier])) this.setExport(name, value);
  }, { context }));
  await source.evaluate();
  return async (path, body) => {
    const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; }, set(name, value) { this.headers[name] = value; }, sendStatus(code) { this.statusCode = code; } };
    const handlers = routes.get(path);
    const run = index => handlers[index]({ user: { id: USER }, query: {}, body }, res, () => run(index + 1));
    await run(0);
    return res;
  };
}

test("the Bugi endpoint refuses over-quota questions before Gemini and never leaks provider details", async () => {
  let geminiCalls = 0;
  const released = [];
  const limitReached = (plan) => ({
    status: async () => ({}),
    reserve: async () => { throw Object.assign(new Error("limit"), { code: "BUGI_DAILY_LIMIT", status: 429,
      quota: { plan, limit: plan === "bugi" ? 15 : 3, used: 3, remaining: 0, resetsAt: new Date(Date.now() + 3600000).toISOString() } }); },
  });
  const gemini = async () => { geminiCalls++; return new Response("{}", { status: 500 }); };

  for (const plan of ["free", "bugi"]) {
    const call = await loadAiRoute({ quotaService: limitReached(plan), gemini });
    const res = await call("post /debug", { question: "Pourquoi mon code plante ?" });
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.code, "BUGI_DAILY_LIMIT");
    assert.equal(res.body.message, plan === "free"
      ? "Vous avez atteint votre limite quotidienne. Profitez de plus de questions avec une offre incluant le tutorat Bugi."
      : "Vous avez atteint votre limite quotidienne. Revenez demain pour continuer avec Bugi !");
  }
  assert.equal(geminiCalls, 0, "Gemini is never called over quota");

  const failing = await loadAiRoute({ gemini, quotaService: {
    status: async () => ({}),
    reserve: async () => ({ quota: { remaining: 2 }, commit: async () => assert.fail("a failed answer must not be counted"), release: async () => released.push(true) }),
  } });
  const res = await failing("post /debug", { question: "Explique-moi les listes" });
  assert.equal(res.statusCode, 503);
  assert.equal(geminiCalls, 1, "Gemini was really called and failed");
  assert.equal(released.length, 1, "the reservation is released when Gemini fails");
  assert.equal(JSON.stringify(res.body).includes("synthetic-key"), false);
  assert.equal(JSON.stringify(res.body).includes("HTTP"), false);

  const busy = await loadAiRoute({ gemini, quotaService: { status: async () => ({}),
    reserve: async () => { throw Object.assign(new Error("budget"), { code: "BUGI_GLOBAL_LIMIT", scope: "minute", retryAfter: 42 }); } } });
  const crowded = await busy("post /debug", { question: "Bonjour" });
  assert.equal(crowded.statusCode, 429);
  assert.equal(crowded.headers["Retry-After"], "42");
  assert.equal(crowded.body.message, "Bugi reçoit beaucoup de questions en ce moment. Réessayez dans une minute.");
  assert.equal(geminiCalls, 1, "the platform budget is checked before Gemini");

  // Gemini free tier exhausted: friendly reply, slot given back, next question refused without reserving.
  let reserves = 0;
  const exhausted = await loadAiRoute({
    gemini: async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
    quotaService: { status: async () => ({}), reserve: async () => { reserves++; return { quota: {}, commit: async () => assert.fail(), release: async () => released.push(true) }; } },
  });
  const first = await exhausted("post /debug", { question: "Question A" });
  assert.equal(first.statusCode, 429);
  assert.equal(first.body.message, character.BUGI_MESSAGES.quota);
  const second = await exhausted("post /debug", { question: "Question B" });
  assert.equal(second.statusCode, 429);
  assert.equal(reserves, 1, "while Gemini is paused no quota is reserved");
  assert.ok(Number(second.headers["Retry-After"]) > 0);
});

// ── PostgreSQL integration (runs only with the project's QA database) ──────

test("real PostgreSQL: migrations, Bugi eligibility, row-lock concurrency, deposits and deletion protection", {
  skip: !process.env.BUGI_QA_POSTGRES_PORT, timeout: 60000,
}, async () => {
  const connection = { host: "127.0.0.1", port: Number(process.env.BUGI_QA_POSTGRES_PORT),
    user: "bugi_qa", password: "bugi-synthetic-local-only", ssl: false };
  const maintenance = new pg.Pool({ ...connection, database: "postgres" });
  const name = "protection_qa_" + randomUUID().replaceAll("-", "");
  let db;
  try {
    await maintenance.query(`CREATE DATABASE "${name}"`);
    db = new pg.Pool({ ...connection, database: name, max: 20 });
    const sql = path => readFile(new URL("../../database/" + path, import.meta.url), "utf8");
    await db.query(await sql("schema_postgres.sql"));
    // The real deploy runner applies every migration in order, including 202611260003/4.
    const databaseUrl = `postgresql://${connection.user}:${connection.password}@127.0.0.1:${connection.port}/${name}`;
    const runner = () => promisify(execFile)(process.execPath, [fileURLToPath(new URL("../scripts/migrate.js", import.meta.url))],
      { env: { ...process.env, DATABASE_URL: databaseUrl, DB_SSL: "false" }, timeout: 60000 });
    await runner();
    const ledger = (await db.query("SELECT filename FROM schema_migrations WHERE filename LIKE '2026112600%' ORDER BY filename")).rows.map(row => row.filename);
    assert.ok(ledger.includes("202611260003_user_account_deactivation.sql") && ledger.includes("202611260004_bugi_daily_usage.sql"));
    const second = await runner();
    assert.doesNotMatch(second.stdout + second.stderr, /\[migrate\] applied:/, "a redeploy applies nothing again");
    // The SQL itself is also safe to repeat.
    await db.query(await sql("migrations/202611260003_user_account_deactivation.sql"));
    await db.query(await sql("migrations/202611260004_bugi_daily_usage.sql"));
    await db.query("ALTER TABLE offers ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'");

    const user = async label => (await db.query("INSERT INTO users(email,password_hash,name) VALUES($1,'x',$1) RETURNING id", [label + "@example.invalid"])).rows[0].id;
    const course = (await db.query("INSERT INTO courses(title) VALUES('Python') RETURNING id")).rows[0].id;
    const offer = async features => {
      const id = (await db.query("INSERT INTO offers(title,fixed_price,features) VALUES('Offre',50,$1) RETURNING id", [JSON.stringify(features)])).rows[0].id;
      await db.query("INSERT INTO offer_courses(offer_id,course_id) VALUES($1,$2)", [id, course]);
      return id;
    };
    const withBugi = await offer([{ key: "bugi", text: "Tutorat Bugi", active: true }]);
    const withoutBugi = await offer([]);
    // Timed grants need a payment origin and a monthly anchor day (existing constraints).
    const grant = async (userId, offerId, starts, expires, revoked = false) => {
      const payment = (await db.query("INSERT INTO payments(user_id,offer_id,amount,status) VALUES($1,$2,50,'timed_wallet_completed') RETURNING id", [userId, offerId])).rows[0].id;
      await db.query(`INSERT INTO offer_access_grants(user_id,offer_id,payment_id,request_id,request_fingerprint,access_mode,monthly_anchor_day,starts_at,expires_at,revoked_at)
        VALUES($1,$2,$3,gen_random_uuid(),repeat('a',64),'monthly',1,NOW()+$4::interval,NOW()+$5::interval,${revoked ? "NOW()" : "NULL"})`, [userId, offerId, payment, starts, expires]);
    };    const eligible = async id => (await db.query(`SELECT ${quota.bugiEligibility("$1")} AS ok`, [id])).rows[0].ok;

    const freeStudent = await user("free");
    const paidOnly = await user("paid-only");
    await db.query("INSERT INTO payments(user_id,offer_id,amount,status) VALUES($1,$2,50,'wallet_completed')", [paidOnly, withBugi]);
    const enrolled = await user("enrolled");
    await db.query("INSERT INTO payments(user_id,offer_id,amount,status) VALUES($1,$2,50,'wallet_completed')", [enrolled, withBugi]);
    await db.query("INSERT INTO enrollments(user_id,course_id,offer_id) VALUES($1,$2,$3)", [enrolled, course, withBugi]);
    const noBugi = await user("no-bugi");
    await db.query("INSERT INTO enrollments(user_id,course_id,offer_id) VALUES($1,$2,$3)", [noBugi, course, withoutBugi]);
    const expired = await user("expired");
    await grant(expired, withBugi, "-40 days", "-1 day");
    const revoked = await user("revoked");
    await grant(revoked, withBugi, "-1 day", "20 days", true);
    const granted = await user("granted");
    await grant(granted, withBugi, "-1 day", "20 days");
    await grant(granted, await offer([{ key: "bugi", active: true }]), "-1 day", "20 days");

    assert.equal(await eligible(freeStudent), false);
    assert.equal(await eligible(paidOnly), false, "a purchase without live access is not enough");
    assert.equal(await eligible(enrolled), true);
    assert.equal(await eligible(noBugi), false);
    assert.equal(await eligible(expired), false);
    assert.equal(await eligible(revoked), false);
    assert.equal(await eligible(granted), true);

    quota.resetBugiQuotaForTests();
    const bugi = quota.createBugiQuota(db);
    assert.equal((await bugi.status(granted)).limit, 15, "two Bugi offers do not add up");
    const parallel = await withEnv({ BUGI_GLOBAL_PER_MINUTE: "1000", BUGI_GLOBAL_DAILY_LIMIT: "100000" }, () =>
      Promise.allSettled(Array.from({ length: 8 }, async () => (await bugi.reserve(freeStudent)).commit())));
    assert.equal(parallel.filter(result => result.status === "fulfilled").length, 3, "row lock holds under real concurrency");

    const depositUser = await user("depositor");
    const results = await Promise.allSettled(Array.from({ length: 9 }, (_, index) =>
      deposits.insertDepositRequest(db, depositUser, deposits.validateDepositInput({ amount: 20 + index, transaction_code: "PG-" + index }), null)));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 5);
    assert.equal((await db.query("SELECT balance FROM users WHERE id=$1", [depositUser])).rows[0].balance, "0.00");

    accountStatus.resetAccountStatusCache();
    await assert.rejects(accountStatus.deleteStudentSafely(db, depositUser), error => error.status === 409);
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM transactions WHERE user_id=$1", [depositUser])).rows[0].n, 5);
    await accountStatus.setStudentActive(db, depositUser, false, null);
    assert.equal(await accountStatus.isAccountActive(db, depositUser), false);
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM transactions WHERE user_id=$1", [depositUser])).rows[0].n, 5, "deactivation keeps records");
    const clean = await user("clean");
    assert.deepEqual(await accountStatus.deleteStudentSafely(db, clean), { deleted: true });

    // Platform-wide daily budget holds across different students in parallel (advisory lock).
    const crowd = await Promise.all(Array.from({ length: 10 }, (_, index) => user("crowd-" + index)));
    const budget = await withEnv({ BUGI_GLOBAL_DAILY_LIMIT: String(4 + 4), BUGI_FREE_SHARE_PERCENT: "100", BUGI_GLOBAL_PER_MINUTE: "1000" }, async () => {
      quota.resetBugiQuotaForTests();
      const shared = quota.createBugiQuota(db);
      return Promise.allSettled(crowd.map(async id => (await shared.reserve(id)).commit()));
    });
    // freeStudent already used 3 of today's platform questions in the row-lock test above.
    const usedBefore = 3;
    assert.equal(budget.filter(result => result.status === "fulfilled").length, 8 - usedBefore);
    assert.ok(budget.filter(result => result.status === "rejected").every(result => result.reason.code === "BUGI_GLOBAL_LIMIT"));

    // A still-valid access token stops working the moment the account is deactivated.
    process.env.JWT_SECRET ??= "synthetic-deactivation-test";
    const jwt = (await import("jsonwebtoken")).default;
    const auth = await import("../middleware/requireAuth.js?pg");
    auth.configureAccountChecks(db);
    const member = await user("member");
    const token = jwt.sign({ id: member, email: "member@example.invalid", role: "user" }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: 3600 });
    const hit = async () => { const res = { cleared: [], status(code) { this.code = code; return this; }, json() { return this; }, clearCookie(name) { this.cleared.push(name); } };
      let passed = false; await auth.authApiMiddleware({ cookies: { synta_access: token } }, res, () => { passed = true; }); return passed ? 200 : res.code; };
    assert.equal(await hit(), 200);
    await accountStatus.setStudentActive(db, member, false, null);
    assert.equal(await hit(), 403);
    auth.configureAccountChecks(null);
  } catch (error) {
    // Report the real failure; dropping the database below would otherwise mask it.
    console.error("[protection_qa] failure:", error);
    throw error;
  } finally {
    db?.on("error", () => {});
    accountStatus.resetAccountStatusCache();
    quota.resetBugiQuotaForTests();
    await db?.end();
    await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => {});
    await maintenance.end();
  }
});
