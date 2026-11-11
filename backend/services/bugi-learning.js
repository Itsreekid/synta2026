import { createHash } from "node:crypto";

const TAXONOMY = {
    variables: ["variable", "variables", "assignment", "affectation", "متغيّر", "متغير", "متغيّرات", "متغيرات"],
    "variable-vs-string": ["string literal", "variable reference", "guillemets", "quotes", "بين الظفرين", "علامات التنصيص"],
    types: ["data type", "types", "int", "float", "conversion"],
    operators: ["operator", "opérateur", "expression", "modulo"],
    conditions: ["if", "elif", "condition", "conditions"],
    loops: ["loop", "loops", "boucle", "iteration", "itération", "for loop", "for loops", "boucle for", "iteration using for", "while loop", "boucle while", "boucles", "حلقة", "الحلقة", "حلقات", "الحلقات", "التكرار"],
    functions: ["function", "functions", "fonction", "parameter", "paramètre", "def"],
    lists: ["list", "lists", "liste", "list indexing", "indexation"],
    tuples: ["tuple", "tuples"],
    sets: ["set", "sets", "ensemble"],
    dictionaries: ["dict", "dictionary", "dictionnaire"],
    strings: ["string", "strings", "chaîne"],
    "input-output": ["input", "print", "sortie"],
    oop: ["oop", "class", "object oriented", "classe"],
    algorithms: ["algorithm", "algorithme", "problem solving"],
    recursion: ["recursion", "récursion", "recursive", "récursif"],
    debugging: ["debugging", "debug", "débogage", "traceback"],
    errors: ["exception", "syntaxerror", "typeerror", "type error", "erreur", "try", "except"],
    files: ["file handling", "fichier", "open("]
};
const RELATED = { "variable-vs-string": ["variables", "strings"], variables: ["variable-vs-string", "types"], strings: ["variable-vs-string"], loops: ["algorithms"], lists: ["loops"], recursion: ["functions"] };
const DIFFICULTIES = new Set(["misconception", "syntax", "logic", "confusion", "failed-application"]);
const PREFERENCES = {
    "short-explanations": /\b(?:short|brief|court|concise?)\b|مختصر|بالقصير/iu,
    "step-by-step": /step.by.step|étape par étape|خطوة بخطوة/iu,
    "examples-first": /examples? first|exemples? (?:en premier|d.abord)|مثال قبل/iu,
    "beginner-examples": /beginner|débutant|مبتدئ/iu,
    "arabic-explanations": /\barabic\b|\barabe\b|بالعربي|بالدارجة/iu
};
const EXPLICIT_REQUEST = /\b(?:prefer|please|want|explain|préfère|explique|donne|je veux)\b|نحب|فسّر|فسر|بالله/iu;
const normalize = value => value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
const aliases = new Map(Object.entries(TAXONOMY).flatMap(([concept, names]) => [concept, ...names].map(name => [name, concept])));

export function normalizeBugiConcept(value) {
    return typeof value === "string" ? aliases.get(normalize(value)) : undefined;
}

export const BUGI_CONCEPTS = Object.keys(TAXONOMY);

