# Bugi live Gemini validation

Use a dedicated staging Gemini project and synthetic data. The runner reads no database and never uses the app's GEMINI_API_KEY. It uses the app's normal prompt, primary model, reply parser, evidence validator and context builder.

Run `node backend/scripts/validate-bugi-gemini.js --dry-run` to verify the fixtures and context selection without any API calls. For live validation, inject BUGI_STAGING_GEMINI_API_KEY from a staging secret, set BUGI_LIVE_QA to staging and run `node backend/scripts/validate-bugi-gemini.js --show-replies`. Production mode is rejected. A full run attempts six calls and stops early on quota exhaustion.

| Fixture | Expected signal | Label rationale |
|---|---|---|
| en-misconception | misconception:variable-vs-string | The learner explicitly expected a quoted variable name to display its assigned value. |
| fr-explanation | interest:loops | A request for an example offers no evidence of difficulty. |
| latin-darja-syntax | syntax:loops | The learner repeats a loop question with a concrete parser error and missing colon. |
| ar-correction | demonstrated:loops | The learner reports testing a loop and applying break at the first match. One signal alone does not imply proficiency. |
| mixed-proficiency | demonstrated:loops | The learner explains exactly which values range yields and why. |
| mixed-uncertain | no signal | A vague report without code or output provides insufficient evidence. |

The report compares accepted evidence to these hand-labeled fixtures and prints false positives, false negatives, missing or malformed metadata, selected concepts, request latency and provider prompt tokens when available. Inspect the visible replies with --show-replies. Check whether each reply addresses the current question, uses the relevant profile hint naturally, excludes unrelated topics, and avoids revealing internal learning labels. The context relevance check is automated. Teaching quality and response-level personalization require human review. These six fixtures are a smoke test, not a statistically representative dataset.
