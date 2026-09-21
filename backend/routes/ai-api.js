import express from "express";
import { GoogleGenAI } from "@google/genai";

const router = express.Router();

router.post("/debug", async (req, res) => {
    try {
        const { code, error } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Le service d'intelligence artificielle n'est pas configuré. Veuillez contacter l'administrateur.");
        }

        if (!code) {
            throw new Error("Aucun code fourni.");
        }

        // Initialize SDK correctly
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const systemPrompt = `You are a friendly, expert computer science teacher in Tunisia helping high school students (Bac Info / Bac Sciences) learn algorithms and Python.
Analyze the student's code and error message.
Explain the exact mistake clearly, give them a hint on how to fix it without giving away the full solution directly.
CRITICAL: You MUST speak ONLY in Tunisian Darja written in Arabic script (الدارجة التونسية بالحروف العربية). Maintain a warm and encouraging tone (e.g., 'مرحباً بك! ركز شوية في السطر...').`;

        const userPrompt = `Here is the student's context:\nCode:\n\`\`\`python\n${code}\n\`\`\`\n\nError Message:\n${error || "Je veux juste une explication de ce code."}`;

        // Call the SDK using the official method and gemini-3.8-flash
        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: userPrompt,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.7,
                maxOutputTokens: 1024
            }
        });

        if (!response.text) {
            throw new Error("L'IA n'a pas pu générer de réponse.");
        }

        res.json({ success: true, explanation: response.text });
        
    } catch (error) {
        // Log the exact error stack for debugging
        console.error("AI Debug Route Error:", error);
        
        // Return clear JSON error payload
        res.status(503).json({ 
            success: false, 
            error: error.message || "Une erreur interne s'est produite lors de l'appel à l'IA." 
        });
    }
});

export default router;
