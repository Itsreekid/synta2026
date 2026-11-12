import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { once } from "node:events";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import pg from "pg";
import {
  amount, nextMonthlyDate, offerTerms, createOfferQuote, buyTimedOffer, createInstallment,
  confirmInstallment, collectInstallment, changeInstallmentDeadline
} from "../services/timed-offers.js";
import { enrollmentAccess, offerEntitlement } from "../utils/offerAccess.js";
import { sendOfferExpiryReminders } from "../services/offer-reminders.js";
import { calendarSuggestions } from "../services/offer-calendar.js";

test("calendar suggestions isolate credentials and accept only grounded dates", async t => {
  const settings = ["GEMINI_API_KEY", "LEARNING_GEMINI_API_KEY", "LEARNING_GEMINI_ENABLED"];
  const original = settings.map(key => process.env[key]);
  t.after(() => settings.forEach((key, index) => {
    if (original[index] === undefined) delete process.env[key];
    else process.env[key] = original[index];
  }));
  process.env.GEMINI_API_KEY = "synthetic-bugi-key";
  process.env.LEARNING_GEMINI_ENABLED = "true";
  delete process.env.LEARNING_GEMINI_API_KEY;
  let stored;
  const db = { async query(sql, params) {
    if (sql.startsWith("SELECT")) return { rows: stored ? [{ suggestions: stored }] : [] };
    assert.match(sql, /^INSERT INTO offer_academic_calendars/);
    stored = params[1];
    return { rows: [] };
  } };
  const responseText = "École\nbac_main=2027-06-09\nclasses_end=2027-06-30";
  const startIndex = Buffer.byteLength("École\nbac_main=");
  const remote = t.mock.method(globalThis, "fetch", async (_url, request) => {
    assert.equal(request.headers["x-goog-api-key"], "synthetic-learning-key");
    assert.deepEqual(JSON.parse(request.body).tools, [{ google_search: {} }]);
    return { ok: true, async json() { return { candidates: [{
      content: { parts: [{ thought: true }, { text: responseText }] },
      groundingMetadata: {
        groundingSupports: [{ segment: { partIndex: 1, startIndex, endIndex: startIndex + 10 }, groundingChunkIndices: [0, 1] }],
        groundingChunks: [
          { web: { uri: "https://example.invalid/calendar", title: "Synthetic calendar" } },
          { web: { uri: "javascript:ignored" } }
        ]
      }
    }] }; } };
  });
  await assert.rejects(calendarSuggestions(db, 2026), { status: 503 });
  process.env.LEARNING_GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  await assert.rejects(calendarSuggestions(db, 2026), { status: 503 });
  assert.equal(remote.mock.callCount(), 0);
  process.env.LEARNING_GEMINI_API_KEY = "synthetic-learning-key";
  assert.deepEqual((await calendarSuggestions(db, 2026)).dates, { bac_main: "2027-06-09" });
  assert.equal(stored.sources.length, 1);
  assert.equal((await calendarSuggestions(db, 2026)).cached, true);
  process.env.LEARNING_GEMINI_ENABLED = "false";
  await assert.rejects(calendarSuggestions(db, 2026, true), { status: 503 });
  assert.equal(remote.mock.callCount(), 1);
});

test("monthly anchors clamp in short months without drifting on continuous renewal", () => {
  for (const day of [29, 30, 31]) {
    assert.equal(nextMonthlyDate(`2027-01-${day}`, day), "2027-02-28");
    assert.equal(nextMonthlyDate("2027-02-28", day), `2027-03-${day}`);
    assert.equal(nextMonthlyDate(`2028-01-${day}`, day), "2028-02-29");
  }
  assert.equal(nextMonthlyDate("2026-12-31", 31), "2027-01-31");
  assert.equal(amount("10.1"), "10.10");
  assert.throws(() => amount("0.001"), { status: 400 });
  assert.throws(() => amount(0.1 + 0.2), { status: 400 });
  assert.throws(() => offerTerms({ access_mode: "academic_year", academic_year_start: 2026,
    access_cutoff_date: "2027-09-01", fixed_price: "10" }), { status: 400 });
});

