> Readiness update, 2026-11-26: hosted staging was explicitly waived. Alias migration is locally promoted unchanged. Earlier staging/HELD status below is historical; see PRODUCTION_RELEASE_READINESS_20261126.md and latest CURRENT_STATE.md for current tests and release gates. Production execution still requires explicit approval.

# Session migration compatibility — 26 November 2026

Local correction validated. **Production remains NO-GO pending schema verification, intermittent-test classification, authorized staging rehearsal and explicit deployment approval.** Nothing was pushed, deployed or executed against production. The funnel migration remains held.

## Root cause

`202611250002_free_session_campaigns.sql` adds `live_sessions_course_or_free_session`, requiring `course_id IS NOT NULL OR free_session_id IS NOT NULL`. The multi-audience migration intentionally stores `any_selected` audiences in `live_session_courses` and `live_session_offers` and requires the legacy direct fields to be NULL. The constraints therefore contradict one another. Existing valid OR rows prevent the original free migration from executing; empty tables can migrate but then reject new OR sessions. This caused the 13 failing live subtests and their parent failure.

The existing `live_session_policy_shape` and deferred audience-link constraint triggers are necessary safeguards, not obsolete tests. They remain unchanged. Student permission predicates and payment business logic were not modified in this fix.

## Correction and execution order

The original file is **unchanged**, including its normalized SHA-256:

`889fbb8098cdfb605ce11ee063cd4251515d3dc34f7d97cf3b64c5acbeb844e1`

New file: `database/migrations/202611260001_live_session_shape_compatibility.sql`.

It contains an explicit compatible bootstrap of the original approved campaign schema and backfill for databases where the original has not run. Where the original is already recorded, it performs the CHECK repair only. The final CHECK permits three shapes:

1. A standard course session with a direct course and no free campaign.
2. A free-campaign session without a direct course, using legacy policy.
3. An `any_selected` session without a direct course or free campaign. Existing policy-shape constraints and deferred triggers still require valid course/offer relationship rows and serialize audience mutations.

The optional `access_policy` is read through `to_jsonb(live_sessions)`. This keeps the CHECK valid before and after the held audience migration adds that column. No early duplicate policy column, fabricated course, temporary data rewrite, dropped authorization trigger or new ledger column is needed. The original free-session shape CHECK is retained; existing additional invitation fields still cannot bypass free-session authorization.

`backend/scripts/migrate.js` has one explicit, exact-hash-pinned supersession mapping. It executes the correction **at the original migration's dependency position**, before custom installments and the held funnel, even though the correction has a later filename. It does not merely append a later repair after the failing original. Both source files and their pinned contents must be present.

Ledger behavior:

| Existing state | Behavior |
|---|---|
| Original not applied, no campaign schema | Execute compatible bootstrap/repair; record the actual correction filename and checksum only. Do not fabricate an original receipt. |
| Exact original already applied | Verify and preserve its existing checksum and timestamp; execute/record constraint correction. |
| Correction already applied | Verify its checksum and skip execution; original remains explicitly superseded or preserved. |
| Unknown original checksum, changed replacement, missing inventory file | Fail closed before applying pending files. No checksum rewrite or automatic baseline. |
| Campaign schema exists without tracked original, or receipt/schema disagree | Stop for explicit reconciliation. Do not guess or recreate lost data. |
| Existing mixed free/OR rows violate supported shapes | Abort transaction and retain the original data/CHECK. Administrator must review evidence before any data correction. |

The runner retains the existing advisory lock, normalized CRLF/LF checksums, per-file transactions, destructive-SQL guard and Docker `migrate && start` gate. It now prevalidates all supplied applied checksums before executing pending files. Failed files have no ledger receipt; earlier successfully committed files remain committed, as before.

## Validation

All database work used disposable PostgreSQL 16 on localhost, synthetic records and mocked Zoom/R2/email/Google services. This is not production or hosted-provider evidence.

- New compatibility tests cover original applied/unapplied states, pre-existing OR sessions, all supported migration orders, text-typed legacy date/score fields, preserved Zoom/replay fields, concurrent execution, repeat execution, unknown hashes, missing/changed correction files, untracked/incomplete schemas, mixed invalid historical rows, bootstrap rollback and successful retry.
- Updated readiness tests require successful compatibility rather than asserting the old defect. They compare complete financial rows, confirmed grant-backed installment arrangements, schedules including NULL deadlines, collections, enrollments, progress, credentials, balances and access results before/after migration, repeat and failure cases.
- Existing live API tests retain authorization assertions for offer-only, course-only and invited audiences, expired/revoked students, protected resources, replay publication/deletion/recovery, duplicate visibility and five-minute joining. Free-funnel tests retain exact-occurrence reservation and paid-isolation checks.
- Final full regression with PostgreSQL and Chrome: **164 tests, 163 passed, one failed, zero skipped**. All original migration-related failures pass. The one failure is the unchanged Video.js playback-rate assertion (observed 1 instead of 1.75 immediately after the menu click). Its isolated rerun passed 1/1. This is intermittent browser evidence, not a confirmed migration defect or a fully green suite; its precise cause remains unproven and should be resolved/classified before release.
- Dedicated compatibility suite: **10/10 passed**, including the supplied production-ledger reconstruction. Replay-management browser suite after API-fixture correction: **5/5 passed**.
- Public funnel browser widths: 320/375/390/430/768/1440px; admin and replay checks include 360/390/1440px. Existing checkout/financial views were exercised at mobile/desktop widths. No physical-device or hosted-provider validation was performed.
- Separate final non-browser repeat: **159 tests, 143 passed, two failed, 14 skipped**. The two failures are one exact five-minute join-boundary assertion plus its parent; the same live/multi-audience suite passed **17/17 in isolation** and passed in the full Chrome run. Its timing intermittence is not explained by a CHECK violation. Earlier non-browser run was 144 passed / zero failed /14 skipped (158 tests, before adding the supplied-ledger case). Do not hide these inconsistent results or call the entire suite reliably green.
- Remaining test risks: intermittent playback-rate observation and cross-request exact join-boundary timing. No timing/security assertion was weakened, no join rule or player implementation was changed, and both require classification before a production GO.

