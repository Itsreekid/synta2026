# Independent free campaigns — implementation and validation, 26 November 2026

**Local implementation complete. Production remains NO-GO. No push, deployment or production database operation.**

## Existing behavior retained

There is no class/section uniqueness constraint or campaign-count cap. Campaigns already have independent slugs, settings, questions, attempts, participants, occurrences and reservations. Multiple campaigns may target the same class. The existing admin form, copy-link button, quiz editor, acquisition badge, users table, authentication, Zoom, calendar, notifications and paid-access rules remain in use. Single-section and unrestricted “Toutes” configurations are retained.

## Focused corrections

- Open campaigns now require a valid chosen class/section instead of accepting empty values through crafted registration requests. Configured campaign values remain authoritative for new email registrations.
- Targeted email and Google onboarding show configured values as read-only information, hiding redundant dropdowns. Unconfigured fields retain normal choices. New Google onboarding uses the existing campaign-scoped HttpOnly guest capability through JWT-protected `/api/session/member/profile`; it reuses the normal profile-save helper. Client-supplied class, section or userId cannot override configured targeting. Existing complete profiles are returned unchanged, and partially populated existing profiles retain saved values.
- Historical slugs resolve to their original campaign ID. Public pages issue a **302, private/no-store** redirect straight to the current same-site canonical URL. This permits repeated renames and rename-back without permanent cached redirect loops. APIs accept historical slugs; no arbitrary redirect destinations are stored.
- Guest answer drafts and date selections use stable campaign IDs. Older draft keys are recovered only for the exact current attempt ID; changing a slug does not mix quizzes or lose an in-progress guest quiz.
- Without the alias migration, edits that change an existing slug fail safely with a French message; the current public link continues working.

## Owner-approved held migration

`database/migrations/202611260002_free_session_slug_aliases.sql` is **promoted**: the owner confirmed on 2026-11-26 that it belongs in the release; the next deployment applies it. (Was held earlier the same day.)

One table reserves canonical and historical slugs in a shared unique namespace: `free_session_slug_aliases(slug TEXT PRIMARY KEY, free_session_id UUID FK, created_at TIMESTAMPTZ)`. Existing canonical slugs are backfilled. Triggers atomically reserve new names and prevent alias deletion/reassignment. An old slug remains unavailable to another campaign even when its original campaign is inactive. No user/payment/enrollment/quiz/Zoom/reservation rows are rewritten.

Depends on the existing campaign schema (original migration or its reviewed compatible replacement). It also works without the held funnel being activated. Tested with the existing migration runner, repeated execution, audience migrations and held funnel together. Existing production migration checksums were not changed. No new runtime environment variables or dependencies were introduced by this followup.

## Tests actually executed

- Focused PostgreSQL/security/access/browser run: **68 passed, zero failures/skips**.
- Complete current-workspace regression, with disposable PostgreSQL: **164 tests, 150 passed, zero failed, 14 browser-dependent skips**. The changed campaign/signup browser paths were executed separately in Chrome, not counted as those skips.
- Public quiz/resume at 320/375/390/430/768/1440px; admin campaign controls at 360/390/1440px; targeted email and Google registration at 390px. Checked overflow, read-only targeting and browser errors.
- Five campaigns created through the admin API, including four for 3ème and three sharing the exact 3ème/Informatique target. Verified unique URLs/questions, cross-campaign answer rejection, independent Zoom IDs/dates, explicit reservations, unchanged existing profiles and no paid enrollment.
- Verified email/Google account deduplication, ignored spoofed profile/userId values, correct existing offer targeting from saved users.class/users.branch, and normal branch choice for “Toutes”.
- Repeated renames, rename-back, old-link API recovery, current canonical redirects, inactive campaigns, reserved/hostile slugs, concurrent same-campaign renames, concurrent cross-campaign collisions, immutable alias ownership and in-progress browser quiz recovery.
- Held alias migration applied once/repeated through the actual runner; existing campaign rows remain identical. A legacy newly-reserved `login` slug makes the migration roll back atomically rather than silently rewriting it. Confirmed financial schedules/access preservation remains covered by the readiness suite.

Tests use synthetic accounts and mocked email/Google/Zoom services. Browser tests use actual local Chrome; this is not hosted or physical-device/provider validation. Earlier test dependency failures were corrected by wiring the real shared helpers into fixtures; no security assertion was removed.

## Files changed for this followup

- Services: new `backend/services/free-campaigns.js`, new `backend/services/learner-onboarding.js`, existing `backend/services/free-session-funnel.js`.
- Routes: `backend/routes/session.js`, `backend/routes/pages.js`, `backend/routes/user-api.js`.
- UI: `backend/public/js/session.js`, `backend/public/js/auth-entry.js`, `backend/views/pages/session/index.ejs`, `backend/views/pages/auth/complete-profile.ejs`, existing admin free-session page. Changed asset versions were bumped.
- Validation: `backend/utils/returnPath.js`; campaign, security, readiness, migration-compatibility and live-audience test fixtures; project documentation and the held SQL.

Concurrent session-renewal/live-join changes were present in the shared workspace and were preserved. Test dependency wiring was updated for that combined state; those application changes and the separate refresh-token migration move were not introduced by this campaign followup.

## Remaining release gates

Keep production NO-GO: the compatibility correction is local, the funnel and alias migrations remain held, and authorized staging/schema verification is still required. Prior intermittent Video.js/join-boundary observations remain documented in SESSION_MIGRATION_COMPATIBILITY.md; this request did not change player or join timing logic.

Before alias promotion, check for pre-existing newly reserved names such as `login`; migration intentionally stops for review rather than renaming historical data. Aliases preserve names known at migration time and subsequent renames; slugs discarded before alias tracking cannot be reconstructed automatically. Retain alias ownership/redirect handling in any rollback build; do not drop the alias table or rewrite historical owners.