test("timed offers on disposable PostgreSQL", { skip: !process.env.BUGI_QA_POSTGRES_PORT, timeout: 60000 }, async t => {
  const connection = { host: "127.0.0.1", port: Number(process.env.BUGI_QA_POSTGRES_PORT),
    user: "bugi_qa", password: "bugi-synthetic-local-only", ssl: false, connectionTimeoutMillis: 5000 };
  const name = "timed_qa_" + randomUUID().replaceAll("-", "");
  const maintenance = new pg.Pool({ ...connection, database: "postgres" });
  let db;
  let routePool;
  const settingNames = ["JWT_SECRET", "TIMED_OFFER_SALES_ENABLED", "DATABASE_URL", "DB_SSL"];
  const settings = Object.fromEntries(settingNames.map(key => [key, process.env[key]]));
  try {
    await maintenance.query('CREATE DATABASE "' + name + '"');
    db = new pg.Pool({ ...connection, database: name });
    await db.query(await readFile(new URL("../../database/schema_postgres.sql", import.meta.url), "utf8"));
    const user = async (label, role = "user") => (await db.query(
      "INSERT INTO users(email,password_hash,name,role,balance) VALUES($1,'synthetic',$2,$3,300) RETURNING id",
      [label + "@example.invalid", label, role])).rows[0].id;
    const learner = await user("student");
    const second = await user("second");
    const admin = await user("admin", "admin");
    const course = (await db.query("INSERT INTO courses(title) VALUES('Synthetic') RETURNING id")).rows[0].id;
    const legacy = (await db.query("INSERT INTO offers(title,fixed_price) VALUES('Legacy',10) RETURNING id")).rows[0].id;
    await db.query("INSERT INTO enrollments(user_id,course_id,offer_id,progress) VALUES($1,$2,$3,42)", [second, course, legacy]);
    await db.query("INSERT INTO payments(user_id,amount,status) VALUES($1,10,'pending')", [second]);
    const databaseUrl = `postgresql://${connection.user}:${connection.password}@127.0.0.1:${connection.port}/${name}`;
    const run = () => promisify(execFile)(process.execPath, [fileURLToPath(new URL("../scripts/migrate.js", import.meta.url))], {
      env: { ...process.env, DATABASE_URL: databaseUrl, DB_SSL: "false" }, timeout: 15000
    });
    assert.match((await run()).stdout, /applied: 202611110004_add_timed_offer_access/);
    assert.match((await run()).stdout, /already applied: 202611110004_add_timed_offer_access/);
    assert.equal((await db.query("SELECT progress FROM enrollments WHERE user_id=$1", [second])).rows[0].progress, "42.00");
    assert.equal((await db.query("SELECT offer_id FROM payments WHERE user_id=$1", [second])).rows[0].offer_id, null);
    process.env.JWT_SECRET = "disposable-test-only";
    process.env.TIMED_OFFER_SALES_ENABLED = "true";

    const makeOffer = async (mode, minimum = null) => {
      const { rows: [offer] } = await db.query(`WITH term AS (
          SELECT (NOW() AT TIME ZONE 'Africa/Tunis')::date + 10 AS cutoff)
        INSERT INTO offers(title,fixed_price,access_mode,academic_year_start,access_cutoff_date,minimum_initial_payment)
        SELECT 'Synthetic timed', '30.10', $1,
          CASE WHEN $1='academic_year' THEN EXTRACT(YEAR FROM cutoff)::int-(EXTRACT(MONTH FROM cutoff)<9)::int END,
          CASE WHEN $1='academic_year' THEN cutoff END, $2 FROM term RETURNING id`, [mode, minimum]);
      await db.query("INSERT INTO offer_courses(offer_id,course_id) VALUES($1,$2)", [offer.id, course]);
      return offer.id;
    };
    const monthly = await makeOffer("monthly");
    const annual = await makeOffer("academic_year", "10.10");
    const requestFor = (id, quote) => ({ offerId: id, quote: quote.quote, requestId: quote.requestId });
    const count = async (sql, args) => Number((await db.query(sql, args)).rows[0].count);
    const balance = async id => (await db.query("SELECT balance FROM users WHERE id=$1", [id])).rows[0].balance;
    const access = async id => (await db.query(
      `SELECT ${enrollmentAccess("e")} AS allowed FROM enrollments e WHERE user_id=$1 AND course_id=$2`, [id, course])).rows[0].allowed;

    await t.test("concurrent checkout, renewal and duplicate requests charge once", async () => {
      const quote = await createOfferQuote(db, learner, monthly);
      await assert.rejects(buyTimedOffer(db, second, requestFor(monthly, quote)), { status: 400 });
      const competing = await createOfferQuote(db, learner, monthly);
      const results = await Promise.all([
        buyTimedOffer(db, learner, requestFor(monthly, quote)),
        buyTimedOffer(db, learner, requestFor(monthly, quote))
      ]);
      assert.equal(results[0].grantId, results[1].grantId);
      await assert.rejects(buyTimedOffer(db, learner, requestFor(monthly, competing)), { status: 409 });
      assert.equal(await balance(learner), "269.90");
      const renewal = await createOfferQuote(db, learner, monthly);
      await Promise.all([1, 2].map(() => buyTimedOffer(db, learner, requestFor(monthly, renewal))));
      assert.equal(await balance(learner), "239.80");
      await assert.rejects(createOfferQuote(db, learner, monthly), { status: 409 });
      assert.equal(await count("SELECT COUNT(*) FROM offer_access_grants WHERE user_id=$1", [learner]), 2);
    });

    await t.test("drafts, initial payment, collections and overlapping access", async () => {
      const draft = await createInstallment(db, learner, annual, admin);
      assert.equal(await count("SELECT COUNT(*) FROM offer_access_grants WHERE offer_id=$1", [annual]), 0);
      assert.equal(await balance(learner), "239.80");
      const initial = { amount: "10.10", source: "external", externalConfirmed: true, requestId: randomUUID() };
      await assert.rejects(confirmInstallment(db, second, draft.id, admin, initial), { status: 404 });
      await assert.rejects(confirmInstallment(db, learner, draft.id, admin, { ...initial, amount: "10.09" }), { status: 400 });
      const confirmed = await Promise.all([1, 2].map(() => confirmInstallment(db, learner, draft.id, admin, initial)));
      assert.equal(confirmed[0].grantId, confirmed[1].grantId);
      const saved = (await db.query(`SELECT g.granted_by,g.granted_at,
        (g.expires_at AT TIME ZONE 'Africa/Tunis')::text AS local_expiry,
        a.next_due_date,a.quoted_price-a.paid_total AS remaining
        FROM offer_access_grants g JOIN offer_installment_arrangements a ON a.grant_id=g.id
        WHERE g.id=$1`, [confirmed[0].grantId])).rows[0];
      assert.equal(saved.granted_by, admin);
      assert.ok(saved.granted_at);
      assert.match(saved.local_expiry, /00:00:00$/);
      assert.equal(saved.next_due_date, null);
      assert.equal(saved.remaining, "20.00");
      await changeInstallmentDeadline(db, learner, draft.id, admin, { nextDueDate: "2020-01-01", reason: "Synthetic overdue", requestId: randomUUID() });
      assert.equal(await access(learner), true);
      await db.query("UPDATE offers SET is_active=false WHERE id=$1", [annual]);
      assert.equal(await access(learner), true);
      await db.query("UPDATE offer_access_grants SET starts_at=NOW()-interval '2 days',expires_at=NOW()-interval '1 day' WHERE id=$1", [confirmed[0].grantId]);
      const extra = { amount: "20.00", source: "external", externalConfirmed: true, requestId: randomUUID() };
      await Promise.all([1, 2].map(() => collectInstallment(db, learner, draft.id, admin, extra)));
      assert.equal(await count("SELECT COUNT(*) FROM offer_installment_payments WHERE arrangement_id=$1", [draft.id]), 2);
      assert.equal(await access(learner), true);
      const { rows: [scoped] } = await db.query(`SELECT ${offerEntitlement("$1","$2","$3")} AS allowed`, [learner, annual, course]);
      assert.equal(scoped.allowed, false);
      await db.query("UPDATE offer_access_grants SET revoked_at=NOW() WHERE user_id=$1 AND offer_id=$2", [learner, monthly]);
      assert.equal(await access(learner), false);
      assert.equal(await access(second), true);
    });

    await t.test("HTTP checkout, history isolation and admin offer settings", async () => {
      process.env.DATABASE_URL = databaseUrl;
      process.env.DB_SSL = "false";
      routePool = (await import("../config/db.js")).default;
      const app = express();
      app.use(express.json(), cookieParser());
      app.use((await import("../routes/timed-offers.js")).default);
      app.use((await import("../routes/admin-api.js")).default);
      app.post("/api/purchase/offer", (_req, res) => res.sendStatus(204));
      const server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      const call = (path, { id, role = "user", body } = {}) => fetch(
        `http://127.0.0.1:${server.address().port}${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...(id && { Cookie: "synta_access=" + jwt.sign({ id, role, email: "synthetic@example.invalid" }, process.env.JWT_SECRET) })
          },
          body: JSON.stringify(body)
        });
      try {
        const offerId = await makeOffer("monthly");
        const quotePath = "/api/purchase/offer/quote";
        assert.equal((await call(quotePath, { body: { offerId } })).status, 401);
        const edit = { id: offerId, title: "Edited monthly", fixed_price: "30.10", is_active: true, access_mode: "monthly" };
        assert.equal((await call("/api/admin/offers", { id: learner, body: edit })).status, 403);
        const saved = await call("/api/admin/offers", { id: admin, role: "admin", body: edit });
        assert.equal(saved.status, 200, await saved.text());
        const quoted = await call(quotePath, { id: learner, body: { offerId } });
        assert.equal(quoted.status, 200);
        const quote = await quoted.json();
        assert.equal((await call("/api/purchase/offer", { id: learner, body: requestFor(offerId, quote) })).status, 200);
        const history = "/api/purchase/offer/history";
        assert.ok((await (await call(history, { id: learner })).json()).purchases.some(p => p.title === edit.title && p.expires_at));
        assert.deepEqual((await (await call(history, { id: second })).json()).purchases, []);
        assert.equal((await call("/api/purchase/offer", { id: second, body: { offerId: legacy } })).status, 204);
      } finally {
        const closed = once(server, "close");
        server.close();
        server.closeAllConnections();
        await closed;
      }
    });

    await t.test("rollback after debit and one reminder under concurrent workers", async () => {
      const offer = await makeOffer("academic_year");
      const quote = await createOfferQuote(db, learner, offer);
      const request = requestFor(offer, quote);
      const before = await balance(learner);
      await db.query("ALTER TABLE offer_access_grants ADD CONSTRAINT synthetic_failure CHECK (false) NOT VALID");
      await assert.rejects(buyTimedOffer(db, learner, request), { code: "23514" });
      assert.equal(await balance(learner), before);
      assert.equal(await count("SELECT COUNT(*) FROM payments WHERE offer_id=$1", [offer]), 0);
      await db.query("ALTER TABLE offer_access_grants DROP CONSTRAINT synthetic_failure");
      const grant = await buyTimedOffer(db, learner, request);
      await db.query("UPDATE offer_access_grants SET expires_at=NOW()+interval '2 days' WHERE id=$1", [grant.grantId]);
      await Promise.all([sendOfferExpiryReminders(db), sendOfferExpiryReminders(db)]);
      assert.equal(await count("SELECT COUNT(*) FROM notifications WHERE offer_access_grant_id=$1", [grant.grantId]), 1);
      process.env.TIMED_OFFER_SALES_ENABLED = "false";
      await assert.rejects(createOfferQuote(db, learner, offer), { status: 503 });
      assert.equal(await access(learner), true);
    });
  } finally {
    if (routePool) await routePool.end();
    for (const key of settingNames) {
      if (settings[key] === undefined) delete process.env[key];
      else process.env[key] = settings[key];
    }
    if (db) {
      await db.end();
      await maintenance.query('DROP DATABASE "' + name + '"');
    }
    await maintenance.end();
  }
});
