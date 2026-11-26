# Free-session funnel — local implementation, 26 November 2026

Production verdict: **NO-GO**. No production SQL, deployment, push or paid activation was performed.

## Implemented

The existing `/session` and `/session/<slug>` pages now support a French, mobile-first guest quiz before signup. Multiple-choice and ordering questions use the existing administrator questions. Ordering supports dragging, touch-sized move buttons and keyboard arrows. Scoring runs on the server against an immutable private snapshot; answer keys and explanations are not returned with questions. Results show a percentage and Débutant / Intermédiaire / Avancé, with an honest short-diagnostic disclaimer. Topic analysis and attendance are not invented.

Guest capabilities are random, hashed in PostgreSQL, and carried in campaign-scoped HttpOnly/SameSite cookies. Guest access expires after two hours; verified registration claims have a 48-hour deadline. Submitted results are immutable and ownership is claimed transactionally once. Expired results do not prevent verified account creation. Existing users retain their original profile, acquisition source and balances. Email proofs remain single-use. Verified Google onboarding preserves the campaign return path; automatic email linking now refuses an unverified local account or unverified provider address.

The existing admin campaign page gains multiple dated occurrences, result-reuse policy, diagnostic thresholds, reservation lists and append-only occurrence history. Each new occurrence reuses the existing Zoom creation and protected host flow. Rescheduling uses existing notifications. New occurrences require an explicit reservation for that exact date; old sessions retain campaign membership access. Paid courses, purchases and enrollments are not unlocked by the funnel.

## Files and integration

- Core: `backend/services/free-session-funnel.js`, `backend/routes/session.js`, `backend/utils/offerAccess.js`, `backend/services/live-features.js`.
- Identity/navigation: `backend/routes/google-auth.js`, `backend/routes/pages.js`, `backend/utils/returnPath.js`, `backend/public/js/auth-entry.js`, `backend/public/js/google-auth.js`, `backend/views/pages/auth/complete-profile.ejs`.
- Public UI: `backend/views/pages/session/index.ejs`, `backend/public/js/session.js`, `backend/public/css/session.css`.
- Admin UI: `backend/public/admin/pages/free-session.html`, `backend/public/admin/js/free-session-funnel.js`.
- Tests: new `free-session-funnel.test.js` and reusable `migration-runner-fixture.js`; updated production-readiness, security, timed-offers and Zoom test fixtures. Package test command includes the funnel suite. Security assertions remain intact.

New APIs stay in the existing session router. Campaign metadata and guest start/status/submit intentionally accept anonymous capabilities with rate limits. Guest claim and member result/reservation endpoints require cookie JWT authentication and derive identity server-side. Occurrence management and settings require administrator middleware. Responses exclude host links and private snapshots. No new dependencies or environment variables were introduced.

## Held migration

`database/pending-migrations/202611250004_free_session_funnel.sql` was explicitly approved for local implementation/testing only. It remains outside the deployment manifest.

Depends on the existing free-campaign schema (`202611250002`) and baseline users/registrations/live sessions. Adds three tables: `free_session_attempts`, `free_session_reservations`, `free_session_occurrence_events`. Adds `free_sessions.allow_result_reuse`, `free_sessions.diagnostic_rules`, and `live_sessions.free_reservation_required`. Key types follow actual database types. Adds immutable-result/ownership and append-only audit triggers. Replaces the single-active-campaign-session index with a date index; preserves existing participants and creates no fabricated reservations. No financial tables are changed.

## Verification

All tests use disposable localhost PostgreSQL, synthetic identities/payments and mocked email, Google and Zoom providers. Chrome checks use real rendering and input with those mocked services, not hosted staging.

- Focused integration/security/installment/readiness/shared-access run: **70 passed, zero failed**.
- After the final acquisition timestamp and cancelled-reservation guards: funnel rerun **11 passed, zero failed**, including desktop/mobile browser cases.
- Public browser widths: 320, 375, 390, 430, 768 and 1440px. Admin widths: 360, 390 and 1440px. Checked question flow, keyboard ordering, resume, result/signup states and overflow/browser errors.
- Tested private answer snapshots, server scoring, expiry/restart, email proof replay, concurrent activation, Google linking guards and mocked Google onboarding, profile preservation, duplicate reservations, result reuse, exact-date access, five-minute join boundary, cancellation, reschedule notifications/audit, provider failure rollback, migration repeat/ledger behavior and historical data preservation.
- Full final regression: **145 tests: 117 passed, 14 failed, 14 skipped**. Browser-dependent checks were executed separately in the focused Chrome runs. The remaining live-session failures are genuine migration compatibility defects, not waived security checks.

## Deployment blocker and next steps

**BROKEN:** `202611250002_free_session_campaigns.sql` requires a legacy course or free campaign, conflicting with multi-audience `any_selected` sessions whose courses live in join tables. Existing such rows can block migration; empty fixtures can migrate and then reject valid session creation. A later repair cannot execute before an earlier failing file. Inspect the deployed migration ledger and approve a compatible sequence; never rewrite an already-applied checksum blindly. This work deliberately does not disguise that blocker or promote unrelated pending migrations.

Before production: resolve that compatibility issue, rehearse the complete approved manifest against a restored/sanitized production-shaped backup, separately approve promotion of this held migration, back up production, deploy with the existing fail-closed migration runner, and verify real email/Google/Zoom, reservations, paid isolation and five-minute join behavior in authorized staging. Do not enable real purchases based on local mock evidence.

Rollback must use a schema-compatible application build and preserve all attempt/reservation/audit data. Do not drop tables, delete Zoom meetings, reset user balances or fabricate legacy reservations. Avoid rolling back to a build that ignores exact-date reservation access while new occurrences remain available.

## Limitations

No hosted staging, real Google, email delivery, Zoom/R2 or physical-phone validation was performed. Provider calls and PostgreSQL cannot form one distributed transaction; reconciliation may be needed after an ambiguous provider/database failure. Rate limits are in-process/per-IP, not distributed. Admin attempt history is limited to the latest 100. Attendance and per-topic diagnostics remain unavailable. Existing unrelated runtime DDL and the migration conflict remain separate readiness risks. No new Zoom polling or recording pipeline was introduced.
