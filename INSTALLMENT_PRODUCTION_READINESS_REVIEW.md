# Final installment production-readiness review — 2026-11-25

**Verdict: NO-GO for enabling real installment sales.** The installment calculation is passing; deployment compatibility and student onboarding still have confirmed defects. No production connection, migration, deployment, push, credential change, application-code change or SQL-file change was made during this review. New audit tests and this handoff are local only.

## Executive findings / required fixes

| Priority | Finding | Evidence | Required before activation |
|---|---|---|---|
| P0 | Free-session and multi-audience constraints conflict | Both migration orders reproduced. Existing OR rows make the free-session migration fail; with no existing OR rows all files can apply but new OR sessions fail with 23514 | Correct constraint compatibility in both orders without weakening audience validation; rerun unchanged authorization suite |
| P1 | Open campaign signup loses chosen class/branch | Actual register/verify/quiz/activation HTTP flow stores 2eme/informatique on registration, then NULL/NULL on users | Preserve validated registration class/branch when campaign targets are absent; test targeted/open campaigns and personalized offer eligibility |
| P1 validation | Four obsolete security fixtures block trusted coverage | Missing new route dependencies, old EJS locals, missing badge helper, old participant UI shape/extraction | Update fixture contracts and rerun the same credential, XSS, correct-answer and authorization assertions; do not simply delete or relax them |
| P2 validation | Zoom feature-object expectation is old | Temporary test copy adds freeSessions:true only; all 15 Zoom tests then pass unchanged otherwise | Update the exact expected feature object and retain webhook signature/deduplication assertions |
| P2 validation | Catalog browser text expectations predate badges | Actual UI has annual badge subtext and lowercase renewal note; old assertions compare whole badge and case-sensitive old phrase | Update selectors/text expectations to the approved badge design, retaining overflow, actions and checkout checks |

The profile-loss defect is additional to the original 20 failures. No exploit bypassing payment authorization was found in the executed tests. This is not a blanket security certification and production state was not inspected.

## Accounting for all 20 original failures

There are **18 failing leaf cases and 2 failed parent containers**, not 20 independent application defects.

The following 13 live-suite cases are failures/cascades of the real constraint conflict. With only a candidate constraint correction in the disposable database, **all 17 live-suite tests pass with the original assertions unchanged**:

1. Reschedule authorization, stale changes and once-only notifications.
2. Offer/course/invitation audiences, duplicate selection and API guards.
3. Dashboard/Calendar/join/replay/resource OR authorization.
4. Missing audiences, duplicate links and concurrent final-audience deletion.
5. Timed access expiry/revocation without losing invitations.
6. Zoom cleanup after DB failure.
7. Recurring-date deduplication.
8. Private recording previews, publication order and manual replacement preservation.
9. Exact UUID historical recovery and occurrence isolation.
10. Recording deletion/reference and storage-failure handling.
11. Historical replay/date/course access and retry identity.
12. Finished Zoom replay metadata and local removal.
13. Five-minute join timing and manual completion.

Several original errors are secondary: resources with a missing session owner, NULL session IDs, unexpected cleanup counts, absent access rows, and a 400 instead of 409 after failed setup. They disappear with successful session creation. The failed OR-session parent container is count 14.

Four security leaf failures are obsolete harnesses:

15. Placement credentials: the VM lacks ../utils/zoomClient.js and its old SQL fake knows nothing about campaigns. A replacement real-DB HTTP probe confirms existing password/balance unchanged, no email sent for existing account, proof required, replayed proof rejected, quiz required, only one concurrent activation, no public correct answers, student denied admin routes, user ID derived from JWT for member participation, and duplicate participation rejected.
16. Placement EJS: fixture passes sessionConfig, whereas the actual route supplies campaign and viewer. Static route inspection confirms the actual route supplies both.
17. Admin student rows: isolated renderStudents fixture omits the newly referenced freeSessionBadge function. This failure occurs before its escaping assertions execute; current helper still calls adminText on untrusted values.
18. Placement question/answer UI: fixture assumes a flat old student list and a removed source-code delimiter; it evaluates beyond the script into HTML. Current UI uses participants/pending, and question/answer text still goes through adminText. Its XSS assertions must be ported to the actual new UI contract before sign-off.

