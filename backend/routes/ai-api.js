import express from "express";
import { GoogleGenAI } from "@google/genai";

const router = express.Router();

// Prioritized model fallback list — tested & confirmed valid models
const MODEL_FALLBACK = [
    'gemini-1.5-flash',       // Primary: fast, widely available
    'gemini-1.5-flash-8b',    // Secondary: lightest, most available
    'gemini-1.0-pro',         // Last resort fallback
];

router.post("/debug", async (req, res) => {
    try {
        const { code, error } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY not configured.");
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
                const isOverload = errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('overloaded') || errMsg.includes('high demand');

                if (isOverload) {
                    console.warn(`[AI] Model ${model} is overloaded, trying next...`);
                    continue; // Try the next model
                }

                // Non-overload errors (auth, bad request, etc.) — fail immediately
                console.error(`[AI] Fatal error with model ${model}:`, modelErr);
                return res.status(500).json({ 
                    success: false, 
                    error: modelErr.message 
                });
            }
        }

        // All models failed (all were overloaded)
        console.error("[AI] All models failed. Last error:", lastError);
        return res.status(503).json({ 
            success: false, 
            error: "UNAVAILABLE: All models are currently under high demand." 
        });

    } catch (error) {
        console.error("AI Debug Route Error:", error);
        res.status(500).json({ 
            success: false, 
            error: error.message || "Erreur interne." 
        });
    }
});

export default router;
