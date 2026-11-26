# Final free-session journey — local implementation, 26 November 2026

Owner approved the exact plan and pending migration for disposable local implementation/testing. No commit, push, deployment, production SQL, migration promotion or real provider action was performed.

## Implemented behavior

- The campaign’s current public occurrence is chosen by an administrator in **Configuration de la Session → Dates et réservations**. Publish/unpublish actions validate campaign ownership, status and future start. Several dated occurrences and permanent/alias URLs remain supported. The admin list now returns one card per campaign rather than duplicating it for each occurrence.
- No student-facing `#occurrence-select` remains. A read-only navy/orange card shows the actual published title, French date/time in Africa/Tunis, duration and free-session badge. No selected/valid date shows **La prochaine séance sera annoncée bientôt.** No earliest-date guessing, disabled date selector, synthetic date or automatic meeting creation.
- Guest quiz precedes personal details. Server scoring, QCM, ordering, private answer keys, cookie ownership/expiry and result recovery are reused. Zero active questions show an honest preparation state rather than a loading cursor. No quiz content is invented or borrowed from another campaign.
- Logged-in students see their result, then automatically claim/reserve with JWT identity. No registration form is shown, including after login return or refresh. Existing profiles, signup sources, paid access and balances remain unchanged. Existing accounts with incomplete historical profile fields are not forced into a campaign registration form; new accounts still require a valid completed profile.
- New visitors see a compact final registration step with score/level, campaign and date summary. Single-section campaigns supply class/section; subset campaigns supply class and restrict the section choices. Email verification/password activation retains the result and finalizes the reservation; Google uses the existing secure sign-in/profile flow and validated campaign return. Email links work in a new navigation and as a same-page hash navigation. HttpOnly capability presence is read by the API at its narrow cookie path, so verified refresh recovery works without weakening cookie scope.
- Confirmation includes the reserved session title/date, **Accéder à mon espace** and **Voir mon calendrier**, followed by dashboard navigation after a short reading interval. Without a date, result/account can be saved but no seat is promised.

## Reservation and authorization rules

Campaign row locks serialize publication with final reservation decisions. After the pending migration is applied, the backend ignores a student-provided occurrence choice and re-reads the admin-published occurrence. Cross-campaign IDs are also rejected by the database FK. Canceled, expired, started or unpublished occurrences cannot receive a new reservation. Existing confirmed reservations are returned as such and never moved by a publication change. New attempts can participate in later occurrences under the existing reuse policy.

Cancellation locks the campaign before its occurrence, matching publication/reservation lock order. Cancellation still uses existing provider, reservation and notification behavior. Original Zoom references, replay objects and paid enrollment rules are untouched. New reservation-based occurrences continue to require their exact reservation for Dashboard/Calendar/join/replay/resource access. Historical legacy campaign entitlements retain their existing compatibility behavior; they are not retroactively revoked.

The existing five-minute joining rule is unchanged. No student signup creates or edits a Zoom meeting.

## Pending schema and compatibility

`database/pending-migrations/202611260005_free_campaign_public_occurrence.sql` stays pending. Adds nullable `published_occurrence_id` and `target_branches` to `free_sessions`, a supporting unique occurrence/campaign index and a composite ownership FK. NULL defaults publish nothing. Existing scalar section targeting and all historical rows remain intact. No applied migration checksum was modified.

The guest-first reservation system also depends on the already locally approved **held** `202611250004_free_session_funnel.sql`. Neither migration was promoted. The reviewed existing session-shape compatibility repair is tested together with the new migration and audience dependencies, both with original campaign migration pending and already applied. The earlier free-session/multi-audience conflict is resolved in local compatibility tests; production schema/application execution is not inferred from that evidence.

Without the new migration, the public card shows no published date and publication controls remain unavailable. Legacy API compatibility is retained; this is not a claim that the full new journey is activated on production. No new environment variables or package dependencies were added.

## Validation

Executed on disposable local PostgreSQL and real local headless Chrome with synthetic accounts. Zoom, email and Google identity verification were mocked; no real provider behavior is claimed.

- Existing funnel and new publication journey: **16 tests passed**, no failures/skips in focused recovery run. Covers anonymous quiz/result before signup; email verification, same-page link and refresh; actual normal login return; Google single/subset section onboarding; existing-profile snapshots; duplicate account/reservation protection; no paid enrollment; malicious occurrence IDs; no published date; canceled/expired dates; switching dates during verification; concurrent publication/claim and publication/cancellation; active reservation preservation.
- Admin publication/section controls exercised at **360/390/1440px**, including publish and unpublish button actions. Student card, quiz and registration exercised at **320/375/390/430/768/1440px**. No horizontal overflow or browser exceptions in these checks.
- Compatibility suite exercises the complete approved+held chain (local tests only), 20 supplied production checksums, original/replacement execution, existing OR audiences, strict constraints, concurrent runner execution, repeats and failed-file rollback. Populated historical registrations, quizzes, reservations, financial/access rows and replay pointers are preserved by snapshots.
- Complete PostgreSQL + Chrome suite: **191 passed, zero failures/skips** (179.7s). After the final result-card/no-date refinements, explicit migration dependency guard and additional registration/cancellation race assertions, affected funnel + complete migration compatibility rerun: **30 passed, zero failures/skips** (26.5s). Logs: local Temp/free-session-final-complete.log and free-session-final-focused.log. Syntax and git diff --check also pass.

## Files for this task

Services: `backend/services/free-campaigns.js`, `backend/services/free-session-funnel.js`.

Routes: `backend/routes/session.js`, `backend/routes/pages.js`.

UI: `backend/public/js/session.js`, `backend/public/css/session.css`, `backend/views/pages/session/index.ejs`, `backend/public/admin/js/free-session-funnel.js`, `backend/public/admin/pages/free-session.html`, `backend/public/js/auth-entry.js`, `backend/views/pages/auth/complete-profile.ejs`.

Tests: `backend/tests/free-session-funnel.test.js`, `backend/tests/session-migration-compatibility.test.js`.

Schema/docs: pending migration above, `FREE_SESSION_FINAL_FLOW_PLAN.md`, this report and the repository state/schema/business/architecture/changelog documents. Concurrent player/CSS changes in the shared workspace are outside this task and were preserved.

## Readiness and remaining gates

Local end-to-end behavior is ready for isolated hosted validation: the final local tests have passed. Hosted execution requires the two held migrations in the designated test environment under separate authorization. Production remains **NO-GO**: neither held migration is promoted or production-applied, current public campaigns need real active quiz questions and an explicitly published occurrence, and production deployment/activation has not been approved.

Real email delivery, Google OAuth domain/redirect configuration, Zoom calls and physical-device behavior still need controlled environment verification. Do not use live students/payments or real meetings for destructive smoke testing. Keep additive schema on rollback and use a compatible application build; never remove historical reservations, campaign aliases, ledger entries or replay objects.
