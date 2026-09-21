import express from "express";
import { GoogleGenAI } from "@google/genai";

const router = express.Router();

// Prioritized model fallback list — confirmed valid models
const MODEL_FALLBACK = [
    'gemini-1.5-flash',       // Primary: fast, widely available
    'gemini-1.5-flash-8b',    // Secondary: lightest, most available
    'gemini-1.0-pro',         // Last resort fallback
];

router.post("/debug", async (req, res) => {
    try {
        const { code, error } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            console.error("[AI] GEMINI_API_KEY is not set in environment variables!");
            return res.status(500).json({ success: false, error: "GEMINI_API_KEY not configured." });
        }

        if (!code) {
            return res.status(400).json({ success: false, error: "Aucun code fourni." });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const systemPrompt = `You are a friendly, expert computer science teacher in Tunisia helping high school students (Bac Info / Bac Sciences) learn algorithms and Python.
Analyze the student's code and error message.
Explain the exact mistake clearly, give them a hint on how to fix it without giving away the full solution directly.
CRITICAL: You MUST speak ONLY in Tunisian Darja written in Arabic script (الدارجة التونسية بالحروف العربية). Maintain a warm and encouraging tone (e.g., 'مرحباً بك! ركز شوية في السطر...').`;

        const userPrompt = `Here is the student's context:\nCode:\n\`\`\`python\n${code}\n\`\`\`\n\nError Message:\n${error || "No specific error — explain this code."}`;

        let lastError = null;

        // Try each model in order until one succeeds
        for (const model of MODEL_FALLBACK) {
            try {
                console.log(`[AI] Trying model: ${model}`);

                const response = await ai.models.generateContent({
                    model,
                    contents: userPrompt,
                    config: {
                        systemInstruction: systemPrompt,
                        temperature: 0.7,
                        maxOutputTokens: 1024,
                    }
                });

                if (!response.text) {
                    throw new Error("Empty response from model.");
                }

                console.log(`[AI] ✅ Success with model: ${model}`);
                return res.json({ success: true, explanation: response.text });

            } catch (modelErr) {
                lastError = modelErr;
                const errMsg = modelErr.message || '';

                // Log the FULL error so we can see it in Coolify logs
                console.error(`[AI] Error with model ${model}:`, errMsg);

                const isOverload = errMsg.includes('503')
                    || errMsg.includes('UNAVAILABLE')
                    || errMsg.includes('overloaded')
                    || errMsg.includes('high demand')
                    || errMsg.includes('RESOURCE_EXHAUSTED')
                    || errMsg.includes('429');

                const isAuthError = errMsg.includes('API key')
                    || errMsg.includes('INVALID_ARGUMENT')
                    || errMsg.includes('403')
                    || errMsg.includes('401')
                    || errMsg.includes('not valid');

                if (isAuthError) {
                    // Auth errors won't be fixed by retrying — fail immediately
                    console.error(`[AI] ❌ Auth error — check GEMINI_API_KEY in Coolify env vars!`);
                    return res.status(500).json({
                        success: false,
                        error: `Auth error: ${errMsg}`
                    });
                }

                if (isOverload) {
                    console.warn(`[AI] Model ${model} overloaded, trying next...`);
                    continue; // Try next model
                }

                // Model not found or unknown — try next
                console.warn(`[AI] Model ${model} failed with: ${errMsg}, trying next...`);
                continue;
            }
        }

        // All models failed
        console.error("[AI] All models failed. Last error:", lastError?.message);
        return res.status(503).json({
            success: false,
            error: "UNAVAILABLE: All models are currently under high demand."
        });

    } catch (error) {
        console.error("AI Debug Route Fatal Error:", error.stack || error.message);
        res.status(500).json({
            success: false,
            error: error.message || "Erreur interne."
        });
    }
});

export default router;
