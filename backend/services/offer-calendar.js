import { fail, validDate } from "./timed-offers.js";

const model = "gemini-3.5-flash-lite";
export async function calendarSuggestions(db, year, refresh = false) {
  if (!Number.isInteger(year) || year < 2000 || year > 9998) fail(400, "Année scolaire invalide.");
  if (!refresh) {
    const { rows: [cached] } = await db.query(
      "SELECT suggestions,fetched_at FROM offer_academic_calendars WHERE academic_year_start=$1", [year]);
    if (cached) return { ...cached.suggestions, fetched_at: cached.fetched_at, cached: true };
  }
  const key = process.env.LEARNING_GEMINI_API_KEY?.trim();
  if (!key || key === process.env.GEMINI_API_KEY?.trim() ||
      process.env.LEARNING_GEMINI_ENABLED?.trim().toLowerCase() === "false") fail(503, "Suggestions indisponibles.");
  let payload;
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(18000),
      body: JSON.stringify({
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 1200, thinkingConfig: { thinkingLevel: "minimal" } },
        contents: [{ parts: [{ text:
          `Find published Tunisia Ministry of Education and JORT dates for academic year ${year}-${year + 1}.
Prefer official and recent publications. Do not infer missing dates.
Return one line per verified cutoff, as bac_main=YYYY-MM-DD, classes_end=YYYY-MM-DD,
bac_control=YYYY-MM-DD. Use last exam day, not first. Omit uncertain dates.`
        }] }]
      })
    });
    if (response.status === 429) fail(429, "Quota des suggestions atteint.");
    if (!response.ok) fail(503, "Suggestions indisponibles.");
    payload = await response.json();
  } catch (error) {
    if (error.status) throw error;
    fail(503, "Suggestions indisponibles.");
  }
  const candidate = payload.candidates?.[0];
  const metadata = candidate?.groundingMetadata;
  const dates = {};
  const sources = [];
  const sourceUrls = new Set();
  for (const [partIndex, part] of (candidate?.content?.parts ?? []).entries()) {
    if (part.thought || typeof part.text !== "string") continue;
    for (const match of part.text.matchAll(/^(bac_main|classes_end|bac_control)=(\d{4}-\d{2}-\d{2})[ \t]*$/gm)) {
      const [, label, date] = match;
      if (dates[label] || !validDate(date) || date < year + "-09-01" || date >= (year + 1) + "-09-01") continue;
      const start = Buffer.byteLength(part.text.slice(0, match.index + label.length + 1), "utf8");
      const supports = (metadata?.groundingSupports ?? []).filter(item => item.segment &&
        (item.segment.partIndex ?? 0) === partIndex && (item.segment.startIndex ?? 0) <= start &&
        item.segment.endIndex >= start + 10);
      for (const support of supports) for (const index of support.groundingChunkIndices ?? []) {
        const web = metadata?.groundingChunks?.[index]?.web;
        if (typeof web?.uri !== "string" || web.uri.length > 2048 || sources.length >= 12) continue;
        try { if (new URL(web.uri).protocol !== "https:") continue; } catch { continue; }
        const identity = label + ":" + web.uri;
        if (!sourceUrls.has(identity)) {
          sources.push({ label, url: web.uri, title: String(web.title ?? "").slice(0, 160) });
          sourceUrls.add(identity);
        }
        dates[label] = date;
      }
    }
  }
  if (!Object.keys(dates).length) fail(503, "Aucune date vérifiable. Saisissez la date manuellement.");
  const result = { dates, sources };
  await db.query(`INSERT INTO offer_academic_calendars(academic_year_start,suggestions) VALUES($1,$2)
    ON CONFLICT(academic_year_start) DO UPDATE SET suggestions=EXCLUDED.suggestions,fetched_at=NOW()`, [year, result]);
  return result;
}
