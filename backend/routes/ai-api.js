import { createHash } from "node:crypto";
import express from "express";
import pool from "../config/db.js";
import { BUGI_MESSAGES } from "../services/bugi-character.js";
import { BUGI_PRIMARY_MODEL, buildBugiGeminiRequest, parseBugiReply, readBugiGeminiText } from "../services/bugi-provider.js";
import { buildBugiLearningContext, extractBugiEvidence, getBugiLearningProfile, saveBugiLearningEvidence } from "../services/bugi-learning.js";
import { authRateLimit } from "../middleware/authRateLimit.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";

const router = express.Router();

// ── Model configuration ──────────────────────────────────────────
const MODELS = [
    BUGI_PRIMARY_MODEL,
    'gemini-3.5-flash',
];

const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS   = 25000;

const ANSWER_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED_ANSWERS = 200;
const answers = new Map();
let quotaPauseUntil = 0;

const limitBugi = authRateLimit(15, 5 * 60 * 1000, req => req.user.id);

// ── Core Gemini request ──────────────────────────────────────────
async function callGemini(model, context, apiKey) {
    const url  = `${GEMINI_BASE}/${model}:generateContent`;
    const body = buildBugiGeminiRequest(context);

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (!res.ok) {
        if (res.status === 429) {
            const retryAfter = res.headers.get('retry-after');
            const seconds = Number(retryAfter);
            const delay = seconds > 0 ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
            quotaPauseUntil = Math.max(quotaPauseUntil, Date.now() + (delay > 0 ? delay : 60000));
        }
        throw Object.assign(new Error("Gemini returned an HTTP error."), { status: res.status });
    }

    return readBugiGeminiText(await res.json());
}

async function generateAnswer(context, apiKey) {
    try {
        return await callGemini(MODELS[0], context, apiKey);
    } catch (err) {
        if (err.status !== 404) throw err;
        return callGemini(MODELS[1], context, apiKey);
    }
}

function getAnswer(userId, revision, context, apiKey) {
    const key = createHash("sha256").update(JSON.stringify([userId, revision, context])).digest("hex");
    const cached = answers.get(key);
    if (cached?.expires > Date.now()) return cached.promise;

    if (Date.now() < quotaPauseUntil) {
        throw Object.assign(new Error("Gemini quota paused."), { status: 429 });
    }

    if (answers.size >= MAX_CACHED_ANSWERS && !answers.has(key)) {
        answers.delete(answers.keys().next().value);
    }
    const promise = generateAnswer(context, apiKey).catch(error => {
        if (answers.get(key)?.promise === promise) answers.delete(key);
        throw error;
    });
    answers.set(key, { promise, expires: Date.now() + ANSWER_TTL_MS });
    return promise;
}

// ── /api/ai/debug ────────────────────────────────────────────────
const LEVELS = new Set(["1ere", "2eme", "3eme", "bac", "other"]);
const BRANCHES = new Set(["informatique", "mathematiques", "sciences", "technique", "lettres", "economie", "other"]);

