// =====================================================
// BUGI DAILY QUESTION QUOTA
// Plan: "bugi" when the student holds at least one currently valid offer whose
// existing « Inclure le tutorat Bugi » flag is on (offers.features entry key "bugi",
// active true); otherwise "free". Limits never add up across several offers.
//
// A shared platform budget (bugiGlobalLimits) protects the free Gemini tier; free students
// may only use part of it, so Bugi-offer students keep priority.
//
// Usage is stored in bugi_question_usage (migration 202611260004) and counted per
// Africa/Tunis calendar day. A question first RESERVES a slot under a row lock on the
// student (so parallel requests cannot overshoot), then the slot becomes USED when Bugi
// answered, or is RELEASED when Gemini failed. Until the migration is applied, an
// in-process counter enforces the same rules (lost on restart; logged once).
// =====================================================
import { legacyOfferEntitlement, timedCourseGrant } from "../utils/offerAccess.js";

export const TIMEZONE = "Africa/Tunis";
// A reservation older than this no longer counts (process crashed mid-request).
export const RESERVATION_TTL_SECONDS = 120;

function configuredLimit(name, fallback, max = 1000) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 && value <= max ? value : fallback;
}

/** Per-student daily limits; env BUGI_DAILY_LIMIT_FREE (default 3) and BUGI_DAILY_LIMIT_BUGI (default 15). */
export function bugiDailyLimits() {
  return {
    free: configuredLimit("BUGI_DAILY_LIMIT_FREE", 3),
    bugi: configuredLimit("BUGI_DAILY_LIMIT_BUGI", 15),
  };
}

/**
 * Shared Gemini budget (free API tier). Free students may use only BUGI_FREE_SHARE_PERCENT
 * of each global limit, so students whose offer includes Bugi always keep some capacity.
 *   BUGI_GLOBAL_DAILY_LIMIT  questions per Tunis day for the whole platform (default 200)
 *   BUGI_GLOBAL_PER_MINUTE   questions per rolling minute for the whole platform (default 8)
 *   BUGI_FREE_SHARE_PERCENT  share of both limits open to free students (default 20)
 */
export function bugiGlobalLimits() {
  const daily = configuredLimit("BUGI_GLOBAL_DAILY_LIMIT", 200, 1000000);
  const perMinute = configuredLimit("BUGI_GLOBAL_PER_MINUTE", 8, 10000);
  const share = Math.min(100, configuredLimit("BUGI_FREE_SHARE_PERCENT", 20, 100));
  const portion = limit => (limit === 0 ? 0 : Math.max(1, Math.floor(limit * share / 100)));
  return { daily, perMinute, freeDaily: portion(daily), freePerMinute: portion(perMinute) };
}

// Rolling one-minute window of Gemini calls for this process (the app runs one instance).
const recentCalls = [];
function callsInLastMinute(now = Date.now()) {
  while (recentCalls.length && now - recentCalls[0] >= 60000) recentCalls.shift();
  return recentCalls.length;
}

/**
 * Throws a 429 BUGI_GLOBAL_LIMIT error when the platform budget is used up for this plan.
 * Must run synchronously right before recording the call, so parallel requests cannot overshoot.
 */
function checkGlobalBudget(plan, globalUsedToday) {
  const limits = bugiGlobalLimits();
  const now = Date.now();
  const daily = plan === "bugi" ? limits.daily : limits.freeDaily;
  if (globalUsedToday >= daily) {
    throw globalLimitError("daily", Math.ceil((Date.parse(nextTunisMidnight()) - now) / 1000));
  }
  const perMinute = plan === "bugi" ? limits.perMinute : limits.freePerMinute;
  if (callsInLastMinute(now) >= perMinute) {
    const wait = recentCalls.length ? Math.ceil((60000 - (now - recentCalls[Math.max(0, recentCalls.length - perMinute)])) / 1000) : 60;
    throw globalLimitError("minute", Math.min(60, Math.max(1, wait)));
  }
  recentCalls.push(now);
}

