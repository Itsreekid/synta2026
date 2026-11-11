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

## Deep Learning Intelligence credential smoke test

Use a separate staging app and Gemini project. The smoke command below calls the real Learning Intelligence service once with synthetic observations and a database adapter that performs no database I/O. It does not use the Bugi staging QA credential or the production chat key. Run it only after approving the single live request.

1. In staging Coolify, confirm the app is isolated and inject the dedicated key as LEARNING_GEMINI_API_KEY. Leave GEMINI_API_KEY as configured for that staging app. Do not print either value.
2. From the staging backend directory (inside the image this is /app), run:

   ```sh
   NODE_ENV=staging LEARNING_GEMINI_SMOKE=staging LEARNING_GEMINI_ENABLED=true node scripts/smoke-learning-intelligence.js --execute
   ```

3. Inspect the command's stdout for event learning_intelligence_staging_smoke and status ready, with a positive itemCount. The command prints only the status, count and elapsed milliseconds. Output from an interactive terminal may not be collected by Coolify's app logs. To retain it there, use a separate, approved one-off staging job that captures stdout. Do not put the smoke command in normal startup.
4. If the result is not_configured, invalid_configuration, disabled, rate_limited, or unavailable, investigate in staging. Do not retry automatically. Ordinary backend startup and chat traffic do not emit a Learning Intelligence success event because neither invokes deep analysis.

The internal service currently has no HTTP endpoint or scheduled caller. A future externally reachable caller must authenticate, derive the student identity from its authorized session and enforce a per-student request limit. Provider quota backoff is process-local and separate from that limit.