async function loadBugiAccount(userId) {
    const result = await pool.query("SELECT class, branch, bugi_history_revision::text AS revision FROM users WHERE id = $1", [userId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
        revision: row.revision,
        level: LEVELS.has(row?.class) ? row.class : undefined,
        branch: BRANCHES.has(row?.branch) ? row.branch : undefined
    };
}

const configuredBudget = Number(process.env.BUGI_LEARNING_CONTEXT_TOKENS);
const learningBudget = Number.isInteger(configuredBudget) && configuredBudget >= 64 && configuredBudget <= 1200
    ? configuredBudget : 720;

const HISTORY_PAGE_SIZE = 20;

router.get("/history", authApiMiddleware, async (req, res) => {
    const { before = null } = req.query;
    if (before !== null && (typeof before !== "string" || !/^[1-9]\d{0,18}$/.test(before) || BigInt(before) > 9223372036854775807n)) {
        return res.status(400).json({ success: false });
    }
    try {
        const { rows } = await pool.query(
            `SELECT id::text, role, message FROM bugi_messages
             WHERE user_id = $1 AND ($2::bigint IS NULL OR id < $2::bigint)
             ORDER BY bugi_messages.id DESC LIMIT $3`,
            [req.user.id, before, HISTORY_PAGE_SIZE + 1]
        );
        const page = rows.slice(0, HISTORY_PAGE_SIZE);
        const next = rows.length > HISTORY_PAGE_SIZE ? page.at(-1).id : null;
        res.set("Cache-Control", "no-store");
        return res.json({ messages: page.reverse(), next });
    } catch {
        return res.status(503).json({ success: false, message: BUGI_MESSAGES.busy });
    }
});

async function withHistoryTransaction(work) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

router.delete("/history", authApiMiddleware, async (req, res) => {
    try {
        await withHistoryTransaction(async client => {
            // UPDATE takes the same account lock that reply persistence takes.
            await client.query(
                "UPDATE users SET bugi_history_revision = bugi_history_revision + 1 WHERE id = $1",
                [req.user.id]
            );
            await client.query("DELETE FROM bugi_messages WHERE user_id = $1", [req.user.id]);
        });
        return res.sendStatus(204);
    } catch {
        return res.status(503).json({ success: false, message: BUGI_MESSAGES.busy });
    }
});

async function loadRecentExchange(userId) {
    const { rows } = await pool.query(
        `SELECT role, LEFT(message, 600) AS message FROM bugi_messages
         WHERE user_id = $1 ORDER BY id DESC LIMIT 2`,
        [userId]
    );
    return rows.reverse();
}

router.post("/debug", authApiMiddleware, limitBugi, async (req, res) => {
    try {
        const { code = "", error = "", question = "" } = req.body ?? {};
        const valid = [[code, 12000], [error, 3000], [question, 500]]
            .every(([value, limit]) => typeof value === "string" && value.length <= limit);
        if (!valid || (!code.trim() && !question.trim())) {
            return res.status(400).json({ success: false, message: BUGI_MESSAGES.invalid });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("[AI] Bugi provider is not configured.");
            return res.status(503).json({ success: false, message: BUGI_MESSAGES.busy });
        }

        const userId = req.user.id;
        const account = await loadBugiAccount(userId);
        if (!account) return res.status(401).json({ success: false, message: BUGI_MESSAGES.session });
        const { revision, ...academic } = account;
        const student = { code, consoleOutput: error, question };
        const [recent, profile] = await Promise.allSettled([
            question.trim() ? loadRecentExchange(userId) : [],
            getBugiLearningProfile(pool, userId)
        ]);
        const learning = profile.status === "fulfilled"
            ? buildBugiLearningContext(profile.value, student, learningBudget)
            : undefined;
        const context = { ...student, academic, recent: recent.value, learning };
        const { explanation, topics, metadata } = parseBugiReply(await getAnswer(userId, revision, context, apiKey));
        if (!explanation || explanation.length > 4000) throw new Error("Invalid Bugi reply.");

        const prompt = question.trim() || (error ? BUGI_MESSAGES.debugError : BUGI_MESSAGES.reviewCode);
        const priorTutor = recent.value?.find(message => message.role === "tutor")?.message;
        const evidence = extractBugiEvidence(metadata, student, priorTutor);
        const saved = await withHistoryTransaction(async client => {
            const { rows } = await client.query(
                "SELECT bugi_history_revision::text AS revision FROM users WHERE id = $1 FOR UPDATE",
                [userId]
            );
            if (rows[0]?.revision !== revision) return [];

            const { rows: messages } = await client.query(
                `INSERT INTO bugi_messages (user_id, role, message, topics)
                 VALUES ($1, 'student', $2, '{}'), ($1, 'tutor', $3, $4::text[]) RETURNING id::text, role`,
                [userId, prompt, explanation, topics]
            );
            if (evidence.length) {
                await client.query("SAVEPOINT bugi_evidence");
                try {
                    await saveBugiLearningEvidence(client, userId, messages.find(row => row.role === "tutor")?.id, evidence);
                } catch {
                    await client.query("ROLLBACK TO SAVEPOINT bugi_evidence");
                    console.warn("[AI] Bugi learning evidence could not be saved.");
                }
            }
            return messages;
        });
        return res.json({ success: true, explanation, saved });
    } catch (error) {
        if (error.status === 429) {
            const retryAfter = Math.max(1, Math.ceil((quotaPauseUntil - Date.now()) / 1000));
            res.set("Retry-After", String(retryAfter));
            return res.status(429).json({ success: false, message: BUGI_MESSAGES.quota });
        }
        console.warn("[AI] Bugi provider request failed.", error.status ?? "");
        return res.status(503).json({ success: false, message: BUGI_MESSAGES.busy });
    }
});

// ── /api/ai/list-models (diagnostic) ────────────────────────────
router.get("/list-models", authApiMiddleware, requireAdmin, async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: "GEMINI_API_KEY not set" });
        }
        const response = await fetch(
            GEMINI_BASE,
            { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(TIMEOUT_MS) }
        );
        if (!response.ok) return res.status(502).json({ error: "Model listing unavailable." });
        const data   = await response.json();
        const models = (data.models || []).map(m => ({
            name:               m.name,
            displayName:        m.displayName,
            supportedMethods:   m.supportedGenerationMethods
        }));
        res.json({ total: models.length, models });
    } catch {
        res.status(502).json({ error: "Model listing unavailable." });
    }
});

export default router;