function detectConcepts(text) {
    const normalized = normalize(text);
    const words = new Set(normalized.split(/[^\p{L}\p{N}-]+/u));
    return BUGI_CONCEPTS.filter(concept => (concept === "variable-vs-string" && /\bprint\s*\(\s*["']/.test(normalized)) || [concept, ...TAXONOMY[concept]].some(alias =>
        alias.includes(" ") || alias.includes("(") ? normalized.includes(alias) : words.has(alias)
    ));
}

export function extractBugiEvidence(metadata, student, previousTutorReply = "") {
    if (!Array.isArray(metadata)) return [];
    const question = normalize(student.question);
    const sources = { question, code: normalize(student.code), error: normalize(student.consoleOutput) };
    const evidence = new Map();
    const concepts = new Set(detectConcepts(Object.values(sources).join(" ")));
    for (const concept of [...concepts]) for (const related of RELATED[concept] ?? []) concepts.add(related);

    for (const signal of metadata.slice(0, 6)) {
        if (!signal || typeof signal.quote !== "string" || typeof signal.source !== "string" ||
            typeof signal.kind !== "string" || typeof signal.concept !== "string") continue;
        const { kind, source } = signal;
        const concept = kind === "preference" ? signal.concept : normalizeBugiConcept(signal.concept);
        const quote = normalize(signal.quote);
        if (!concept || quote.length < 8 || quote.length > 180 ||
            !Object.hasOwn(sources, source) || !sources[source].includes(quote)) continue;
        if ((DIFFICULTIES.has(kind) || kind === "demonstrated") && !concepts.has(concept)) continue;

        if (kind === "preference") {
            if (source !== "question" || !Object.hasOwn(PREFERENCES, concept) ||
                !EXPLICIT_REQUEST.test(question) || !PREFERENCES[concept].test(quote)) continue;
        } else if (kind === "demonstrated") {
            // A request, an error trace or copied code alone cannot demonstrate proficiency.
            if (source !== "question" || quote.length < 24 || /[?؟]/u.test(question) ||
                /(?:don.t understand|not sure|je ne comprends pas|ما فهمتش|ماني فاهم)/iu.test(question) ||
                /^(?:can you|could you|explain|please|pourquoi|explique|فسّر|فسر|علاش)\b/iu.test(quote) ||
                normalize(previousTutorReply).includes(quote)) continue;
        } else if (kind === "syntax" && !/\b(?:SyntaxError|IndentationError|TabError)\b/i.test(student.consoleOutput)) {
            continue;
        } else if (DIFFICULTIES.has(kind) && kind !== "syntax" && source !== "question") {
            continue;
        } else if (kind !== "interest" && !DIFFICULTIES.has(kind)) {
            continue;
        } else if (DIFFICULTIES.has(kind) && source === "question" &&
                   !/\b(?:thought|expected|confus\w*|crois|pensais|comprends pas|instead|should have|should stop|should print)\b|ما فهمتش|كنت نحسب/iu.test(quote)) {
            continue;
        }

        const group = DIFFICULTIES.has(kind) ? "difficulty" : kind;
        const submission = kind === "syntax" ? (sources.code || sources.error) : question || sources[source];
        const fingerprint = createHash("sha256").update(JSON.stringify([concept, group, submission])).digest("hex");
        evidence.set(concept + ":" + kind, { concept, kind, fingerprint });
    }
    return [...evidence.values()];
}

export function summarizeBugiProfile(rows) {
    const topics = new Map();
    const preferences = new Set();
    const seen = new Set();
    for (const row of rows) {
        if (seen.has(row.fingerprint)) continue;
        seen.add(row.fingerprint);
        if (row.kind === "preference") {
            preferences.add(row.concept);
            continue;
        }
        const list = topics.get(row.concept) ?? [];
        list.push(row);
        topics.set(row.concept, list);
    }
    return {
        preferences: [...preferences],
        topics: [...topics].map(([concept, observations]) => {
            const errors = observations.filter(row => DIFFICULTIES.has(row.kind));
            const strengths = observations.filter(row => row.kind === "demonstrated");
            const recentStrengths = strengths.filter(row => !errors.length || BigInt(row.message_id) > BigInt(errors[0].message_id));
            const status = recentStrengths.length >= 2 ? "demonstrated_proficiency"
                : recentStrengths.length ? (errors.length ? "improving" : "practicing")
                : errors.length >= 2 ? "needs_reinforcement"
                : errors.length || strengths.length ? "practicing" : "introduced";
            return { concept, status, evidenceCount: errors.length,
                confidence: errors.length >= 3 ? "high" : errors.length >= 2 ? "moderate" : "low",
                strengthCount: strengths.length, lastObserved: observations[0].created_at,
                errorTypes: [...new Set(errors.map(row => row.kind))] };
        })
    };
}

export function buildBugiLearningContext(profile, student, budget = 720) {
    const current = detectConcepts([student.question, student.code, student.consoleOutput].join(" "));
    const related = new Set(current.flatMap(concept => RELATED[concept] ?? []));
    const topics = profile.topics.filter(row => current.includes(row.concept) || related.has(row.concept))
        .sort((a, b) => Number(b.status === "needs_reinforcement") - Number(a.status === "needs_reinforcement") ||
            Number(current.includes(b.concept)) - Number(current.includes(a.concept)));
    const context = { preferences: [], observations: [] };
    const fits = () => Buffer.byteLength(JSON.stringify(context), "utf8") <= budget;
    for (const preference of profile.preferences) {
        context.preferences.push(preference);
        if (!fits()) context.preferences.pop();
    }
    for (const { concept, status, errorTypes } of topics.slice(0, 4)) {
        context.observations.push({ concept, status, ...(status === "needs_reinforcement" ? { errorTypes } : {}) });
        if (!fits()) context.observations.pop();
    }
    return context;
}

export async function getBugiLearningProfile(db, userId) {
    const { rows } = await db.query(
        `SELECT e.message_id::text, e.concept, e.kind, e.fingerprint, m.created_at
         FROM bugi_messages m JOIN bugi_learning_evidence e ON e.message_id = m.id
         WHERE m.user_id = $1 AND m.created_at >= NOW() - INTERVAL '180 days'
         ORDER BY m.id DESC, e.kind, e.concept LIMIT 300`,
        [userId]
    );
    return summarizeBugiProfile(rows);
}

export function getBugiPracticeRecommendations(profile) {
    return profile.topics.filter(topic => topic.status === "needs_reinforcement")
        .sort((a, b) => b.evidenceCount - a.evidenceCount || new Date(b.lastObserved) - new Date(a.lastObserved))
        .map(({ concept, confidence, evidenceCount, lastObserved, status }) => ({ concept, confidence, evidenceCount, lastObserved, status }));
}

export async function saveBugiLearningEvidence(db, userId, tutorMessageId, evidence) {
    if (!tutorMessageId || evidence.length === 0) return;
    await db.query(
        `INSERT INTO bugi_learning_evidence (message_id, concept, kind, fingerprint)
         SELECT m.id, item.concept, item.kind, item.fingerprint
         FROM bugi_messages m
         CROSS JOIN jsonb_to_recordset($3::jsonb) AS item(concept text, kind text, fingerprint text)
         WHERE m.user_id = $1 AND m.id = $2 AND m.role = 'tutor'
         ON CONFLICT (message_id, concept, kind) DO NOTHING`,
        [userId, tutorMessageId, JSON.stringify(evidence)]
    );
}