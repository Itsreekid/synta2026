import express from "express";

const router = express.Router();

// Real supported Gemini model IDs (gemini-3.x does NOT exist)
const MODEL_FALLBACK = [
    'gemini-2.5-flash',       // Latest & fastest
    'gemini-2.0-flash',       // Previous gen
    'gemini-1.5-flash',       // Stable fallback
];

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function callGemini(model, prompt, apiKey) {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(JSON.stringify(data));
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from model.");

    return text;
}

router.post("/debug", async (req, res) => {
    try {
        const { code, error } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            console.error("[AI] ❌ GEMINI_API_KEY is not set!");
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

        let lastError = null;

        for (const model of MODEL_FALLBACK) {
            try {
                console.log(`[AI] Trying model: ${model}`);
                const text = await callGemini(model, fullPrompt, process.env.GEMINI_API_KEY);
                console.log(`[AI] ✅ Success with model: ${model}`);
                return res.json({ success: true, explanation: text });

            } catch (modelErr) {
                lastError = modelErr;
                const errMsg = modelErr.message || '';
                console.error(`[AI] ❌ Model ${model} failed:`, errMsg.substring(0, 200));

                const isAuthError = errMsg.includes('"401"') || errMsg.includes('"403"')
                    || errMsg.includes('API_KEY_INVALID') || errMsg.includes('not valid');

                if (isAuthError) {
                    console.error("[AI] ❌ Auth error — check GEMINI_API_KEY in Coolify!");
                    return res.status(500).json({ success: false, error: "Auth error: invalid API key." });
                }
                // Any other error (404, 503, etc.) — try next model
                continue;
            }
        }

        console.error("[AI] All models failed. Last:", lastError?.message?.substring(0, 200));
        return res.status(503).json({
            success: false,
            error: "UNAVAILABLE: All models are currently unavailable."
        });

    } catch (error) {
        console.error("[AI] Fatal Route Error:", error.stack || error.message);
        res.status(500).json({ success: false, error: error.message || "Erreur interne." });
    }
});

// ----------------------------------------------------------------
// DIAGNOSTIC: List available models for this API key
// GET /api/ai/list-models
// ----------------------------------------------------------------
router.get("/list-models", async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: "GEMINI_API_KEY not set" });
        }
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
        );
        const data = await response.json();
        const models = (data.models || []).map(m => ({
            name: m.name,
            displayName: m.displayName,
            supportedMethods: m.supportedGenerationMethods
        }));
        res.json({ total: models.length, models });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