19. Zoom webhook feature status: exact object equality lacks freeSessions:true; adding only that field in a temporary test copy gives **15/15 passing**, retaining unsigned/bad-signature rejection, duplicate-event protection and disabled-import behavior.
20. Zoom suite parent fails because of case 19.

The separately executed broad browser test's catalog copy failure is not part of the 20 non-browser failures. It must be updated and rerun too; it is not evidence of a payment calculation defect.

## Exact migration incompatibility

- database/migrations/202611250002_free_session_campaigns.sql:81 adds live_sessions_course_or_free_session requiring course_id IS NOT NULL OR free_session_id IS NOT NULL.
- database/pending-migrations/202611200004_live_session_multi_audience.sql intentionally requires course_id IS NULL for access_policy='any_selected'; course/offer links live in join tables.
- backend/routes/live.js scheduleMultipleAudiences writes this documented shape. Therefore an OR session cannot satisfy both constraints.
- Held-first with an existing OR session: free-session migration fails and rolls back its file. Confirmed old financial rows remain unchanged.
- Free-first followed by held migrations: SQL can complete on empty OR tables, but OR creation fails. A successful migration log alone is insufficient.
- With no OR data, all **20 approved files plus 3 held files** execute; operational compatibility still fails at session creation.
- Custom-installment migration 202611250003 itself has no observed conflict with free sessions, refresh tokens, recordings or access migrations.

A diagnostic-only constraint used course_id IS NOT NULL OR free_session_id IS NOT NULL OR (access_policy='any_selected' AND free_session_id IS NULL), retaining the existing shape checks and deferred requirement for at least one selected course/offer. It was applied only inside disposable databases; it is not a committed production fix.

**Repair sequencing matters:** a new repair migration after 202611250002 cannot rescue a deployment that fails while applying 202611250002 to existing OR rows. Before choosing files, inspect the production migration ledger. If 002 never committed, approve correcting the unapplied migration plus the held-after-free compatibility path. If 002 has committed anywhere, retain its checksum there and design a compatible forward repair/manifest sequence. Never edit an applied file or delete a ledger record to bypass validation. This review deliberately does not promote or silently rewrite migrations.

## Migration inventory / automatic deployment

The approved image manifest is database/migrations (20 files):

- 202611050001_create_notifications.sql
- 202611050002_create_course_modules.sql
- 202611050003_add_lesson_quiz_content.sql
- 202611050004_create_learning_resources.sql
- 202611100001_add_live_session_audience.sql
- 202611100002_ensure_google_auth_schema.sql
- 202611100002_ensure_offer_payment_status.sql
- 202611100003_unique_active_offer_payments.sql
- 202611110001_create_bugi_messages.sql
- 202611110002_create_bugi_learning_evidence.sql
- 202611110003_add_bugi_history_revision.sql
- 202611110004_add_timed_offer_access.sql
- 202611120001_reconcile_timed_offer_terms.sql
- 202611120002_offer_upgrade_credit.sql
- 202611200003_create_zoom_recording_imports.sql
- 202611240001_zoom_recording_reliability.sql
- 202611240002_recording_trash_retention.sql
- 202611250001_notification_popup_acknowledgment.sql
- 202611250002_free_session_campaigns.sql
- 202611250003_custom_installment_amounts.sql

Held, excluded from the Docker COPY and automatic directory (no promotion in this review):

- 202611200001_create_refresh_tokens.sql
- 202611200002_extend_live_session_access.sql
- 202611200004_live_session_multi_audience.sql

The held multi-audience file requires extend_live_session_access first; recording base precedes reliability and trash; custom amounts require offer_upgrade_credit and access/reconciliation predecessors. Full filename, not numeric prefix alone, is the ledger key; the two existing 202611100002 filenames are distinct.

backend/Dockerfile starts npm run migrate && npm start. backend/scripts/migrate.js uses the existing central pool, a connection-scoped advisory lock, filename/checksum ledger, LF-normalized hashes and one transaction per file. It applies **unapplied approved files**, not every file in pending-migrations. Feature flags do not suppress migrations.

Executed with the real runner source and a virtual file inventory on disposable PostgreSQL:

- Two migration orders, all approved and held files; no promotion required for test.
- Repeated runs applied nothing again. Two concurrent starts competed for a genuinely pending synthetic migration: exactly one application, one probe row and one ledger entry. No file executed twice.
- Injected SQL error after CREATE TABLE: table and its ledger entry rolled back; exit code 1.
- Applied checksum mutation: rejected; exit code 1.
- Destructive DROP TABLE probe: rejected before execution; exit code 1.
- Existing OR row causes real free-migration failure; file rolls back, earlier successful files remain committed.

**Important limit:** transactions cover each file, not the entire deployment batch. An earlier successful migration stays committed when a later one fails. The Docker command blocks the new application on nonzero migration exit, but actual Coolify custom-command/health-check/rolling-deployment settings have not been inspected. A custom npm start override would bypass this gate and must not be used.

## Financial / access preservation evidence

Before free/custom/held migrations, synthetic production-shaped annual purchases and confirmed schedules were seeded. Compared complete rows before and after both orders and repeated/concurrent runs, including failure probes:

- offer_installment_arrangements (agreed price, paid total, grant link and NULL deadline).
- offer_installment_schedule (100/100/190, dates including an undefined date).
- offer_installment_payments, payments and transactions.
- offer_access_grants and grant-course links (including original expiry).
- enrollments and lesson_progress.
- User balances/password hashes and the computed existing course-access result.

All compared rows/values remained identical. The installment regression also reran concurrent/duplicate operations, monthly credit exclusion, source debt, corrections/reversals, financial reconciliation and rollback. This establishes preservation in disposable seeded data, not verification of actual production records or every historical production schema variant. A production-backup restore rehearsal is still required before activation.

## Environment variables and hidden schema work

**No new production environment variable is introduced by custom installments or this review.** Existing flags remain:

- TIMED_OFFER_SALES_ENABLED=false and TIMED_OFFER_UPGRADES_ENABLED=false until separate activation approval. Both must be true for scheduled upgrade checkout.
- TIMED_OFFER_REMINDERS_ENABLED controls reminders separately.
- LIVE_MULTI_AUDIENCE_ENABLED controls new multi-audience creation; false does not repair the schema or disable reads of existing OR sessions.
- Preserve existing Zoom/R2 credentials and configuration. ZOOM_RECORDING_IMPORT_ENABLED does not control migrations.
- Existing DATABASE_URL, DB_SSL, JWT_SECRET and normal Zoom/R2 settings remain required; no values were exposed or rotated.

**Cannot truthfully confirm that the entire application has no hidden/request-time DDL.** Pre-existing code still has:

- backend/routes/admin-api.js ensureOffersSchema: adds discount_percentage, valid_from, features, is_best_seller, image_url.
- Same file ensureUsersSchema: adds users.debt.
- backend/routes/user-api.js ensureTransactionsSchema: adds payment_method, transaction_code, description, is_confirmed, processed_at, receipt_url.

These were not introduced or changed by this review. Some are in the base schema; users.debt and offer presentation fields are not all established by the current versioned manifest. Inventory them on the restored production schema. Move any genuinely required missing legacy columns into reviewed migrations before removing these runtime helpers; do not promise migration-only schema management while they remain. This is a rollout risk, not evidence that the new amount migration silently rewrites money.

## Executed tests / limits

- readiness-final-validation.log: **20/20 pass** = 4 audit probes plus 16 focused installment/API/SQL/Chrome cases. The probes deliberately reproduce the known defects; they do not mean the defects are fixed.
- readiness-live-diagnostic.log: **17/17 pass**, candidate constraint only in disposable DB, original access assertions unchanged.
- readiness-recording-diagnostic.log: **15/15 pass**, only outdated expected feature field corrected in temporary test copy.
- Original full-suite result remains **101 pass /20 fail /14 skipped**; application and original failing tests were not changed during this review.
- Mobile/desktop installment UI rerun at 390/1440px. No hosted checkout, real Zoom/R2 event, actual production backup or Coolify deployment was executed.
- New reproducible audit file: backend/tests/production-readiness.test.js. Run explicitly with existing BUGI_QA_POSTGRES_PORT and --experimental-vm-modules; it is not silently added to npm test and does not turn known defects into product expectations.

