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
import { withTimedOfferBrowser } from "./timed-offer-browser.js";
import { installmentBreakdown, saveUpgradePolicy, quoteOfferUpgrade, confirmOfferUpgrade, correctUpgradeClaim } from "../services/offer-upgrades.js";
import pg from "pg";
import {
  amount, nextMonthlyDate, offerTerms, createOfferQuote, buyTimedOffer, createInstallment,
  confirmInstallment, collectInstallment, changeInstallmentDeadline, reverseInstallmentPayment
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
  const source = "https://example.com/school-calendar";
  const remote = t.mock.method(globalThis, "fetch", async (_url, request) => {
    assert.equal(request.headers["x-goog-api-key"], "synthetic-learning-key");
    assert.deepEqual(JSON.parse(request.body).tools, [{ url_context: {} }]);
    assert.match(JSON.parse(request.body).contents[0].parts[0].text, /2026\/2027/);
    return { ok: true, async json() { return { candidates: [{
      content: { parts: [{ thought: true }, { text: "bac_main=2027-06-09\nclasses_end=2028-06-30" }] },
      urlContextMetadata: { urlMetadata: [{
        retrievedUrl: source, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS"
      }] }
    }] }; } };
  });
  await assert.rejects(calendarSuggestions(db, 2026, false, source), { status: 503 });
  process.env.LEARNING_GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  await assert.rejects(calendarSuggestions(db, 2026, false, source), { status: 503 });
  assert.equal(remote.mock.callCount(), 0);
  process.env.LEARNING_GEMINI_API_KEY = "synthetic-learning-key";
  assert.deepEqual((await calendarSuggestions(db, 2026, false, source)).dates, { bac_main: "2027-06-09" });
  assert.equal(stored.sources.length, 1);
  assert.equal((await calendarSuggestions(db, 2026, false, source)).cached, true);
  remote.mock.mockImplementation(async () => ({ status: 429 }));
  const fallback = await calendarSuggestions(db, 2026, true, source);
  assert.equal(fallback.refresh_limited, true);
  assert.deepEqual(fallback.dates, stored.dates);
  stored = undefined;
  await assert.rejects(calendarSuggestions(db, 2026, false, source), { status: 429 });
  process.env.LEARNING_GEMINI_ENABLED = "false";
  await assert.rejects(calendarSuggestions(db, 2026, true, source), { status: 503 });
  assert.equal(remote.mock.callCount(), 3);
});

test("monthly boundaries include short-month final days and preserve the nominal anchor", () => {
  for (const day of [29, 30, 31]) {
    assert.equal(nextMonthlyDate(`2027-01-${day}`, day), "2027-03-01");
    assert.equal(nextMonthlyDate("2027-02-01", day), `2027-03-${day}`);
    assert.equal(nextMonthlyDate(`2028-01-${day}`, day), day === 29 ? "2028-02-29" : "2028-03-01");
  }
  assert.equal(nextMonthlyDate("2026-12-31", 31), "2027-01-31");
  assert.equal(amount("10.1"), "10.10");
  assert.throws(() => amount("0.001"), { status: 400 });
  assert.throws(() => amount(0.1 + 0.2), { status: 400 });
  assert.throws(() => offerTerms({ access_mode: "academic_year", academic_year_start: 2026,
    access_cutoff_date: "2027-09-01", fixed_price: "10" }), { status: 400 });
});

test("upgrade cent allocation and initial minimum follow the agreed examples", () => {
  const examples = [
    ["100.00", "46.67", ["0.00", "146.67", "146.66"]],
    ["180.00", "0.00", ["0.00", "113.34", "146.66"]],
    ["300.00", "0.00", ["0.00", "0.00", "140.00"]]
  ];
  for (const [credit, due, remaining] of examples) {
    const result = installmentBreakdown("440.00", 3, null, credit);
    assert.equal(result.dueNow, due);
    assert.deepEqual(result.schedule.map(row => row.amount), ["146.67", "146.67", "146.66"]);
    assert.deepEqual(result.schedule.map(row => row.remaining), remaining);
  }
  assert.equal(installmentBreakdown("440.00", 3, "160.00", "100.00").dueNow, "60.00");
  assert.equal(installmentBreakdown("440.00", 1, null, "180.00").dueNow, "260.00");
  assert.equal(installmentBreakdown("440.00", 2, null, "180.00").dueNow, "40.00");
  assert.throws(() => installmentBreakdown("440.00", 3, null, "440.01"), { status: 409 });
});

