# Custom installment amounts and deadlines — implemented locally, 2026-11-25

Owner approved the final schema and financial rules. No production migration, push or deployment performed.

## Behavior

The existing Modifier l’offre popup supports independent optional two- and three-payment amount plans. Example: 390 DT = 100 + 100 + 190 DT. A missing custom count keeps equal splitting. Full payment stays available. Positive amounts must sum exactly to the price; custom first payments must meet the configured initial minimum. All arithmetic uses integer minor units or PostgreSQL NUMERIC, without floating-point money summation.

Eligible non-monthly upgrade credit consumes the earliest installments first. Existing monthly exclusion, source debt acknowledgment, wallet/external payment verification, idempotency, transaction boundaries and independent access grants are retained. Credit is not new cash. Existing confirmed schedules never recalculate when policy settings change.

## Dates

Default automatic dates use Africa/Tunis civil coverage-start dates and the inclusive annual cutoff. First payment is immediate. The last later payment is due at least one calendar month before the cutoff, with month-end clamping. An exact whole-month interval divisible by the payment count uses anchored month spacing. Otherwise use a uniform whole-day interval, shortened to fit the buffer. No positive spacing means full payment only; the student must obtain and confirm a new full-payment quote.

Example: 1 December 2026 through 31 May 2027 inclusive: three payments on 1 December / 1 February / 1 April; two payments on 1 December / 1 March. Latest permissible later date: 30 April 2027. Admin-selected manual offsets are positive, increasing days from coverage start; checkout rejects missing dates or dates after the buffer. Saving retained offsets does not guarantee they remain usable for every later purchase.

Legacy confirmed arrangements retain their original amounts and dates, including NULL due dates shown as Aucune échéance définie. No automatic suspension, debit, debt cancellation or expiry change is introduced.

## Additive migration and compatibility

Approved file: database/migrations/202611250003_custom_installment_amounts.sql. Depends on 202611120002_offer_upgrade_credit.sql and its reconciliation/access dependencies. Adds offers.installment_custom_amounts JSONB (nullable), immutable exact-total/minimum/count validator and CHECK; adds installment_deadline_mode TEXT NOT NULL DEFAULT 'automatic' CHECK automatic/manual. No financial history backfill. Existing offer amounts stay automatic until configured; future annual quote dates default to automatic, with retained offsets available in manual mode.

Only this installment migration was promoted for this task. No unrelated pending migration was promoted. Existing automatic Coolify startup migration runner applies it once before serving the updated app, using its ledger, checksum, transaction and deployment lock. Production execution remains separately authorized.

## API and UI

Existing requireAdmin GET/PUT /api/admin/offers/:offerId/upgrade-policy adds customAmounts and deadlineMode. GET exposes stored price/minimum for dirty-form checks. POST /api/admin/offers accepts payment_policy on an existing offer; locks all involved offers in sorted order and commits metadata, price, amounts and source rules in one transaction. Invalid rules roll everything back. Standalone rule save requires using the already saved price/minimum; the main Enregistrer saves price/minimum and plans together.

Student quote/confirm routes remain JWT-protected and derive identity server-side. Quotes use actual custom amounts and exact dates and fingerprint all policy settings. FULL_PAYMENT_REQUIRED is returned for insufficient time; checkout restricts the selector to full payment and requires a fresh explicit quote/confirmation. Confirmed schedules, payments, history and entitlements retain existing storage.

## Local validation / remaining gates

See CUSTOM_INSTALLMENT_VALIDATION.md for executed tests and baseline failures. Real staging and production were not accessed. Existing timed-sales and upgrades flags are unchanged and disabled by default; no new environment variable is needed.

## Safe activation and rollback

Before an authorized deployment: back up PostgreSQL, resolve/review the unrelated baseline failures and any other migrations already in the deployment manifest, then deploy a compatible build through the current runner. Do not assume other pending files will run. Verify migration ledger/schema, configure amount plans in the existing admin popup, and verify synthetic checkout/credit/dates/history before enabling real transactions.

Rollback retains the additive columns and all schedules/financial evidence. Disable TIMED_OFFER_SALES_ENABLED and TIMED_OFFER_UPGRADES_ENABLED before using an older automatic-only checkout build: it would ignore custom amounts. Prefer a compatible application rollback; do not drop columns, delete migration-ledger rows, rewrite schedules or revoke grants.