function globalLimitError(scope, retryAfter) {
  return Object.assign(new Error("Bugi platform budget reached."), { status: 429, code: "BUGI_GLOBAL_LIMIT", scope, retryAfter });
}

/**
 * SQL predicate: the user ($user placeholder) currently holds a valid offer with Bugi included.
 * Reuses the existing entitlement rules, but a bare purchase is not enough: it needs an
 * unexpired, non-revoked access grant or an active enrollment tied to the offer.
 */
export function bugiEligibility(user) {
  const legacyActive = legacyOfferEntitlement(user, "o.id", null)
    // legacyOfferEntitlement also accepts a completed payment alone; require live course access too.
    + ` AND EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.user_id = ${user} AND NOT e.timed_access_only
          AND (e.expires_at IS NULL OR e.expires_at > NOW())
          AND (e.offer_id = o.id OR e.course_id IN (SELECT oc.course_id FROM offer_courses oc WHERE oc.offer_id = o.id))
      )
      AND NOT EXISTS (
        SELECT 1 FROM payments revoked
        WHERE revoked.user_id = ${user} AND revoked.offer_id = o.id
          AND revoked.status IN ('refunded', 'cancelled', 'canceled', 'expired')
      )`;
  return `EXISTS (
    SELECT 1 FROM offers o
    -- to_jsonb(o) tolerates databases where the optional features column was never added.
    WHERE jsonb_typeof(to_jsonb(o)->'features') = 'array'
      AND (to_jsonb(o)->'features') @> '[{"key":"bugi","active":true}]'::jsonb
      AND (${timedCourseGrant(user, null, "o.id")} OR (${legacyActive}))
  )`;
}

/** Midnight Africa/Tunis after `now`, as an ISO string (for the "resets at" hint). */
export function nextTunisMidnight(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(part => [part.type, part.value]));
  const secondsIntoDay = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return new Date(Math.floor(now.getTime() / 1000) * 1000 + (86400 - secondsIntoDay) * 1000).toISOString();
}

