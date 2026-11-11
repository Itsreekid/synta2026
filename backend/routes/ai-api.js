import { createHash } from "node:crypto";
import express from "express";
import pool from "../config/db.js";
import { BUGI_INSTRUCTIONS, BUGI_MESSAGES } from "../services/bugi-character.js";
import { authRateLimit } from "../middleware/authRateLimit.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { authApiMiddleware } from "../middleware/requireAuth.js";

const router = express.Router();

// ── Model configuration ──────────────────────────────────────────
const MODELS = [
    'gemini-3.5-flash-lite',
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
    const body = {
        systemInstruction: { parts: [{ text: BUGI_INSTRUCTIONS }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(context) }] }],
        generationConfig: { maxOutputTokens: 480, thinkingConfig: { thinkingLevel: "minimal" } }
    };

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

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? "").join("").trim();
    if (!text || candidate.finishReason === "MAX_TOKENS") {
        throw new Error("Gemini returned an incomplete answer.");
    }

    return text;
}

async function generateAnswer(context, apiKey) {
    try {
        return await callGemini(MODELS[0], context, apiKey);
    } catch (err) {
        if (err.status !== 404) throw err;
        return callGemini(MODELS[1], context, apiKey);
    }
}

function getAnswer(userId, context, apiKey) {
    const key = createHash("sha256").update(JSON.stringify([userId, context])).digest("hex");
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

async function loadLearningContext(userId) {
    const [profile, topics] = await Promise.allSettled([
        pool.query("SELECT class, branch FROM users WHERE id = $1", [userId]),
        pool.query(
            "SELECT category FROM user_weak_topics WHERE user_id = $1 AND attempts > 0 AND success_rate < 70 ORDER BY success_rate, category LIMIT 2",
            [userId]
        )
    ]);
    const row = profile.value?.rows[0];
    return {
        level: LEVELS.has(row?.class) ? row.class : undefined,
        branch: BRANCHES.has(row?.branch) ? row.branch : undefined,
        topics: topics.value?.rows.map(topic => topic.category.slice(0, 60)) ?? []
    };
}

router.post("/debug", authApiMiddleware, limitBugi, async (req, res) => {
    try {
        const { code = "", error = "", question = "", previousAnswer = "" } = req.body ?? {};
        const valid = [[code, 12000], [error, 3000], [question, 500], [previousAnswer, 1200]]
            .every(([value, limit]) => typeof value === "string" && value.length <= limit);
        if (!valid || (!code.trim() && !question.trim())) {
            return res.status(400).json({ success: false, message: BUGI_MESSAGES.invalid });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("[AI] Bugi provider is not configured.");
            return res.status(503).json({ success: false, message: BUGI_MESSAGES.busy });
        }

        const learning = await loadLearningContext(req.user.id);
        const context = { code, consoleOutput: error, question, previousAnswer, learning };

        const explanation = await getAnswer(req.user.id, context, apiKey);
        return res.json({ success: true, explanation });
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
