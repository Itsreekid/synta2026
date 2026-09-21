import express from "express";

const router = express.Router();

router.post("/debug", async (req, res) => {
    try {
        const { code, error } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            console.error("[AI] GEMINI_API_KEY is not set.");
            return res.status(500).json({ 
                error: "Le service d'intelligence artificielle n'est pas configuré. Veuillez contacter l'administrateur." 
            });
        }

        if (!code) {
            return res.status(400).json({ error: "Aucun code fourni." });
        }

        // System prompt to enforce the persona and language constraints
        const systemPrompt = `You are a friendly, expert computer science teacher in Tunisia helping high school students (Bac Info / Bac Sciences) learn algorithms and Python.
Analyze the student's code and error message.
Explain the exact mistake clearly, give them a hint on how to fix it without giving away the full solution directly.
CRITICAL: You MUST speak ONLY in Tunisian Darja written in Arabic script (الدارجة التونسية بالحروف العربية). Maintain a warm and encouraging tone (e.g., 'مرحباً بك! ركز شوية في السطر...').`;

        const userPrompt = `${systemPrompt}\n\nHere is the student's context:\nCode:\n\`\`\`python\n${code}\n\`\`\`\n\nError Message:\n${error || "Je veux juste une explication de ce code."}`;

        const maxRetries = 3;
        let response = null;
        let attempt = 0;

        while (attempt < maxRetries) {
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: userPrompt }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
                })
            });

            if (response.ok || (response.status !== 503 && response.status !== 429)) {
                break; // Success or un-retryable error
            }
            
            attempt++;
            if (attempt < maxRetries) {
                console.warn(`[AI] Gemini server busy (HTTP ${response.status}). Retrying in ${attempt * 2}s...`);
                await new Promise(res => setTimeout(res, attempt * 2000));
            }
        }

        if (!response.ok) {
            const errData = await response.text();
            console.error("[AI] Gemini API error after retries:", errData);
            
            // Return polite user-friendly message for high demand
            if (response.status === 503 || response.status === 429) {
                return res.status(503).json({ error: "السيرفر مشغول حالياً، يرجى المحاولة بعد قليل" });
            }
            return res.status(502).json({ error: "API Gemini a refusé la requête: " + errData });
        }

        const data = await response.json();
        
        let aiText = "";
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts.length > 0) {
            aiText = data.candidates[0].content.parts[0].text;
        } else {
            return res.status(500).json({ error: "L'IA n'a pas pu générer de réponse." });
        }

        res.json({ explanation: aiText });

    } catch (err) {
        console.error("[AI] Fatal error calling Gemini:", err);
        res.status(500).json({ error: "Une erreur interne s'est produite lors de l'appel à l'IA." });
    }
});

export default router;
