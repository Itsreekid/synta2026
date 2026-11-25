# Custom installment validation — 2026-11-25

## Result

Implemented locally. Focused installment/API/database/Chrome validation: **16 passed, 0 failed**. No production access, production migration, push, deployment or real payment. Production readiness remains blocked by existing repository regression failures and unperformed hosted validation.

## Files

- backend/services/offer-upgrades.js: custom amount validation, buffered automatic/manual civil dates, policy persistence, fingerprinting and shared transaction support.
- backend/services/timed-offers.js: read the new offer settings.
- backend/routes/admin-api.js: atomically save offer metadata/price and payment policy using the existing requireAdmin route.
- backend/routes/timed-offers.js: policy metadata and safe FULL_PAYMENT_REQUIRED response code.
- backend/public/admin/pages/offers.html: existing popup amount controls, totals, automatic/manual dates and combined save.
- backend/public/js/offer-upgrade-checkout.js: clear full-payment-only fallback requiring a fresh quote.
- backend/tests/timed-offers.test.js: new unit, SQL, API, snapshot and mobile/desktop scenarios; existing annual installment fixtures extended to permit the newly approved buffer. Near-cutoff rejection is tested explicitly rather than retaining the old now-disallowed split.
- backend/tests/security.test.js: include the new service import in its VM dependency map; existing assertions unchanged.
- database/migrations/202611250003_custom_installment_amounts.sql: additive settings and constraint.
- CUSTOM_INSTALLMENT_AMOUNTS_PLAN.md, DATABASE_SCHEMA.md, BUSINESS_RULES.md, ARCHITECTURE.md, IMPLEMENTATION_PLAN.md, CHANGELOG.md, CURRENT_STATE.md: updated contracts and handoff.

## Executed checks

Disposable PostgreSQL only, synthetic accounts/payments. The actual deployment runner applied the complete approved migration directory to legacy-shaped seed data and repeated without reapplying migrations, including 202611250003. SQL constraints rejected malformed plans, wrong sums, unsupported amounts and incompatible price updates.

Unit checks: 390=100/100/190; separate two-payment amounts; automatic fallback; invalid totals, nonpositive amounts, minimum conflicts; earliest-first credit (100/180/300) and full payment. Existing 440 DT credit examples remain passing. Date checks: Dec/Feb/Apr and Dec/Mar examples, January 31, short months, leap February, irregular intervals, last valid buffered date, full-payment boundary, missing/nonincreasing/late manual deadlines.

API/SQL checks: unauthorized admin save; valid atomic price/plan save; failed totals leave old price; failed source-policy validation rolls back title; direct SQL rejects bad JSON plans and price drift; edited policy invalidates quotes; confirmed schedule rows stay byte-equivalent after amount/mode/offset changes. Existing concurrent checkout/renewal, duplicate credit/payment requests, original source debt, expired evidence, correction/reversal, financial reconciliation, independent grants, access authorization, transaction rollback and reminders still pass in the focused suite.

Chrome at **390px and 1440px**: open existing admin offer popup, configure/save custom three-payment amounts, automatic/manual date-field visibility, hidden automatic amount inputs, exact totals, responsive overflow checks, student quote 100 now + 100/190 later, late-purchase full-payment message/selector and unchanged wallet without confirmation. Screenshots captured and inspected for admin/student mobile and desktop. No browser-console errors in the new custom-payment scenario. Hosted staging and physical phones were not tested.

JavaScript syntax checks and git diff --check passed.

Command (backend/tests paths from repository root):

    node --experimental-vm-modules --test --test-concurrency=1 --test-skip-pattern="desktop and mobile Chrome checkout" backend/tests/timed-offers.test.js

With BUGI_QA_POSTGRES_PORT and TIMED_QA_CHROME set to local disposable services. This focused run deliberately excludes the separately reproduced pre-existing catalog browser scenario; it is not presented as a complete regression pass.

## Full regression results and independent baseline

The complete package.json test suite was executed with disposable PostgreSQL and without browser flags: **135 tests; 101 passed, 20 failed, 14 skipped**. Untouched HEAD **4d0c7e1** was independently extracted to a temporary directory and run with the same setup: **132 tests; 98 passed, 20 failed, 14 skipped**. The 20 failure names match exactly (including failing parent tests). No claim that these failures are harmless production behavior is made.

Existing failures concern live multi-audience/session fixtures, placement/free-session security fixtures, and recording feature-status expectations after the separate free-session changes. They are outside this financial change and were not rewritten or hidden. The broad timed-offer Chrome scenario also fails its old annual/monthly badge-copy assertions at 320px; this exact failure was independently reproduced in the untouched HEAD browser run. The new custom-payment browser scenario passes separately.

Local ignored logs: installment-focused.log, installment-regression.log, installment-baseline.log, installment-baseline-browser.log and installment-pg-test.log. Intermediate logs contain earlier failures and should not be mistaken for the final focused result.

## Deployment / rollback gate

Only 202611250003 was added/promoted for this task; no unrelated pending migration changed. It requires 202611120002 and the already approved access/reconciliation schema. Existing runner applies it before app startup; no new environment variables. TIMED_OFFER_SALES_ENABLED and TIMED_OFFER_UPGRADES_ENABLED retain their existing behavior and disabled defaults.

Do not deploy from this report alone. Review other already-present manifest migrations (including the separately changed free-session migration), back up, resolve/review the baseline failures, run synthetic hosted checkout/history checks, and obtain deployment authorization. Confirm migration ledger and saved policies before enabling real sales.

Rollback: retain schema and financial snapshots. Disable timed sales/upgrades before reverting to an automatic-only application; prefer a compatible build. Never drop columns, erase migration records, reprice existing arrangements or revoke existing grants.
