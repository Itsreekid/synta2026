import express from "express";

const router = express.Router();

// ── Model configuration ──────────────────────────────────────────
const MODELS = [
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
];

const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS   = 25000;

// Transient HTTP status codes that warrant a retry / fallback
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

// Hard failure codes — indicate a configuration problem, never retry
const HARD_FAIL  = new Set([400, 401, 403, 404]);

// ── Core Gemini request ──────────────────────────────────────────
async function callGemini(model, prompt, apiKey) {
    const url  = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
    };

    let res;
    try {
        res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
            signal:  AbortSignal.timeout(TIMEOUT_MS)
        });
    } catch (networkErr) {
        // Network error or timeout — treat as transient
        const err = new Error(networkErr.message || 'Network error');
        err.transient = true;
        throw err;
    }

    const data = await res.json();

    if (!res.ok) {
        const err = new Error(JSON.stringify(data?.error || data));
        err.status    = res.status;
        err.transient = TRANSIENT.has(res.status);
        err.hardFail  = HARD_FAIL.has(res.status);
        throw err;
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        const err = new Error("Empty response from model.");
        err.transient = true;
        throw err;
    }

    return text;
}

// ── Try one model with one automatic retry on transient errors ───
async function tryModelWithRetry(model, prompt, apiKey, isPrimary) {
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const text = await callGemini(model, prompt, apiKey);
            if (isPrimary && attempt === 1) {
                console.log(`[AI] ✅ Success with model: ${model}`);
            } else {
                console.log(`[AI] ⚠️ Primary failed, fallback succeeded: ${model} (attempt ${attempt})`);
            }
            return { text, model };
        } catch (err) {
            // Hard failures (auth / bad request) — stop immediately
            if (err.hardFail) {
                console.error(`[AI] ❌ Hard failure on ${model} [${err.status}]: ${err.message}`);
                throw err;
            }

            if (attempt === 1 && err.transient) {
                console.warn(`[AI] ⚠️ Transient error on ${model} (attempt 1), retrying...`);
                continue; // retry once
            }

            // Second attempt failed or non-transient — bubble up so next model is tried
            console.warn(`[AI] ✗ ${model} exhausted (attempt ${attempt}): ${err.message?.substring(0, 120)}`);
            throw err;
        }
    }
}

// ── /api/ai/debug ────────────────────────────────────────────────
router.post("/debug", async (req, res) => {
    try {
        const { code, error } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            console.error("[AI] ❌ GEMINI_API_KEY is not set in environment variables!");
            return res.status(500).json({ success: false, error: "GEMINI_API_KEY not configured." });
        }

        if (!code) {
            return res.status(400).json({ success: false, error: "Aucun code fourni." });
        }

        const systemPrompt = `You are a friendly, expert computer science teacher in Tunisia helping high school students (Bac Info / Bac Sciences) learn algorithms and Python.
Analyze the student's code and error message.
Explain the exact mistake clearly, give them a hint on how to fix it without giving away the full solution directly.
CRITICAL: You MUST speak ONLY in Tunisian Darja written in Arabic script (الدارجة التونسية بالحروف العربية). Maintain a warm and encouraging tone.`;

        const fullPrompt = `${systemPrompt}\n\nHere is the student's context:\nCode:\n\`\`\`python\n${code}\n\`\`\`\n\nError Message:\n${error || "No specific error — explain this code."}`;

        // ── Fallback chain: primary → fallback-1 → fallback-2 ──
        for (let i = 0; i < MODELS.length; i++) {
            const model     = MODELS[i];
            const isPrimary = i === 0;

            try {
                const { text } = await tryModelWithRetry(model, fullPrompt, process.env.GEMINI_API_KEY, isPrimary);
                return res.json({ success: true, explanation: text });

            } catch (err) {
                // Hard failure — do not try further models
                if (err.hardFail) {
                    return res.status(500).json({
                        success: false,
                        error: `Configuration error [${err.status}] — contact administrator.`
                    });
                }
                // Transient — try next model if available
                if (i < MODELS.length - 1) {
                    console.warn(`[AI] Moving to next model in chain...`);
                }
            }
        }

        // All models exhausted
        console.error("[AI] ❌ All models in fallback chain failed.");
        return res.status(503).json({
            success:   false,
            temporary: true,
            message:   "Bugi يستحق شوية وقت 😅 جرّب مرة أخرى بعد لحظات."
        });

    } catch (fatalErr) {
        console.error("[AI] Fatal Route Error:", fatalErr.stack || fatalErr.message);
        return res.status(500).json({
            success:   false,
            temporary: false,
            message:   "Bugi يستحق شوية وقت 😅 جرّب مرة أخرى بعد لحظات."
        });
    }
});

// ── /api/ai/list-models (diagnostic) ────────────────────────────
router.get("/list-models", async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: "GEMINI_API_KEY not set" });
        }
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
        );
        const data   = await response.json();
        const models = (data.models || []).map(m => ({
            name:               m.name,
            displayName:        m.displayName,
            supportedMethods:   m.supportedGenerationMethods
        }));
        res.json({ total: models.length, models });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
