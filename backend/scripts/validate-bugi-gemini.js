import { performance } from "node:perf_hooks";
import { BUGI_PRIMARY_MODEL, buildBugiGeminiRequest, parseBugiReply, readBugiGeminiText } from "../services/bugi-provider.js";
import { buildBugiLearningContext, extractBugiEvidence } from "../services/bugi-learning.js";

// Expected labels describe these synthetic inputs, independently of the model output.
const cases = [
    {
        id: "en-misconception", language: "English",
        question: "I thought print('x') would print 10 because x = 10. Instead it printed x.",
        expected: ["misconception:variable-vs-string"], relevant: ["variable-vs-string"]
    },
    {
        id: "fr-explanation", language: "French",
        question: "Peux-tu expliquer une boucle for avec un petit exemple ?",
        expected: ["interest:loops"], relevant: ["loops"]
    },
    {
        id: "latin-darja-syntax", language: "Tunisian Darja (Latin)",
        question: "3lech nafs el boucle for ma temchich? Jarabt marra o5ra.",
        code: "for x in items\n    print(x)", consoleOutput: "SyntaxError: expected ':'",
        recent: [{ role: "student", message: "Nafs el boucle for ta3tini SyntaxError." },
            { role: "tutor", message: "ثبّت في آخر سطر for." }],
        expected: ["syntax:loops"], relevant: ["loops"]
    },
    {
        id: "ar-correction", language: "Arabic",
        question: "جربت الحلقة على ثلاثة عناصر وحطيت break بعد أول تطابق ووقفت الحلقة في المكان الصحيح.",
        expected: ["demonstrated:loops"], relevant: ["loops"]
    },
    {
        id: "mixed-proficiency", language: "Mixed Arabic/French/English",
        question: "جربت range(3) dans une boucle for. It visits 0, 1, and 2 because the stop value is excluded.",
        expected: ["demonstrated:loops"], relevant: ["loops"]
    },
    {
        id: "mixed-uncertain", language: "Mixed Arabic/French/English",
        question: "الكود وقف، je ne sais pas pourquoi. Can you help?",
        expected: [], relevant: []
    }
];

const profile = {
    preferences: ["step-by-step"],
    topics: [
        { concept: "variable-vs-string", status: "needs_reinforcement", errorTypes: ["misconception"] },
        { concept: "loops", status: "needs_reinforcement", errorTypes: ["logic"] },
        { concept: "files", status: "demonstrated_proficiency", errorTypes: [] }
    ]
};
const dryRun = process.argv.includes("--dry-run");
const showReplies = process.argv.includes("--show-replies");
const key = process.env.BUGI_STAGING_GEMINI_API_KEY;

function difference(left, right) {
    return left.filter(value => !right.includes(value));
}

async function run() {
    if (!dryRun && (process.env.NODE_ENV === "production" || process.env.BUGI_LIVE_QA !== "staging" || !key)) {
        throw new Error("Live validation requires BUGI_LIVE_QA=staging and a dedicated BUGI_STAGING_GEMINI_API_KEY outside production.");
    }

    const totals = { cases: cases.length, modelCalls: 0, truePositive: 0, falsePositive: 0,
        falseNegative: 0, malformedMetadata: 0, requestFailures: 0, contextMismatches: 0 };
    for (const fixture of cases) {
        const student = { question: fixture.question, code: fixture.code ?? "", consoleOutput: fixture.consoleOutput ?? "" };
        const learning = buildBugiLearningContext(profile, student);
        const actualContext = learning.observations.map(item => item.concept);
        const contextRelevant = difference(actualContext, fixture.relevant).length === 0 &&
            difference(fixture.relevant, actualContext).length === 0;
        totals.contextMismatches += Number(!contextRelevant);
        if (dryRun) {
            console.log(JSON.stringify({ id: fixture.id, language: fixture.language, expected: fixture.expected, actualContext, contextRelevant }));
            continue;
        }

        const start = performance.now();
        try {
            totals.modelCalls++;
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${BUGI_PRIMARY_MODEL}:generateContent`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                    body: JSON.stringify(buildBugiGeminiRequest({ ...student, recent: fixture.recent, learning })),
                    signal: AbortSignal.timeout(25000)
                }
            );
            if (!response.ok) throw Object.assign(new Error("Provider rejected the synthetic request."), { status: response.status });
            const payload = await response.json();
            const text = readBugiGeminiText(payload);
            const { explanation, metadata } = parseBugiReply(text);
            const malformed = /^LEARNING[ \t]*:/im.test(text) && (
                !Array.isArray(metadata) || metadata.length > 3 ||
                metadata.some(item => !item || ["kind", "concept", "source", "quote"].some(field => typeof item[field] !== "string"))
            );
            const priorTutor = fixture.recent?.find(message => message.role === "tutor")?.message;
            const actual = extractBugiEvidence(metadata, student, priorTutor).map(item => item.kind + ":" + item.concept);
            const falsePositives = difference(actual, fixture.expected);
            const falseNegatives = difference(fixture.expected, actual);
            totals.truePositive += actual.length - falsePositives.length;
            totals.falsePositive += falsePositives.length;
            totals.falseNegative += falseNegatives.length;
            totals.malformedMetadata += Number(malformed);
            console.log(JSON.stringify({
                id: fixture.id, language: fixture.language, expected: fixture.expected, actual, falsePositives, falseNegatives,
                malformed, metadataMissing: !/^LEARNING[ \t]*:/im.test(text), actualContext, contextRelevant,
                latencyMs: Math.round(performance.now() - start), inputTokens: payload.usageMetadata?.promptTokenCount,
                ...(showReplies ? { reply: explanation } : {})
            }));
        } catch (error) {
            totals.requestFailures++;
            console.log(JSON.stringify({ id: fixture.id, requestFailed: true, status: error.status ?? null }));
            if (error.status === 429) break;
        }
    }
    console.log(JSON.stringify({
        mode: dryRun ? "dry-run" : "live-staging",
        ...totals,
        ...(!dryRun && {
            precision: totals.truePositive / (totals.truePositive + totals.falsePositive) || 0,
            recall: totals.truePositive / (totals.truePositive + totals.falseNegative) || 0
        })
    }));
    if (totals.requestFailures || totals.contextMismatches) process.exitCode = 1;
}

run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