export function tunisDay(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function quotaError(state) {
  return Object.assign(new Error("Bugi daily limit reached."), { status: 429, code: "BUGI_DAILY_LIMIT", quota: state });
}

function describe(plan, limit, used) {
  return { plan, limit, used, remaining: Math.max(0, limit - used), resetsAt: nextTunisMidnight() };
}

let tableReady = null;
let warnedFallback = false;
function usageTableReady(db) {
  tableReady ??= db.query("SELECT to_regclass('bugi_question_usage') IS NOT NULL AS ready")
    .then(result => result.rows[0]?.ready === true)
    .catch(error => { tableReady = null; throw error; });
  return tableReady;
}

/** In-process fallback while migration 202611260004 is held. Synchronous check-and-add = atomic. */
const memory = new Map();
function memoryUsage(userId, day) {
  const key = `${userId}:${day}`;
  if (!memory.has(key)) {
    if (memory.size > 20000) memory.clear();
    memory.set(key, { used: 0, reserved: new Set() });
  }
  return memory.get(key);
}

export function createBugiQuota(pool) {
  async function planFor(db, userId) {
    const { rows: [row] } = await db.query(`SELECT ${bugiEligibility("$1")} AS eligible`, [userId]);
    const limits = bugiDailyLimits();
    return row?.eligible ? { plan: "bugi", limit: limits.bugi } : { plan: "free", limit: limits.free };
  }

  async function persistent() {
    const ready = await usageTableReady(pool);
    if (!ready && !warnedFallback) {
      warnedFallback = true;
      console.warn("[bugi-quota] Migration 202611260004 not applied: daily quota kept in memory (resets on restart).");
    }
    return ready;
  }

  /** Current quota without reserving anything (for the UI). */
  async function status(userId) {
    const { plan, limit } = await planFor(pool, userId);
    if (!(await persistent())) {
      const usage = memoryUsage(userId, tunisDay());
      return describe(plan, limit, usage.used + usage.reserved.size);
    }
    const { rows: [row] } = await pool.query(
      `SELECT COUNT(*)::int AS used FROM bugi_question_usage
       WHERE user_id = $1 AND usage_day = (NOW() AT TIME ZONE '${TIMEZONE}')::date
         AND (status = 'used' OR created_at > NOW() - make_interval(secs => ${RESERVATION_TTL_SECONDS}))`,
      [userId]
    );
    return describe(plan, limit, row.used);
  }

  /**
   * Reserve one question before calling Gemini. Throws a 429 quota error when the limit
   * is reached. Returns a handle with commit(db?) and release().
   */
  async function reserve(userId) {
    if (!(await persistent())) {
      const { plan, limit } = await planFor(pool, userId);
      const day = tunisDay();
      const usage = memoryUsage(userId, day);
      const used = usage.used + usage.reserved.size;
      if (used >= limit) throw quotaError(describe(plan, limit, used));
      let globalToday = 0;
      for (const [key, entry] of memory) if (key.endsWith(":" + day)) globalToday += entry.used + entry.reserved.size;
      checkGlobalBudget(plan, globalToday);
      const token = Symbol("reservation");
      usage.reserved.add(token);
      let settled = false;
      return {
        quota: describe(plan, limit, used + 1),
        async commit() { if (!settled) { settled = true; usage.reserved.delete(token); usage.used++; } },
        async release() { if (!settled) { settled = true; usage.reserved.delete(token); } },
      };
    }

    const client = await pool.connect();
    let reservationId;
    let quota;
    try {
      await client.query("BEGIN");
      // Serializes this student's reservations: concurrent requests wait here, then recount.
      const locked = await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!locked.rowCount) throw Object.assign(new Error("Unknown user."), { status: 401 });
      const { plan, limit } = await planFor(client, userId);
      const { rows: [row] } = await client.query(
        `SELECT COUNT(*)::int AS used FROM bugi_question_usage
         WHERE user_id = $1 AND usage_day = (NOW() AT TIME ZONE '${TIMEZONE}')::date
           AND (status = 'used' OR created_at > NOW() - make_interval(secs => ${RESERVATION_TTL_SECONDS}))`,
        [userId]
      );
      if (row.used >= limit) throw quotaError(describe(plan, limit, row.used));
      // Platform-wide budget: one transaction-scoped lock serializes the global count across students.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('synta_bugi_global_quota'))");
      const { rows: [global] } = await client.query(
        `SELECT COUNT(*)::int AS used FROM bugi_question_usage
         WHERE usage_day = (NOW() AT TIME ZONE '${TIMEZONE}')::date
           AND (status = 'used' OR created_at > NOW() - make_interval(secs => ${RESERVATION_TTL_SECONDS}))`
      );
      checkGlobalBudget(plan, global.used);
      const inserted = await client.query(
        `INSERT INTO bugi_question_usage (user_id, usage_day, status)
         VALUES ($1, (NOW() AT TIME ZONE '${TIMEZONE}')::date, 'reserved') RETURNING id`,
        [userId]
      );
      reservationId = inserted.rows[0].id;
      quota = describe(plan, limit, row.used + 1);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    let settled = false;
    return {
      quota,
      /** Mark as used; pass the transaction client to commit together with the saved answer. */
      async commit(db = pool) {
        if (settled) return;
        settled = true;
        await db.query("UPDATE bugi_question_usage SET status = 'used' WHERE id = $1", [reservationId]);
      },
      /** Failed answer: give the question back. */
      async release() {
        if (settled) return;
        settled = true;
        await pool.query("DELETE FROM bugi_question_usage WHERE id = $1 AND status = 'reserved'", [reservationId])
          .catch(error => console.error("[bugi-quota] Reservation not released:", error.code || error.name));
      },
    };
  }

  return { status, reserve, planFor: userId => planFor(pool, userId) };
}

export function resetBugiQuotaForTests() {
  tableReady = null;
  warnedFallback = false;
  memory.clear();
  recentCalls.length = 0;
}