test("timed offers on disposable PostgreSQL", { skip: !process.env.BUGI_QA_POSTGRES_PORT, timeout: 60000 }, async t => {
  const connection = { host: "127.0.0.1", port: Number(process.env.BUGI_QA_POSTGRES_PORT),
    user: "bugi_qa", password: "bugi-synthetic-local-only", ssl: false, connectionTimeoutMillis: 5000 };
  const name = "timed_qa_" + randomUUID().replaceAll("-", "");
  const maintenance = new pg.Pool({ ...connection, database: "postgres" });
  let db;
  let routePool;
  const settingNames = ["JWT_SECRET", "TIMED_OFFER_SALES_ENABLED", "TIMED_OFFER_UPGRADES_ENABLED", "DATABASE_URL", "DB_SSL",
    "CLOUDFLARE_ACCOUNT_ID", "R2_ACCESS_KEY", "R2_SECRET_KEY", "R2_BUCKET", "SIGNED_URL_EXPIRY"];
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
    const repeatedMigration = (await run()).stdout;
    assert.match(repeatedMigration, /already applied: 202611110004_add_timed_offer_access/);
    assert.match(repeatedMigration, /already applied: 202611120001_reconcile_timed_offer_terms/);
    assert.match(repeatedMigration, /already applied: 202611120002_offer_upgrade_credit/);
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

    await t.test("historical receipt deduplication and reversal preserve wallet and coverage", async () => {
      const offer = await makeOffer("monthly", "10.10");
      const draft = await createInstallment(db, learner, offer, admin);
      const competing = await createInstallment(db, second, offer, admin);
      const old = { amount: "10.10", source: "external", externalConfirmed: true, requestId: randomUUID(),
        paidOn: "2024-01-30", coverageStart: "2024-01-31", receiptReference: "BANK-SYNTHETIC-1" };
      const before = [await balance(learner), await balance(second)];
      const results = await Promise.allSettled([
        confirmInstallment(db, learner, draft.id, admin, old),
        confirmInstallment(db, second, competing.id, admin, { ...old, receiptReference: "bank-synthetic-1", requestId: randomUUID() })
      ]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(results.find(result => result.status === "rejected").reason.status, 409);
      const winner = results[0].status === "fulfilled" ? { user: learner, draft } : { user: second, draft: competing };
      const { rows: [entry] } = await db.query(`SELECT p.id,p.external_paid_on::text,p.recorded_by,
         (g.expires_at AT TIME ZONE 'Africa/Tunis')::text AS expiry,g.monthly_boundary_month::text AS nominal
         FROM offer_installment_payments p JOIN offer_installment_arrangements a ON a.id=p.arrangement_id
         JOIN offer_access_grants g ON g.id=a.grant_id WHERE a.id=$1`, [winner.draft.id]);
      assert.equal(entry.external_paid_on, old.paidOn);
      assert.equal(entry.recorded_by, admin);
      assert.equal(entry.expiry, "2024-03-01 00:00:00");
      assert.equal(entry.nominal, "2024-02-01");
      const reversal = { requestId: randomUUID(), reason: "Synthetic incorrect receipt" };
      const [first, replay] = await Promise.all([1, 2].map(() =>
        reverseInstallmentPayment(db, winner.user, winner.draft.id, entry.id, admin, reversal)));
      assert.equal(first.reversalId, replay.reversalId);
      await assert.rejects(reverseInstallmentPayment(db, winner.user, winner.draft.id, entry.id, admin,
        { ...reversal, reason: "Conflicting reason" }), { status: 409 });
      const { rows: [state] } = await db.query(`SELECT a.paid_total,p.amount,(g.expires_at AT TIME ZONE 'Africa/Tunis')::text AS expiry
        FROM offer_installment_arrangements a JOIN offer_installment_payments p ON p.arrangement_id=a.id
        JOIN offer_access_grants g ON g.id=a.grant_id WHERE a.id=$1`, [winner.draft.id]);
      assert.deepEqual(state, { paid_total: "0.00", amount: "10.10", expiry: entry.expiry });
      assert.deepEqual([await balance(learner), await balance(second)], before);
    });

    await t.test("HTTP checkout, history isolation and admin offer settings", async httpTest => {
      process.env.DATABASE_URL = databaseUrl;
      process.env.DB_SSL = "false";
      Object.assign(process.env, { CLOUDFLARE_ACCOUNT_ID: "0".repeat(32),
        R2_ACCESS_KEY: "synthetic-key", R2_SECRET_KEY: "synthetic-secret",
        R2_BUCKET: "synthetic-video-test", SIGNED_URL_EXPIRY: "300" });
      routePool = (await import("../config/db.js")).default;
      const app = express();
      app.use(express.json(), cookieParser());
      if (process.env.TIMED_QA_CHROME) {
        app.set("view engine", "ejs");
        app.set("views", fileURLToPath(new URL("../views", import.meta.url)));
        app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
        app.use((await import("../routes/user-api.js")).default);
        app.use("/api/offers", (await import("../routes/offers.js")).default);
        app.use("/api/enrollment", (await import("../routes/enrollment.js")).default);
        app.use("/api/courses", (await import("../routes/courses.js")).default);
        app.use("/api/live", (await import("../routes/live.js")).default);
        app.use((await import("../routes/pages.js")).default);
      }
      app.use((await import("../routes/timed-offers.js")).default);
      app.use((await import("../routes/admin-api.js")).default);
      app.use("/api/content", (await import("../routes/content.js")).default);
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
        const invalidMinimum = await call("/api/admin/offers", { id: admin, role: "admin",
          body: { ...edit, minimum_initial_payment: "149.00" } });
        assert.equal(invalidMinimum.status, 400);
        assert.match((await invalidMinimum.json()).error, /inférieure ou égale au prix/);
        const quoted = await call(quotePath, { id: learner, body: { offerId } });
        assert.equal(quoted.status, 200);
        const quote = await quoted.json();
        const stats = async () => (await call("/api/admin/overview-stats", { id: admin, role: "admin" })).json();
        await db.query("INSERT INTO purchases(user_id,course_id,amount,payment_status) VALUES($1,$2,12.25,'completed')", [second, course]);
        const initialFinance = await stats();
        assert.equal(initialFinance.success, true);
        assert.equal(initialFinance.sales_collected, "90.30");
        assert.equal(initialFinance.installment_outstanding, "30.10");
        assert.equal(initialFinance.legacy_purchases, "12.25");
        await db.query("INSERT INTO transactions(user_id,amount,type,status) VALUES($1,7.50,'deposit','completed')", [second]);
        const funded = await stats();
        assert.equal(funded.wallet_funding, "7.50");
        assert.equal(funded.sales_collected, initialFinance.sales_collected);
        assert.equal((await call("/api/purchase/offer", { id: learner, body: requestFor(offerId, quote) })).status, 200);
        const purchased = await stats();
        assert.equal(Math.round(Number(purchased.sales_collected) * 100) - Math.round(Number(funded.sales_collected) * 100), 3010);
        assert.equal(purchased.wallet_funding, funded.wallet_funding);
        assert.equal(purchased.installment_outstanding, funded.installment_outstanding);
        const history = "/api/purchase/offer/history";
        assert.ok((await (await call(history, { id: learner })).json()).purchases.some(p => p.title === edit.title && p.expires_at));
        assert.ok((await (await call(history, { id: second })).json()).purchases.every(p => p.title !== edit.title));
        assert.equal((await call("/api/purchase/offer", { id: second, body: { offerId: legacy } })).status, 204);
        await httpTest.test("protected video signing checks current access and disables response caching", async () => {
          const { rows: [lesson] } = await db.query(`
            WITH chapter AS (INSERT INTO modules(course_id,title) VALUES($1,'Protected fixture') RETURNING id),
              link AS (INSERT INTO course_modules(course_id,module_id) SELECT $1,id FROM chapter RETURNING module_id)
            INSERT INTO lessons(module_id,title,type,video_key,is_preview)
            SELECT module_id,'Protected recording','video','lesson-videos/fixture/test.mp4',false FROM link RETURNING id`, [course]);
          const path = "/api/content/lesson/" + lesson.id;
          const outsider = await user("video-outsider");
          const viewer = await user("video-viewer");
          assert.equal((await call(path)).status, 401);
          assert.equal((await call(path, { id: outsider })).status, 403);
          assert.equal((await call(path + "/resources")).status, 401);
          assert.equal((await call(path + "/resources", { id: outsider })).status, 403);
          const initial = await buyTimedOffer(db, viewer, requestFor(offerId, await createOfferQuote(db, viewer, offerId)));
          const media = await call(path, { id: viewer });
          assert.equal(media.status, 200);
          assert.equal(media.headers.get("cache-control"), "private, no-store");
          const url = new URL((await media.json()).videoUrl);
          assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
          const alternative = await makeOffer("monthly");
          const replacementQuote = await createOfferQuote(db, viewer, alternative);
          const replacement = await buyTimedOffer(db, viewer, requestFor(alternative, replacementQuote));
          await db.query("UPDATE offer_access_grants SET starts_at=NOW()-interval '2 days', expires_at=NOW()-interval '1 day' WHERE id=$1", [initial.grantId]);
          assert.equal((await call(path, { id: viewer })).status, 200);
          await db.query("UPDATE offer_access_grants SET starts_at=NOW()-interval '2 days', expires_at=NOW()-interval '1 day' WHERE id=$1", [replacement.grantId]);
          assert.equal((await call(path, { id: viewer })).status, 403);
          assert.equal((await call(path, { id: second })).status, 200);
        });
        if (process.env.TIMED_QA_CHROME) {
          await httpTest.test("desktop and mobile Chrome checkout, renewal, wallet and finance views", async () => {
            const annualId = await makeOffer("academic_year");
            await db.query("UPDATE offers SET title='Browser annual' WHERE id=$1", [annualId]);
            const historic = await makeOffer("monthly", "10.10");
            const duplicate = await makeOffer("monthly", "10.10");
            const testStudent = await user("browser-installment");
            const token = (id, role) => jwt.sign({ id, role, email: "synthetic@example.invalid" }, process.env.JWT_SECRET);
            await withTimedOfferBrowser(process.env.TIMED_QA_CHROME, "http://127.0.0.1:" + server.address().port,
              async ({ open, evaluate, until, errors, screenshot }) => {
                const studentToken = token(learner, "user");
                if (process.env.TIMED_QA_SCREENSHOTS) {
                  for (const width of [390, 768, 1440]) {
                    await open("/app/offers", studentToken, width);
                    await until(() => evaluate("document.querySelectorAll('.offer-card').length > 1"), "offers screenshot");
                    await screenshot(process.env.TIMED_QA_SCREENSHOTS + "-" + width + ".png");
                  }
                }
                for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
                  await open("/app/offers", studentToken, width);
                  await until(() => evaluate("document.querySelector('.offer-card')"), "responsive catalog");
                  const layout = await evaluate(`(async () => {
                    const original = window.fetch;
                    const arabic = 'شرح تمارين طويلة في البرمجة والخوارزميات مع تصحيح الأمثلة خطوة بخطوة';
                    const cases = [
                      {id:'owned',title:'Offre déjà possédée',fixed_price:'180.00',access_mode:'monthly',
                       timed_sales_enabled:true,is_purchased:true,features:[{text:'Python',active:true}]},
                      {id:'featured',title:'عرض البرمجة المتقدم · Bac informatique',fixed_price:'440.25',
                       discount_percentage:'150.50',access_mode:'academic_year',timed_sales_enabled:true,
                       scheduled_checkout_enabled:true,upgrades_enabled:true,is_best_seller:true,installment_max:3,
                       academic_year_start:2026,access_cutoff_date:'2027-06-09',
                       features:Array.from({length:16},(_,i)=>({text:i===0?arabic:arabic+' · Révision Python '+i,active:i%2===0}))},
                      {id:'short',title:'Pro · Révision',fixed_price:'100.00',features:[{text:'Révision et exercices',active:false}]},
                      {id:'inactive',title:'Offre indisponible',fixed_price:'90.00',access_mode:'monthly',timed_sales_enabled:false},
                      {id:'purchase',title:'Offre disponible',fixed_price:'20.00',can_purchase:true,access_mode:'monthly',timed_sales_enabled:true},
                      {id:'renew',title:'Python mensuel',fixed_price:'60',can_purchase:true,can_renew:true,is_purchased:true,access_mode:'monthly',timed_sales_enabled:true},
                      {id:'annual-two',title:'Bac en deux paiements',fixed_price:'440',access_mode:'academic_year',timed_sales_enabled:true,scheduled_checkout_enabled:true,installment_max:2},
                      {id:'annual-one',title:'Bac paiement intégral',fixed_price:'440',access_mode:'academic_year',timed_sales_enabled:true,scheduled_checkout_enabled:true,installment_max:1,can_purchase:true}
                    ];
                    window.fetch = (url,...args) => url==='/api/offers' ?
                      Promise.resolve(new Response(JSON.stringify({offers:cases,userBalance:80}))) : original(url,...args);
                    try { await initOffers(); } finally { window.fetch=original; }
                    const cards=[...document.querySelectorAll('.offer-card')];
                    const features=cards[1].querySelector('.features-section');
                    const body=document.getElementById('main-section');
                    const action = cards.map(card=>card.querySelector('.acheter-btn').textContent.trim());
                    return {
                      count:cards.length, allVisible:cards.every(card=>card.getBoundingClientRect().width>0),
                      horizontalOverflow:body.scrollWidth>body.clientWidth+1,
                      cardOverflow:cards.some(card=>card.scrollWidth>card.clientWidth+1),
                      featureCount:features.children.length, featureScroll:getComputedStyle(features).overflowY,
                      featureClipped:features.scrollHeight>features.clientHeight+1,
                      rtl:getComputedStyle(features.querySelector('.feature-text')).direction,
                      featured:cards.filter(card=>card.classList.contains('featured')).length,
                      badges:document.querySelectorAll('.discount-badge').length,
                      labels:action, disabled:cards.map(card=>card.querySelector('.acheter-btn').disabled),
                      terms: cards[1].querySelector('.validity-box').textContent === 'Abonnement annuel 2026/2027',
                      namesHidden: cards.every((card,index)=>!card.textContent.includes(cases[index].title)),
                      monthlyTerms: cards[4].textContent.includes('DT / mois') && cards[5].textContent.includes('Renouvellement manuel')
                    };
                  })()`);
                  assert.deepEqual(layout, {
                    count: 8, allVisible: true, horizontalOverflow: false, cardOverflow: false,
                    featureCount: 16, featureScroll: "visible", featureClipped: false, rtl: "rtl",
                    featured: 1, badges: 1,
                    labels: ["Déjà possédé", "Passer à cette offre", "Solde insuffisant", "Indisponible", "Acheter", "Renouvellement", "Choisir mon paiement", "Acheter"],
                    disabled: [true, false, true, true, false, false, false, false],
                    terms: true, namesHidden: true, monthlyTerms: true
                  }, "layout at " + width + "px");
                  if (process.env.TIMED_QA_SCREENSHOTS && [390, 1440].includes(width)) {
                    for (const [index, type] of [[4, 'monthly'], [1, 'annual'], [2, 'legacy']]) {
                      await evaluate(`document.querySelectorAll('.offer-card')[${index}].scrollIntoView({block:'start',behavior:'instant'})`);
                      await screenshot(process.env.TIMED_QA_SCREENSHOTS + '-' + type + '-' + width + '.png');
                    }
                  }
                }
                for (const [width, title, label] of [[1280, edit.title, "Renouvellement"], [390, "Browser annual", "Acheter"]]) {
                  const selectedId = width < 500 ? annualId : offerId;
                  const expected = await createOfferQuote(db, learner, selectedId);
                  await open("/app/offers", studentToken, width);
                  assert.equal(await evaluate("innerWidth"), width);
                  try {
                    await until(() => evaluate(`[...document.querySelectorAll('.offer-card')].some(c => c.dataset.offerId === ${JSON.stringify(selectedId)})`), title);
                  } catch (error) {
                    throw new Error(error.message + " | " + JSON.stringify(await evaluate(
                      "({text:document.querySelector('#offers-list')?.textContent.slice(0,250), js:typeof initOffers, urls:[...document.scripts].map(x=>x.src).filter(Boolean)})")) + " | " + errors.join(" | "));
                  }
                  const clicked = await evaluate(`(() => {
                    const cards = [...document.querySelectorAll('.offer-card')];
                    const index = cards.findIndex(c => c.dataset.offerId === ${JSON.stringify(selectedId)});
                    if (${width} < 500) for (let i=0; i<index; i++) document.getElementById('nav-next-btn').click();
                    const button = cards[index].querySelector('.acheter-btn');
                    if (button.disabled || !button.textContent.includes(${JSON.stringify(label)})) return false;
                    button.click();
                    return true;
                  })()`);
                  assert.equal(clicked, true);
                  if (width >= 500) {
                    await until(() => evaluate("document.querySelector('dialog [data-price]')?.textContent"), "renewal amount");
                    assert.equal(await evaluate("document.querySelector('dialog [data-price]').textContent"), expected.price + ' DT');
                    await evaluate("document.querySelector('dialog [data-wallet]').click()");
                  }
                  const confirmation = await until(() => evaluate("window.lastConfirmation || ''"), "checkout confirmation");
                  assert.match(confirmation, /Fin d’accès.*Tunis/);
                  const formattedExpiry = new Intl.DateTimeFormat("fr-FR", {
                    timeZone: "Africa/Tunis", dateStyle: "long", timeStyle: "short"
                  }).format(new Date(expected.expires_at));
                  assert.ok(confirmation.includes(formattedExpiry));
                  assert.match(confirmation, width < 500 ? /Année scolaire.*jour\(s\).*inclus/s : /accès inclut son dernier jour/);
                  await until(async () => Number((await db.query(
                    "SELECT count(*) FROM offer_access_grants WHERE user_id=$1 AND offer_id=$2",
                    [learner, width < 500 ? annualId : offerId])).rows[0].count) === (width < 500 ? 1 : 2), "committed purchase");
                }
                const expiredId = await makeOffer("monthly");
                await db.query("UPDATE offers SET title='Browser expired' WHERE id=$1", [expiredId]);
                const old = await buyTimedOffer(db, learner, requestFor(expiredId, await createOfferQuote(db, learner, expiredId)));
                await db.query("UPDATE offer_access_grants SET starts_at=NOW()-interval '2 months', expires_at=NOW()-interval '1 month' WHERE id=$1", [old.grantId]);
                await open("/app/offers", studentToken, 390);
                const expiredButton = `[...document.querySelectorAll('.offer-card')].find(c=>c.querySelector('img')?.alt==='Browser expired')?.querySelector('button.acheter-btn')`;
                await until(() => evaluate(`Boolean(${expiredButton})`), "expired offer available");
                assert.match(await evaluate(`${expiredButton}.textContent`), /Acheter/);
                await evaluate(`${expiredButton}.click()`);
                await until(async () => await count("SELECT count(*) FROM offer_access_grants WHERE user_id=$1 AND offer_id=$2", [learner, expiredId]) === 2, "purchase after expiry");
                await db.query("UPDATE offer_access_grants SET expires_at=NOW()+interval '2 days' WHERE user_id=$1 AND offer_id=$2", [learner, annualId]);
                await Promise.all([sendOfferExpiryReminders(db), sendOfferExpiryReminders(db)]);
                await open("/app/paiement", studentToken, 390);
                await until(() => evaluate("document.querySelector('#offer-purchases-list')?.textContent.includes('Browser annual')"), "mobile wallet history");
                await evaluate("document.querySelector('.notification-icon').click()");
                await until(() => evaluate("document.querySelector('#notificationEventsList')?.textContent.includes('Browser annual')"), "expiry reminder in student UI");
                assert.equal(await evaluate("[...document.querySelectorAll('[data-notification-title]')].filter(e=>e.textContent.includes('Browser annual')).length"), 1);
                for (const width of [1280, 390]) {
                  await open("/admin/pages/overview.html", token(admin, "admin"), width);
                  const amounts = await until(() => evaluate("document.querySelector('#finance-breakdown')?.textContent"), "admin finance");
                  assert.match(amounts, /Recharges : 7.50 DT.*Tranches à encaisser/);
                }
                await open("/admin/pages/students.html", token(admin, "admin"), 390);
                await evaluate(`void openStudentDetailsModal(${JSON.stringify(testStudent)})`);
                const draftForm = "document.querySelector('#studentDetailsContent form:has([name=offerId])')";
                const paymentForm = "document.querySelector('#studentDetailsContent form:has([name=coverageStart])')";
                async function createDraft(id) {
                  await until(() => evaluate("Boolean(" + draftForm + ")"), "installment form");
                  await evaluate(`(() => { const f=${draftForm}; f.elements.offerId.value=${JSON.stringify(id)}; f.requestSubmit(); })()`);
                  await until(() => evaluate("Boolean(" + paymentForm + ")"), "draft confirmation");
                }
                await createDraft(historic);
                assert.equal(await count("SELECT count(*) FROM offer_access_grants WHERE user_id=$1", [testStudent]), 0);
                async function enterPayment() {
                  await evaluate(`(() => {
                    const f=${paymentForm};
                    Object.assign(f.elements.amount,{value:'10.10'});
                    f.elements.source.value='external';
                    f.elements.externalConfirmed.checked=true;
                    f.elements.paidOn.value='2024-01-30';
                    f.elements.coverageStart.value='2024-01-31';
                    f.elements.receiptReference.value='browser-fixture-receipt';
                    f.elements.nextDueDate.value='2024-02-15';
                    f.requestSubmit();
                  })()`);
                }
                await enterPayment();
                await until(() => evaluate("document.querySelector('#studentDetailsContent').textContent.includes('browser-fixture-receipt')"), "historical receipt");
                assert.match(await evaluate("document.querySelector('#studentDetailsContent').textContent"), /En retard/);
                await createDraft(duplicate);
                await enterPayment();
                await until(() => evaluate("document.querySelector('#studentDetailsContent').textContent.includes('référence de paiement a déjà été enregistrée')"), "duplicate receipt validation");
                await evaluate("[...document.querySelectorAll('#studentDetailsContent button')].find(b=>b.textContent==='Contrepasser').click()");
                await until(() => evaluate("document.querySelector('#studentDetailsContent').textContent.includes('Contrepassé')"), "audited reversal");
                assert.equal(await balance(testStudent), "300.00");
                await open("/admin/pages/students.html", token(admin, "admin"), 1280);
                await evaluate(`void openStudentDetailsModal(${JSON.stringify(testStudent)})`);
                await until(() => evaluate("document.querySelector('#studentDetailsContent').textContent.includes('Contrepassé')"), "desktop reversal history");
                process.env.TIMED_OFFER_SALES_ENABLED = "false";
                try {
                  await open("/app/offers", studentToken, 390);
                  await until(() => evaluate(`Boolean(${expiredButton})`), "disabled sale card");
                  assert.equal(await evaluate(`${expiredButton}.disabled`), true);
                  assert.match(await evaluate(`${expiredButton}.textContent`), /Indisponible/);
                } finally {
                  process.env.TIMED_OFFER_SALES_ENABLED = "true";
                }
                assert.deepEqual(errors, []);
                await evaluate(`(() => {
                  const original = window.fetch;
                  window.fetch = (url, ...args) => url === '/api/offers' ? new Promise(resolve => {
                    window.finishOfferFailure = () => {
                      window.fetch = original;
                      resolve(new Response('{}', {status:503}));
                    };
                  }) : original(url, ...args);
                  void initOffers();
                })()`);
                assert.match(await evaluate("document.querySelector('#offers-list').textContent"), /Chargement/);
                await evaluate("window.finishOfferFailure()");
                await until(() => evaluate("document.querySelector('#offers-list .error-message')?.textContent.includes('Réessayer')"), "catalog retry");
                await evaluate("document.querySelector('#offers-list .error-message button').click()");
                await until(() => evaluate(`Boolean(${expiredButton})`), "offer catalog recovered");
                assert.equal(errors.length, 1);
                assert.match(errors[0], /Error loading offers.*HTTP 503/);

                const upgradeTarget = await makeOffer("academic_year");
                const upgradeStudent = await user("browser-upgrade-student");
                const ordinaryStudent = await user("browser-ordinary-student");
                await db.query(`WITH clock AS (SELECT (now() AT TIME ZONE 'Africa/Tunis')::date AS today)
                  UPDATE offers SET title='Browser upgrade target',fixed_price=440,features=$2,
                    access_cutoff_date=clock.today,academic_year_start=
                      EXTRACT(YEAR FROM clock.today)::int-(EXTRACT(MONTH FROM clock.today)<9)::int
                  FROM clock WHERE id=$1`, [upgradeTarget, JSON.stringify(["<b>Libellé synthétique</b>"])]);
                await db.query("INSERT INTO payments(user_id,offer_id,amount,status) VALUES($1,$2,180,'wallet_completed')", [upgradeStudent, legacy]);
                process.env.TIMED_OFFER_UPGRADES_ENABLED = "true";
                try {
                  await open("/admin/pages/offers.html", token(admin, "admin"), 1280);
                  await until(() => evaluate(`typeof allOffers !== 'undefined' && allOffers.some(offer=>offer.id===${JSON.stringify(upgradeTarget)})`), "offer editor list");
                  await evaluate(`editOffer(${JSON.stringify(upgradeTarget)})`);
                  await until(() => evaluate("document.querySelector('#upgrade-policy')?.hidden === false"), "upgrade configuration");
                  await evaluate(`(() => {
                    const max=document.querySelector('#upgrade-max');
                    max.value='3';max.dispatchEvent(new Event('change'));
                    const enabled=document.querySelector('#upgrade-enabled');
                    enabled.checked=true;enabled.dispatchEvent(new Event('change'));
                    const legacy=[...document.querySelectorAll('#upgrade-source-rules label')].find(e=>e.textContent.trim()==='Legacy');
                    legacy.querySelector('input').checked=true;
                    document.querySelector('#save-upgrade-policy').click();
                  })()`);
                  await until(() => evaluate("document.querySelector('#upgrade-policy-status').textContent.includes('Règles enregistrées')"), "saved upgrade configuration");
                  for (const [id, width, useCredit] of [[upgradeStudent, 390, true], [ordinaryStudent, 1280, false]]) {
                    await open("/app/offers", token(id, "user"), width);
                    const selector = `[...document.querySelectorAll('.offer-card')].find(c=>c.querySelector('img')?.alt==='Browser upgrade target')?.querySelector('[data-scheduled-index]')`;
                    await until(() => evaluate(`Boolean(${selector})`), "scheduled checkout button");
                    assert.equal(await evaluate(`${selector}.closest('.purchase-section').querySelectorAll('button').length`), 1);
                    assert.equal(await evaluate(`${selector}.closest('.offer-card').querySelector('.feature-text').textContent`), "<b>Libellé synthétique</b>");
                    await evaluate(`${selector}.click()`);
                    assert.equal(await evaluate(`(() => {
                      const box = document.querySelector('.offer-checkout-dialog').getBoundingClientRect();
                      return box.left > 0 && box.top > 0 && Math.abs(box.left + box.width / 2 - innerWidth / 2) < 2;
                    })()`), true);
                    if (useCredit) await until(() => evaluate("document.querySelector('dialog [name=source]')?.options.length > 1"), "eligible credit option");
                    await evaluate(`(() => {
                      const f=document.querySelector('dialog form');
                      if (${useCredit}) f.elements.source.value=${JSON.stringify(legacy)};
                      f.elements.count.value='3';f.requestSubmit();
                    })()`);
                    const quote = await until(() => evaluate("document.querySelector('dialog [data-quote]')?.textContent"), "upgrade quote");
                    assert.match(quote, useCredit ? /Crédit : 180.00 DT.*À payer maintenant : 0.00 DT.*113.34 DT/s : /Crédit : 0.00 DT.*146.67 DT/s);
                    assert.match(quote, /Aucune échéance définie/);
                    assert.match(quote, /Dernier jour inclus.*Fin d’accès.*00:00 \(Tunis\).*Accès restant/s);
                    assert.doesNotMatch(quote, /Accès restant : environ \d+ j/);
                    assert.equal(await count("SELECT count(*) FROM offer_access_grants WHERE user_id=$1", [id]), 0);
                    await evaluate("document.querySelector('dialog form').requestSubmit()");
                    await until(async () => await count("SELECT count(*) FROM offer_access_grants WHERE user_id=$1", [id]) === 1, "confirmed scheduled grant");
                    assert.equal(await balance(id), useCredit ? "300.00" : "153.33");
                    if (!useCredit) {
                      await open("/app/paiement", token(id, "user"), width);
                      const pay = "[...document.querySelectorAll('#offer-purchases-list button')].find(b=>b.textContent.includes('146.67 DT'))";
                      await until(() => evaluate(`Boolean(${pay})`), "next wallet installment");
                      await evaluate(`${pay}.click()`);
                      await until(async () => (await balance(id)) === "6.66", "wallet installment debit");
                    }
                  }
                  assert.equal(errors.length, 1, errors.join("\n"));
                } finally {
                  process.env.TIMED_OFFER_UPGRADES_ENABLED = "false";
                }
              });
          });
        }
      } finally {
        const closed = once(server, "close");
        server.close();
        server.closeAllConnections();
        await closed;
      }
    });

    await t.test("upgrades preserve provenance, debt, access and cash accounting", async () => {
      const buyer = await user("upgrade-student");
      const partialBuyer = await user("partial-upgrade-student");
      const historicalBuyer = await user("expired-source-student");
      const competingBuyer = await user("concurrent-credit-student");
      const target = await makeOffer("academic_year");
      const otherTarget = await makeOffer("academic_year");
      const partial = await makeOffer("academic_year", "10.10");
      const historic = await makeOffer("academic_year");
      const monthlySource = await makeOffer("monthly");
      await db.query("UPDATE offers SET fixed_price=440 WHERE id=ANY($1::uuid[])", [[target, otherTarget]]);
      await db.query("UPDATE offers SET fixed_price=180 WHERE id=$1", [partial]);
      await db.query("UPDATE offers SET fixed_price=300 WHERE id=$1", [historic]);
      const settings = { maximum: 3, offsets: [null, null], enabled: true,
        rules: [{ sourceId: legacy, allowPartial: false }, { sourceId: partial, allowPartial: true },
          { sourceId: historic, allowPartial: false }] };
      await saveUpgradePolicy(db, target, settings);
      await saveUpgradePolicy(db, otherTarget, settings);
      await assert.rejects(saveUpgradePolicy(db, target, { ...settings, rules: [{ sourceId: monthlySource, allowPartial: true }] }), { status: 400 });
      await assert.rejects(db.query("INSERT INTO offer_upgrade_rules(source_offer_id,target_offer_id) VALUES($1,$2)", [monthlySource, target]), { code: "23514" });
      await db.query("INSERT INTO payments(user_id,offer_id,amount,status) VALUES($1,$2,180,'wallet_completed')", [buyer, legacy]);
      const request = (q, accepted = false) => ({ quote: q.quote, requestId: q.requestId, acceptSourceDebt: accepted });
      process.env.TIMED_OFFER_UPGRADES_ENABLED = "false";
      await assert.rejects(quoteOfferUpgrade(db, buyer, { sourceId: legacy, targetId: target, count: 3 }), { status: 503 });
      process.env.TIMED_OFFER_UPGRADES_ENABLED = "true";
      try {
        await assert.rejects(quoteOfferUpgrade(db, admin, { sourceId: legacy, targetId: target, count: 3 }),
          { status: 403, message: /compte étudiant/ });
        await assert.rejects(quoteOfferUpgrade(db, randomUUID(), { sourceId: legacy, targetId: target, count: 3 }),
          { status: 404, message: /Compte étudiant introuvable/ });
        await db.query("INSERT INTO payments(user_id,offer_id,amount,status) VALUES($1,$2,180,'wallet_completed')", [competingBuyer, legacy]);
        const competingQuotes = await Promise.all([target, otherTarget].map(targetId =>
          quoteOfferUpgrade(db, competingBuyer, { sourceId: legacy, targetId, count: 3 })));
        const contenders = await Promise.allSettled(competingQuotes.map(q => confirmOfferUpgrade(db, competingBuyer, request(q))));
        assert.equal(contenders.filter(result => result.status === "fulfilled").length, 1);
        assert.equal(contenders.find(result => result.status === "rejected").reason.status, 409);
        assert.equal(await count("SELECT count(*) FROM offer_access_grants WHERE user_id=$1", [competingBuyer]), 1);
        assert.equal(await count("SELECT count(*) FROM transactions WHERE user_id=$1", [competingBuyer]), 0);

        const q180 = await quoteOfferUpgrade(db, buyer, { sourceId: legacy, targetId: target, count: 3 });
        const competing = await quoteOfferUpgrade(db, buyer, { sourceId: legacy, targetId: target, count: 3 });
        assert.equal(q180.dueNow, "0.00");
        const duplicates = await Promise.all([1, 2].map(() => confirmOfferUpgrade(db, buyer, request(q180))));
        assert.equal(duplicates[0].grantId, duplicates[1].grantId);
        await assert.rejects(confirmOfferUpgrade(db, buyer, request(competing)), { status: 409 });
        await assert.rejects(confirmOfferUpgrade(db, buyer, request(q180, true)), { status: 409 });
        assert.equal(await count("SELECT count(*) FROM transactions WHERE user_id=$1", [buyer]), 0);
        assert.equal(await balance(buyer), "300.00");
        assert.equal(await access(buyer), true);
        const { rows: [targetArrangement] } = await db.query("SELECT id FROM offer_installment_arrangements WHERE grant_id=$1", [duplicates[0].grantId]);
        const next = { amount: "113.34", position: 2, source: "wallet", requestId: randomUUID() };
        const collections = await Promise.all([1, 2].map(() => collectInstallment(db, buyer, targetArrangement.id, buyer, next, true)));
        assert.equal(collections[0].paymentId, collections[1].paymentId);
        assert.equal(collections[0].remaining, "146.66");
        assert.equal(await balance(buyer), "186.66");
        await assert.rejects(collectInstallment(db, buyer, targetArrangement.id, buyer, { ...next, requestId: randomUUID() }, true), { status: 409 });

        const sourceDraft = await createInstallment(db, partialBuyer, partial, admin);
        await confirmInstallment(db, partialBuyer, sourceDraft.id, admin, {
          requestId: randomUUID(), amount: "100.00", source: "external", externalConfirmed: true
        });
        const q100 = await quoteOfferUpgrade(db, partialBuyer, { sourceId: partial, targetId: target, count: 3 });
        assert.equal(q100.sourceDebt, "80.00");
        assert.equal(q100.dueNow, "46.67");
        await assert.rejects(confirmOfferUpgrade(db, partialBuyer, request(q100)), { status: 400 });
        const upgraded = await confirmOfferUpgrade(db, partialBuyer, request(q100, true));
        assert.equal(await balance(partialBuyer), "253.33");
        const { rows: [linked] } = await db.query(`
          SELECT a.id AS target,p.id AS payment,c.id AS claim,a.next_due_date,a.quoted_price-a.paid_total-a.credit_total AS remaining
          FROM offer_access_grants g JOIN offer_installment_arrangements a ON a.grant_id=g.id
          JOIN offer_upgrade_claims c ON c.confirmation_id=g.upgrade_confirmation_id
          JOIN offer_installment_payments p ON p.id=c.installment_payment_id WHERE g.id=$1`, [upgraded.grantId]);
        assert.equal(linked.remaining, "293.33");
        assert.equal(linked.next_due_date, null);
        await assert.rejects(reverseInstallmentPayment(db, partialBuyer, sourceDraft.id, linked.payment, admin, {
          requestId: randomUUID(), reason: "Synthetic reversal"
        }), { status: 409 });
        const correction = { requestId: randomUUID(), reason: "Synthetic correction" };
        await correctUpgradeClaim(db, partialBuyer, linked.claim, admin, correction);
        assert.equal((await correctUpgradeClaim(db, partialBuyer, linked.claim, admin, correction)).alreadyRecorded, true);
        assert.equal(await balance(partialBuyer), "253.33");
        assert.equal(await access(partialBuyer), true);
        assert.equal((await db.query("SELECT quoted_price-paid_total-credit_total AS remaining FROM offer_installment_arrangements WHERE id=$1", [linked.target])).rows[0].remaining, "393.33");
        assert.equal((await db.query("SELECT quoted_price-paid_total AS remaining FROM offer_installment_arrangements WHERE id=$1", [sourceDraft.id])).rows[0].remaining, "80.00");
        assert.equal((await db.query("SELECT expires_at FROM offer_access_grants WHERE id=$1", [upgraded.grantId])).rows[0].expires_at.toISOString(), upgraded.expires_at.toISOString());
        await reverseInstallmentPayment(db, partialBuyer, sourceDraft.id, linked.payment, admin, {
          requestId: randomUUID(), reason: "Synthetic reversal after credit correction"
        });
        assert.equal(await balance(partialBuyer), "253.33");
        const { rows: [reconciled] } = await db.query(`
          SELECT a.quoted_price-a.paid_total AS source_debt,p.amount AS original_payment,
            (SELECT sum(t.amount) FROM transactions t WHERE t.user_id=a.user_id AND t.type='purchase'
              AND NOT EXISTS (SELECT 1 FROM offer_installment_payments ip JOIN offer_installment_reversals r ON r.payment_id=ip.id
                              WHERE ip.transaction_id=t.id)) AS net_sales
          FROM offer_installment_arrangements a JOIN offer_installment_payments p ON p.arrangement_id=a.id
          WHERE a.id=$1`, [sourceDraft.id]);
        assert.deepEqual(reconciled, { source_debt: "180.00", original_payment: "100.00", net_sales: "46.67" });
        await assert.rejects(quoteOfferUpgrade(db, partialBuyer, { sourceId: partial, targetId: otherTarget, count: 3 }), { status: 409 });

        const origin = await buyTimedOffer(db, historicalBuyer, requestFor(historic, await createOfferQuote(db, historicalBuyer, historic)));
        await db.query("UPDATE offer_access_grants SET starts_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1", [origin.grantId]);
        const q300 = await quoteOfferUpgrade(db, historicalBuyer, { sourceId: historic, targetId: target, count: 3 });
        assert.equal(q300.remaining, "140.00");
        await confirmOfferUpgrade(db, historicalBuyer, request(q300));
        assert.equal(await balance(historicalBuyer), "0.00");
        assert.equal(await count("SELECT count(*) FROM transactions WHERE user_id=$1", [historicalBuyer]), 1);

        const onlyMonthly = await user("monthly-credit-excluded");
        const monthlyGrant = await buyTimedOffer(db, onlyMonthly, requestFor(monthlySource, await createOfferQuote(db, onlyMonthly, monthlySource)));
        await assert.rejects(quoteOfferUpgrade(db, onlyMonthly, { sourceId: monthlySource, targetId: target, count: 3 }), { status: 403 });
        await db.query("UPDATE offers SET access_mode=NULL WHERE id=$1", [monthlySource]);
        await saveUpgradePolicy(db, target, { ...settings, rules: [...settings.rules, { sourceId: monthlySource, allowPartial: false }] });
        await assert.rejects(quoteOfferUpgrade(db, onlyMonthly, { sourceId: monthlySource, targetId: target, count: 3 }), { status: 409 });
        await assert.rejects(db.query("UPDATE offer_access_grants SET access_mode='academic_year',monthly_anchor_day=NULL WHERE id=$1", [monthlyGrant.grantId]), { code: "23514" });
        const { rows: [forged] } = await db.query(`INSERT INTO offer_upgrade_confirmations
          (user_id,source_offer_id,target_offer_id,request_id,fingerprint,original_credit,source_debt,immediate_paid)
          VALUES($1,$2,$3,$4,'synthetic',30.10,0,0) RETURNING id`, [onlyMonthly, monthlySource, target, randomUUID()]);
        await assert.rejects(db.query(`INSERT INTO offer_upgrade_claims(confirmation_id,source_grant_id,payment_id,amount)
          SELECT $1,id,payment_id,30.10 FROM offer_access_grants WHERE id=$2`, [forged.id, monthlyGrant.grantId]),
        { code: "23514", message: "Invalid credit evidence" });
        await db.query("DELETE FROM offer_upgrade_confirmations WHERE id=$1", [forged.id]);
        await saveUpgradePolicy(db, target, { ...settings, offsets: [1, 2] });
        const ordinary = await quoteOfferUpgrade(db, onlyMonthly, { targetId: target, count: 3 });
        assert.equal(ordinary.dueNow, "146.67");
        assert.ok(ordinary.schedule.every(row => row.dueDate && row.dueDate <= ordinary.cutoff));
        await confirmOfferUpgrade(db, onlyMonthly, request(ordinary));
        assert.equal(await access(onlyMonthly), true);
        const externalStudent = await user("external-upgrade-payment");
        const externalQuote = await quoteOfferUpgrade(db, externalStudent, { targetId: target, count: 3 });
        const external = { ...request(externalQuote), source: "external", paidOn: "2024-01-30", receiptReference: "upgrade-test-receipt" };
        await assert.rejects(confirmOfferUpgrade(db, externalStudent, external, admin), { status: 400 });
        await confirmOfferUpgrade(db, externalStudent, { ...external, externalConfirmed: true }, admin);
        assert.equal(await balance(externalStudent), "300.00");
      } finally { process.env.TIMED_OFFER_UPGRADES_ENABLED = "false"; }
    });

    await t.test("upgrade quotes resist tampering, stale terms and post-debit failure near the cutoff", async () => {
      const buyer = await user("upgrade-audit-buyer");
      const outsider = await user("upgrade-audit-outsider");
      const source = await makeOffer("academic_year");
      const target = await makeOffer("academic_year");
      await db.query("UPDATE offers SET fixed_price=100 WHERE id=$1", [source]);
      await db.query("UPDATE offers SET fixed_price=440 WHERE id=$1", [target]);
      const rules = [{ sourceId: source, allowPartial: false }];
      const policy = { maximum: 3, offsets: [null, null], enabled: true, rules };
      await saveUpgradePolicy(db, target, policy);
      const origin = await buyTimedOffer(db, buyer, requestFor(source, await createOfferQuote(db, buyer, source)));
      const requested = { targetId: target, sourceId: source, count: 3 };
      const input = q => ({ quote: q.quote, requestId: q.requestId });
      process.env.TIMED_OFFER_UPGRADES_ENABLED = "true";
      try {
        await assert.rejects(quoteOfferUpgrade(db, buyer, { ...requested, sourceId: "" }), { status: 400 });
        const original = await quoteOfferUpgrade(db, buyer, requested);
        await assert.rejects(confirmOfferUpgrade(db, outsider, input(original)), { status: 400 });
        await assert.rejects(confirmOfferUpgrade(db, buyer, { ...input(original), source: "external" }), { status: 400 });
        const [payload, signature] = original.quote.split(".");
        const changed = { ...JSON.parse(Buffer.from(payload, "base64url")), targetId: source, count: 1 };
        const tampered = Buffer.from(JSON.stringify(changed)).toString("base64url") + "." + signature;
        await assert.rejects(confirmOfferUpgrade(db, buyer, { ...input(original), quote: tampered }), { status: 400 });
        await db.query("UPDATE offers SET fixed_price=441 WHERE id=$1", [target]);
        await assert.rejects(confirmOfferUpgrade(db, buyer, input(original)), { status: 409 });
        await db.query("UPDATE offers SET fixed_price=440 WHERE id=$1", [target]);
        await saveUpgradePolicy(db, target, { ...policy, rules: [] });
        await assert.rejects(confirmOfferUpgrade(db, buyer, input(original)), { status: 403 });
        await saveUpgradePolicy(db, target, policy);
        await db.query("UPDATE offer_access_grants SET revoked_at=now() WHERE id=$1", [origin.grantId]);
        await assert.rejects(quoteOfferUpgrade(db, buyer, requested), { status: 409 });
        await db.query("UPDATE offer_access_grants SET revoked_at=NULL WHERE id=$1", [origin.grantId]);

        await db.query(`WITH clock AS (SELECT (now() AT TIME ZONE 'Africa/Tunis')::date AS today)
          UPDATE offers SET access_cutoff_date=clock.today,academic_year_start=
            EXTRACT(YEAR FROM clock.today)::int-(EXTRACT(MONTH FROM clock.today)<9)::int
          FROM clock WHERE id=$1`, [target]);
        await saveUpgradePolicy(db, target, { ...policy, offsets: [1, null] });
        await assert.rejects(quoteOfferUpgrade(db, buyer, requested), { status: 409 });
        await saveUpgradePolicy(db, target, policy);
        const short = await quoteOfferUpgrade(db, buyer, requested);
        assert.ok(short.remainingMinutes > 0 && short.remainingMinutes <= 1440);
        const before = await balance(buyer);
        const priorTransactions = await count("SELECT count(*) FROM transactions WHERE user_id=$1", [buyer]);
        await db.query("ALTER TABLE offer_installment_payments ADD CONSTRAINT audit_forced_failure CHECK (false) NOT VALID");
        try {
          await assert.rejects(confirmOfferUpgrade(db, buyer, input(short)), { code: "23514" });
          assert.equal(await balance(buyer), before);
          assert.equal(await count("SELECT count(*) FROM transactions WHERE user_id=$1", [buyer]), priorTransactions);
          assert.equal(await count("SELECT count(*) FROM offer_upgrade_confirmations WHERE user_id=$1", [buyer]), 0);
          assert.equal(await count("SELECT count(*) FROM offer_upgrade_claims WHERE source_grant_id=$1", [origin.grantId]), 0);
          assert.equal(await count("SELECT count(*) FROM offer_access_grants WHERE user_id=$1 AND offer_id=$2", [buyer, target]), 0);
        } finally { await db.query("ALTER TABLE offer_installment_payments DROP CONSTRAINT audit_forced_failure"); }
        const confirmed = await confirmOfferUpgrade(db, buyer, {
          ...input(short), credit: "440.00", amount: "0.00", expires_at: "2099-12-31"
        });
        assert.equal(confirmed.expires_at.toISOString(), short.expires_at);
        assert.equal(await balance(buyer), "153.33");
        const { rows: [ledger] } = await db.query(`
          SELECT u.original_credit,u.immediate_paid,a.quoted_price-a.paid_total-a.credit_total AS debt,
            (SELECT sum(amount) FROM transactions WHERE user_id=u.user_id AND type='purchase') AS sales,
            (g.expires_at AT TIME ZONE 'Africa/Tunis')::text AS expiry
          FROM offer_upgrade_confirmations u JOIN offer_access_grants g ON g.upgrade_confirmation_id=u.id
          JOIN offer_installment_arrangements a ON a.grant_id=g.id WHERE g.id=$1`, [confirmed.grantId]);
        assert.deepEqual(ledger, { original_credit: "100.00", immediate_paid: "46.67", debt: "293.33",
          sales: "146.67", expiry: new Date(Date.parse(short.cutoff + "T00:00:00Z") + 86400000).toISOString().slice(0, 10) + " 00:00:00" });
        for (const [count, due, remaining] of [[1, "440.00", "0.00"], [2, "220.00", "220.00"]]) {
          const ordinary = await user("upgrade-audit-plan-" + count);
          await db.query("UPDATE users SET balance=500 WHERE id=$1", [ordinary]);
          const quote = await quoteOfferUpgrade(db, ordinary, { targetId: target, count });
          assert.equal(quote.dueNow, due);
          assert.equal((await confirmOfferUpgrade(db, ordinary, input(quote))).remaining, remaining);
        }
        await db.query(`WITH clock AS (SELECT (now() AT TIME ZONE 'Africa/Tunis')::date-1 AS yesterday)
          UPDATE offers SET access_cutoff_date=clock.yesterday,academic_year_start=
            EXTRACT(YEAR FROM clock.yesterday)::int-(EXTRACT(MONTH FROM clock.yesterday)<9)::int
          FROM clock WHERE id=$1`, [target]);
        await assert.rejects(quoteOfferUpgrade(db, outsider, { targetId: target, count: 3 }), { status: 409 });
      } finally { process.env.TIMED_OFFER_UPGRADES_ENABLED = "false"; }
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
