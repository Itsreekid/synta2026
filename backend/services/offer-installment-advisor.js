import { amount, fail, validDate } from "./timed-offers.js";
import { installmentBreakdown } from "./offer-upgrades.js";

const day = 86400000;

export async function suggestInstallments(input) {
  const { price, minimum, count, cutoff } = input;
  if (![2, 3].includes(count) || !validDate(cutoff)) fail(400, "Choisissez 2 ou 3 paiements et une date de fin valide.");
  const total = amount(price);
  const floor = minimum ? amount(minimum) : null;
  if (floor && Number(floor.replace(".", "")) > Number(total.replace(".", ""))) {
    fail(400, "Le minimum de la première tranche dépasse le prix.");
  }
  const plan = installmentBreakdown(total, count, floor, "0.00");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Tunis", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const available = (Date.parse(cutoff + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / day;
  if (available < 0) fail(400, "La date de fin de l’offre est passée.");
  const ceiling = Math.min(available, 366);
  const fallback = Array.from({ length: count - 1 }, (_, index) =>
    Math.min(30 * (index + 1), Math.floor(ceiling * (index + 1) / count)) || null);
  const valid = offsets => Array.isArray(offsets) && offsets.length === count - 1 &&
    offsets.every((value, index) => value === null || (Number.isInteger(value) && value > 0 && value <= ceiling &&
      offsets.slice(0, index).every(previous => previous === null || previous < value)));
  const defaults = valid(fallback) ? fallback : Array(count - 1).fill(null);
  const result = (offsets, source) => ({ ...plan, offsets, source, exampleDates: offsets.map(offset =>
    offset === null ? null : new Date(Date.parse(today + "T00:00:00Z") + offset * day).toISOString().slice(0, 10)) });
  const key = process.env.LEARNING_GEMINI_API_KEY?.trim();
  if (!key || key === process.env.GEMINI_API_KEY?.trim() ||
      process.env.LEARNING_GEMINI_ENABLED?.trim().toLowerCase() === "false" || ceiling < 1) {
    return result(defaults, "standard");
  }
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        generationConfig: { maxOutputTokens: 120, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "minimal" } },
        contents: [{ parts: [{ text: `Suggest transparent, manageable payment spacing for a Tunisian education offer.
Price: ${total} TND. Payment count: ${count}. Initial amount: ${plan.dueNow} TND.
Remaining balances by installment: ${plan.schedule.map(row => row.remaining).join(", ")} TND.
Example confirmation date in Tunis: ${today}. Inclusive cutoff: ${cutoff}.
Return only {"offsets":[...]} with ${count - 1} entries. Use increasing integer days from confirmation (1 to ${ceiling}), or null if an appropriate deadline cannot be proposed. Prefer roughly monthly spacing when time permits. Do not use urgency or personal data.` }] }]
      })
    });
    if (response.ok) {
      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const { offsets } = JSON.parse(parts.filter(part => !part.thought).map(part => part.text || "").join(""));
      if (valid(offsets)) return result(offsets, "gemini");
    }
  } catch {
    // A provider failure leaves the standard preview available.
  }
  return result(defaults, "standard");
}
