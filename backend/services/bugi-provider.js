import { BUGI_INSTRUCTIONS, BUGI_TOPICS } from "./bugi-character.js";

export const BUGI_PRIMARY_MODEL = "gemini-3.5-flash-lite";

export function buildBugiGeminiRequest(context) {
    return {
        systemInstruction: { parts: [{ text: BUGI_INSTRUCTIONS }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(context) }] }],
        generationConfig: { maxOutputTokens: 480, thinkingConfig: { thinkingLevel: "minimal" } }
    };
}

export function readBugiGeminiText(data) {
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? "").join("").trim();
    if (!text || (candidate.finishReason === "MAX_TOKENS" && !text.includes("\nLEARNING:"))) {
        throw new Error("Gemini returned an incomplete answer.");
    }
    return text;
}

export function parseBugiReply(text) {
    const marker = /^LEARNING[ \t]*:/im.exec(text);
    const visible = marker ? text.slice(0, marker.index).trim() : text;
    const legacy = /(?:^|\n)TOPICS:[ \t]*([^\n]*)$/i.exec(visible);
    const explanation = legacy ? visible.slice(0, legacy.index).trim() : visible;
    const labels = (legacy?.[1] ?? "").split(",").map(topic => topic.trim().toLowerCase());
    const topics = [...new Set(labels)].filter(topic => BUGI_TOPICS.includes(topic)).slice(0, 2);
    let metadata;
    if (marker) {
        try { metadata = JSON.parse(text.slice(marker.index + marker[0].length)); } catch {}
    }
    return { explanation, topics, metadata };
}