No security assertion was removed to make the suite pass. No held audience, refresh-token or funnel file was promoted. The new correction is the only new deployment SQL for this fix. No new environment variables or dependencies are required.

Files changed specifically for this fix: `backend/scripts/migrate.js`, the new compatibility SQL, `backend/tests/session-migration-compatibility.test.js`, `backend/tests/fixtures/session-manager-fixture.js`, the owner-supplied filename/hash fixture under `backend/tests/fixtures/`, `backend/tests/production-readiness.test.js`, `backend/package.json`, and project documentation. The existing replay-editor browser fixture now models the real OR API: enabled multi-audience feature, complete course/offer arrays and NULL legacy primary fields. The earlier fixture omitted offer_ids and reported multi-audience disabled, causing render failure during its 390px case. Browser waits also require enabled controls/save completion; all original assertions remain. Initial full browser runs recorded one failure from this inconsistent fixture; the corrected replay-management browser suite passes 5/5 without changing application code.

## Production evidence still required

The owner supplied the production ledger (20 rows) during validation. Every filename and normalized SHA-256 matches the repository. In particular, the original free migration was applied on 2026-11-25 at 02:40:29.207809+00, and custom installments at 22:25:26.713633+00. Therefore this production environment takes the **constraint-only repair** branch. No original bootstrap/backfill or historical ledger rewrite is needed. The test fixture records only the supplied filenames/checksums, no credentials or student data.

The ledger does not list held refresh-token, extended-audience, multi-audience or funnel migrations. This is evidence about tracked applications, not proof that no manual schema changes exist. No direct production connection was used. A local test reconstructs all 20 historical applications, verifies all hashes and retained receipts, preserves synthetic course/free/Zoom/replay history, applies only the correction and confirms held migrations remain absent.

For a deployment-time recheck, use:

```sql
SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename;
```

Also inspect the current constraint definitions and audience schema, without reading student records:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'live_sessions'::regclass
ORDER BY conname;
```

An older original revision/checksum is not automatically accepted. Reconcile it against the actual deployed source before approving any additional compatibility mapping. Do not update ledger hashes manually to suppress a mismatch.

## Safe deployment checklist — instructions only

1. Retain the supplied 20-file ledger evidence (all hashes match). Obtain current constraint/column evidence to verify actual audience state and complete schema, including any untracked changes. Keep production NO-GO until staging and deployment approval gates pass.
2. Rehearse this exact image/manifest against a restored, sanitized production-shaped backup. Keep the held funnel outside the image until separately approved; do not promote other pending files as a side effect.
3. Obtain explicit deployment approval. Back up the database and verify restore capability; retain the current application image and recording/object references.
4. Use a maintenance/startup window: CHECK replacement requires a PostgreSQL table lock and validates existing rows. Stop conflicting writers/workers as appropriate. Never disable constraints or mutate student rows to force success.
5. Deploy the new runner and correction together. Expected logs identify `applied: 202611260001_live_session_shape_compatibility.sql` and either `preserved original` or `superseded, not executed` for the original. Subsequent starts report the correction already applied. No fictitious original ledger entry is expected for fresh databases.
6. Expected production ledger after this correction alone: **21 rows**, with all 20 supplied rows unchanged. Verify ledger/checksums and constraint definitions, then smoke-test standard course access, OR audiences, unauthorized denial, free campaign access and existing paid installments/replays. Exact-date reservations require the separately approved held funnel migration.
7. Resolve or explicitly classify the intermittent Video.js and exact join-boundary assertions; validate real Google/email/Zoom in authorized staging. Do not infer provider success from mocked local tests or activate real installment purchases automatically.

## Rollback precautions

Keep the additive schema and all ledger/data/history rows. Do not restore the restrictive CHECK, delete campaign tables, rewrite receipt checksums, remove audience relationships, or delete Zoom/R2 recordings. If a migration fails, the application must remain stopped; inspect the failed transaction and redeploy a compatible known-good image after review.

An old runner does not understand supersession: on a **fresh/superseded database with no original receipt**, it would try to execute the original against the already-created campaign schema. Such environments require a rollback build retaining the compatible runner and correction inventory. The supplied production ledger already contains the original, so that specific missing-receipt hazard does not apply there; nevertheless, prefer a tested rollback build retaining this runner and reverting only compatible application code. Do not assume any older image is schema-compatible. Likewise, an application that ignores exact-date reservation access is not a safe rollback after funnel activation. Database restoration is an explicitly approved disaster-recovery operation, not routine rollback.