## Production deployment / activation checklist — do not execute yet

1. **Resolve blockers first:** approve and implement the two compatibility/signup corrections, port obsolete security fixtures without removing assertions, update Zoom/catalog expectations, rerun the full non-browser and browser suites. Require actual entitled/unauthorized access and money checks to pass.
2. Freeze a reviewed commit and exact migration manifest. Verify no secrets, no unrelated held migrations, no edits to already-applied checksums. Verify Coolify uses the Dockerfile command without override.
3. Record current image identifier and non-secret configuration/flag states. Confirm a compatible application rollback image exists; an automatic-only installment build is not compatible with active custom plans.
4. Create a consistent encrypted PostgreSQL backup using Coolify backup or pg_dump custom format. Test restoring it to isolated staging. Preserve R2 objects and recording pointers; the new amount migration needs no R2 lifecycle/config change.
5. On the restored copy, compare migration ledger/schema to the release manifest, count existing OR rows, run the corrected full migration sequence, verify old row snapshots, user access and balances, and rehearse rollback. This addresses real production schema drift that empty-schema tests cannot prove away.
6. Keep new timed sales/upgrades disabled. Arrange a maintenance/write-quiescence window. If any recording fencing migration is unapplied, stop every old recording worker/backend replica before applying it; never run old unfenced workers beside the new schema. Preserve existing live/Zoom behavior otherwise.
7. After separate deployment approval, deploy through Coolify. Let the runner apply only approved missing files. Expect one applied line per missing file and already applied on restart. Any migration error stops the new app; do not force startup or delete the ledger.
8. Check runner completion, checksums, schema constraints, feature detection and worker diagnostics. Verify old paid courses, replays, resources, calendar access, wallet/history and historical NULL deadlines before enabling new sales. HTTP 200 alone is insufficient if feature detection failed.
9. Perform synthetic hosted smoke tests with the exact production build: one/two/three payments, custom amounts, credit-only and partial-source upgrades, exact expiry/dates, late full-payment rule, wallet and admin-verified external payments, duplicate click/concurrent request, reversal/audit history, source debt and unauthorized requests. Verify receipt uniqueness, balance debited once, no fake cash for credit and no retroactive expiry changes.
10. Real production checkout smoke tests require separate authorization and a controlled test account/maintenance window. Existing flags are global, not a synthetic-account allowlist; do not pretend that enabling them affects only QA accounts. Confirm the charge, sales/debt totals, grant and history once; use approved audited correction workflows for test payments, never SQL deletion or arbitrary refunds.
11. Only after financial/access checks and explicit activation approval enable the required sales/upgrades flags. Enable reminders separately after verifying once-only eligible notifications. Monitor failed quotes, duplicate receipts, balances, grant creation, feature detection and recording jobs.

Optional **read-only** verification queries for an authorized Coolify console later (no production query was executed here):

~~~sql
SELECT to_regclass('schema_migrations') AS ledger;
-- Run the next query only if ledger exists:
SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='live_sessions'::regclass AND conname IN ('live_sessions_course_or_free_session','live_session_policy_shape');
SELECT COALESCE(to_jsonb(ls)->>'access_policy','legacy') AS policy, count(*)
 FROM live_sessions ls GROUP BY 1;
~~~

## Rollback precautions

- Stop new financial writes and disable timed sales/upgrades. Keep records from successful payments; do not revoke grants or modify agreed dates as part of rollback.
- Prefer reverting to a compatible build while retaining additive schema and ledger entries. Do not use an automatic-only checkout build for custom plans.
- A failed migration file rolls itself back; earlier committed files remain. Reverting an image does not undo those changes.
- Do not drop tables/columns, delete migration ledger rows, remove R2 objects or repoint published replays. Do not rewrite an applied migration to make checksums pass.
- Restore the DB backup only through a separately approved recovery plan accounting for every payment/write after the backup; a blind restore could erase real charges.

**Activation gate:** fix the real OR/free migration conflict and open-campaign profile loss, restore meaningful security/UI test coverage, rehearse the corrected sequence on a production backup restore, and complete hosted financial/access smoke tests. Until then: **NO-GO**.
