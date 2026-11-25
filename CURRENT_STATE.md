### 2026-11-25 — Shared-course annual/monthly live access fixed locally

- User reported an active annual buyer cannot see lives on Info Progress when an older session names the monthly offer. Root cause: legacy live authorization required the exact primary offer, despite legitimate access to the same course through another offer.
- backend/utils/offerAccess.js now accepts an entitled linked offer for the same actively enrolled course, or an independent active timed course grant. Explicit audience restrictions, cancellation, grant start/expiry/revocation and unrelated-course denial remain enforced. Existing new multi-audience OR rules and free-campaign membership are unchanged. No payment, enrollment, schema or expiry write.
- Shared predicate already protects Dashboard, Calendar, join, replay and resource APIs. Added shared-course-live-access.test.js to npm test. Disposable API checks cover annual/monthly/legacy annual buyers, no duplicates, private resource links, no host URL, unrelated/anonymous access, spoofed userId, future/expired/revoked grants, restricted audiences, cancelled sessions, preserved snapshotted course access after offer edits, and extended-schema behavior.
- Validation: focused shared access + installment/browser + readiness probes 21/21; original shared security predicate assertion 1/1. Full regression 102 pass / same 20 known failures /14 skipped (136 total); existing NO-GO blockers remain as documented in INSTALLMENT_PRODUCTION_READINESS_REVIEW.md. No production account (including Linda) was queried or changed. No migration, new flag, push or deployment.

### 2026-11-25 — Final installment readiness audit: NO-GO

- Reviewed all 20 original failures: 13 live leaf cases + parent trace to genuine free-session/multi-audience CHECK conflict; four security fixtures are obsolete; Zoom exact-feature expectation + parent is obsolete. Candidate constraint in disposable DB makes unchanged live suite 17/17 pass; feature-field-only temporary test adjustment makes Zoom suite 15/15 pass.
- NEW CONFIRMED DEFECT: open campaign registration stores chosen class/branch, but /set-password uses only campaign target values, creating users with NULL class/branch. Reproduced through real HTTP/SQL with proof replay, concurrent activation and credential protections preserved.
- Added backend/tests/production-readiness.test.js (explicit audit command, not npm test). Both migration orders/all 23 approved+held files probed; existing OR data blocks free migration, empty OR tables let SQL pass but OR creation fails. Financial rows, schedules, grants/access, progress and balances unchanged across migrations/repeats/failures. Runner locking, checksum refusal, atomic failed-file rollback and destructive guard verified. New app remains gated by Docker &&; earlier successful migration files stay committed after later failure.
- Final focused + audit run 20/20; probes deliberately detect unresolved defects, not a GO. No application or SQL file changed during this review, no original security assertion weakened, no pending migration promoted, no production action. Full baseline failures remain unresolved. Pre-existing runtime DDL in admin-api/user-api means no blanket claim of migration-only schema management.
- Next: approve/implement compatibility and signup corrections, update obsolete fixtures while preserving assertions, rehearse on restored production backup, then authorized hosted checkout. Sequencing caveat: a repair after free migration cannot run if that migration fails first. See INSTALLMENT_PRODUCTION_READINESS_REVIEW.md for all failures, evidence, checklist, flags and rollback gates.

### 2026-11-25 — Custom installment amounts and buffered dates implemented locally

- Owner approved the final schema and behavior. Existing offer editor supports independent custom 2/3-payment amounts, exact sum/minimum checks, automatic/manual date mode and atomic combined metadata/payment-policy saves. Quotes snapshot actual amounts and dates; policy edits invalidate stale quotes. Existing confirmed schedules, access, progress, debt and NULL deadlines remain unchanged.
- Automatic dates spread payments over remaining annual coverage; final later deadline is at least one calendar month before inclusive cutoff. Late purchases require full payment with a fresh explicit quote. No suspension, automatic collection or debt cancellation. Monthly credit exclusion unchanged.
- Only new migration 202611250003_custom_installment_amounts.sql promoted for this task. Applied/repeated successfully on disposable PostgreSQL through the real runner; not production. Adds nullable JSONB custom plans + validator/CHECK and automatic/manual mode default automatic. See CUSTOM_INSTALLMENT_AMOUNTS_PLAN.md.
- Focused tests 16/16 passed, including 390px/1440px Chrome admin/student checkout. Full regression: 101 pass /20 fail /14 skip; untouched HEAD 4d0c7e1: 98 pass /same 20 fail /14 skip. Existing catalog browser copy failure also reproduced on HEAD. See CUSTOM_INSTALLMENT_VALIDATION.md for exact coverage, limitations and rollout/rollback.
- Next: review existing free-session/live/recording regression failures and run authorized hosted staging before production. No production changes, push or deployment. Do not use an older automatic-only checkout while custom plans are active; disable timed sales/upgrades first or use a compatible build.

### 2026-11-25 — Free-session migration fix after failed deploy (not redeployed)

- A deploy stopped at `202611250002_free_session_campaigns.sql` with SQLSTATE 42804 (type mismatch). The runner rolled the transaction back: production schema and data unchanged; the previous image must be redeployed. Cause: production column types differ from `schema_postgres.sql` (reproduced with text-typed `session_config.session_date`, `session_registrations.score` and text registration/user keys).
- Migration revised before its first successful application (no checksum issue): participant key columns copy the real `users.id` / `session_registrations.id` types; the backfill reads old values through `::text` (unreadable old date left empty); `joined_at` of backfilled rows = migration time. Admin answer lookups compare registration ids as text.
- `scripts/migrate.js` now logs the PostgreSQL message (table/column names, no row data) next to the SQLSTATE.
- Validation (disposable PostgreSQL 16, real runner): 7 schema variants (normal, text date, naive date, unreadable date, text score, text ids, all text) apply and keep the old quiz, registrations and result; old rows byte-identical; both orders with held 002/004; redeploy re-applies nothing; free-session suites 15/15 + 7/7 on normal, multi-audience and all-text variants. Production column types still unconfirmed — run the type query before redeploying.

### 2026-11-25 — Free-session campaigns (owner-approved; local only, uncommitted)

- Owner approved: several free-session links (`/session` default + `/session/<slug>`), each with its own quiz, class/branch, schedule and Zoom meeting, managed only from « Configuration de la Session ». Exception to the 2026-11-20 feature freeze, requested by the owner.
- Migration `database/migrations/202611250002_free_session_campaigns.sql` (auto-applied by the deploy runner; filename 202611250001 was already taken). Held `pending-migrations/202611200004` edited for compatibility (still held). See DATABASE_SCHEMA.md « Free-session campaigns ».
- Backend: `routes/session.js` (campaigns, member quiz, Zoom sync), `routes/pages.js`, `routes/live.js` (hidden from Séances, locked there, « Séance gratuite » label), `routes/admin-api.js` (badge data + `sourceFilter`), `utils/offerAccess.js` + `services/live-features.js` (participant access, startup detection), `services/email.js` (campaign link in confirmation e-mail), `server.js` (startup log). `/session/admin` (missing template) now redirects to the admin dashboard. Session dates now display in Africa/Tunis time.
- Frontend: `views/pages/session/index.ejs`, `public/js/session.js` (`?v=3`), `public/admin/pages/free-session.html` (rewritten), `public/admin/pages/students.html` + `public/admin/js/admin-dashboard.js` (badge, origin filter).
- Validation (local, disposable PostgreSQL 16, test stand-ins for npm packages, Zoom and e-mail faked): 15/15 end-to-end checks — runner applies all 19 migrations and keeps old /session data; new sign-up with e-mail verification, single-use token, server-side scoring, account class/branch and badge; logged-in student quiz without account changes and single attempt; participant-only visibility, 5-minute join rule, host link never exposed; repeated participation; filters; Séances list exclusion and lock; reschedule notifies participants only and reuses the popup; Zoom failure + retry; default/deactivation; pending registration switch; cancel; hidden answered questions. Course sessions unchanged in legacy and multi-audience modes. Browser screenshots at 390 and 1440 px, no page errors. The project's own `npm test` suite was NOT run (packages unavailable offline).
- Before deploy: run `npm test` locally, back up the database, then deploy; the runner applies 202611250002. Not deployed, not committed.

### 2026-11-24 — Edit finished Zoom replays and remove sessions locally

- Finished Zoom-linked sessions now expose the existing Modifier form (title, past date/time in Tunis, duration, description and course associations), matching manual historical replays. Multi-audience edits update link tables transactionally and retain NULL legacy fields; selected offers, invitations, occurrence bindings, recording imports, replay pointers and files remain unchanged. Upcoming/in-progress sessions cannot be edited through this replay form. Local presentation edits do not modify the original Zoom topic.
- Deleting a finished individual session soft-cancels it locally without requiring Zoom meeting deletion. Existing shared authorization excludes cancelled sessions from student calendar, replay/course listings and protected resources. R2 objects and Zoom cloud originals are preserved. Upcoming/live cancellation and explicit whole-series behavior retain existing Zoom checks.
- Validation: 88/88 focused tests passed with disposable PostgreSQL and mocked Zoom/R2, including metadata authorization, invalid inputs, course reassignment, preserved recording identity, idempotent local cancellation, recording reliability and student permissions. Chrome checks at 360, 390 and 1440px passed; an additional multi-course mobile selector check follows below. No migrations, production calls, push or deployment.

# CURRENT_STATE.md — Synta Academy


### Event-driven recovery and Corbeille revision — 2026-11-24

- recording.completed remains the primary automatic trigger. No Zoom polling, scheduled recording scan or automatic historical import was added. The periodic worker processes local import/deletion queues only; download metadata refresh is bounded by the existing six import attempts.
- Rechercher sur Zoom now searches on demand by selected Synta session, reuses known exact UUIDs, or calls Zoom past instances when unknown. Multiple occurrences require admin selection. No binding or import is committed by discovery alone. Missing webhooks before deployment are supported when Zoom still exposes that session's meeting history/recordings.
- Search responses show safe MP4 timestamps, duration, size, import status and deleted status. Importer queues selected missing segments through the existing fenced queue. Actualiser reads local APIs only. Requests are coalesced/cached briefly, UI prevents concurrent searches and Zoom Retry-After is honored. Réessayer still targets one failed import.
- Corbeille now soft-deletes, excludes segments from the normal list and prevents discovery/webhooks from restoring them. A separate held migration 202611240002_recording_trash_retention.sql follows 003 and 202611240001. It guarantees at least 48 hours before purge (including unfinished preexisting intents from migration time), stores restore metadata and append-only deletion events, and adds a database minimum-retention constraint. Restoring uses the same stored object, never republishes or re-downloads it. Purge attempts are bounded at six; failure keeps the object for admin intervention. Already physically purged files are not restorable.
- Added admin trash list/restore APIs, authorization checks, mocked discovery/instance/rate-limit tests, minimum-retention/duplicate/restore/purge tests and 360/390/1440 browser checks, including Actualiser causing no Zoom requests. Latest results: see ZOOM_RECORDING_IMPLEMENTATION.md. No production migration, deployment, live Zoom/R2 call or credential change.

### 2026-11-24 — Zoom recording reliability implementation (local only)

- Implemented the accepted audit fixes in the existing pipeline: persistent occurrence bindings, atomic intake, claim-token fencing/attempt-specific keys and wall-clock lease checks, continuous renewal, explicit review for EVERY new segment, durable deletion with backoff, completed-object reconciliation, safe DNS-pinned redirects, exact-UUID download refresh and selected historical recovery.
- Existing admin popup now shows accurate readiness/API errors, separates association from publication, and prevents mixed-occurrence selection. Preview, resources, manual MP4/external links, student OR authorization and existing replay pointers preserved. Structured logs omit secrets and media URLs. No new student pages or payment changes.
- New additive migration database/pending-migrations/202611240001_zoom_recording_reliability.sql remains HELD for owner review, depends on 003 only (plus baseline users/live_sessions). It adds occurrence/transfer/deletion ledgers and nullable import fencing/deletion columns. Tested only in disposable PostgreSQL; no production migration, promotion, push, deployment or credential changes.
- Final focused suite: 81 passed, zero failed/skipped; synthetic Chrome 360/390/1440. Full serial package test list: 115 total, 112 passed, three failures from the existing offer-card terms/monthlyTerms assertion and parent tests. Do not claim whole-suite green. Initial parallel full run hit local PostgreSQL recovery; serial rerun completed. Tests use mocked Zoom/R2, synthetic File/DataTransfer uploads; no live Zoom/R2 or native OS picker evidence.
- TASK-009 completed locally. Next: review held migration and ZOOM_RECORDING_IMPLEMENTATION.md, approve designated real Zoom/R2 staging validation, separately address unrelated offer-card assertion, then decide production rollout. Stop all OLD workers before activating fencing; disabling flag and compatible build are required for rollback. Retain legacy conflict rows and orphan-attempt objects for explicit investigation; never sweep storage.


### 2026-11-24 — Read-only Zoom import availability investigation

- Owner reported LIVE | Cours cloud recordings exist in Zoom but manager shows migration-unavailable. Traced exact UI: session-manager.js renders this when liveFeatures.recordings is false. sessions.html also silently retains false if GET /api/live/admin/features fails. Therefore screenshot is not live-database proof.
- Backend features response exposes liveFeatures.recordingsTable; startup detectLiveFeatures checks to_regclass('zoom_recording_imports'). Existing additive migration 202611200003_create_zoom_recording_imports.sql remains in pending-migrations, while Dockerfile and migration runner include only database/migrations. This explains the expected disabled state when the held migration has not been approved/applied. Migration003 references existing live_sessions; it does not directly require002 (which separately enables extra audience fields); 004 requires002. Do not promote unrelated pending migrations.
- Import requires detected table + ZOOM_RECORDING_IMPORT_ENABLED=true, configured ZOOM_WEBHOOK_SECRET_TOKEN and signed recording.completed delivery to /api/zoom/webhook, appropriate Zoom recording-read scope, and working private R2 credentials. Startup logs distinguish worker started, migration pending, and feature detection failure. Feature detection runs on startup, so restart is needed after activation. Existing Zoom meeting-creation credentials working does not establish webhook/import activation.
- Queue maps by stored zoom_meeting_id, not title; it deduplicates Zoom file IDs and worker processes queued segments. Existing cloud recordings are not proactively scanned: enabling later alone does not backfill older recordings. A valid recording.completed delivery/re-delivery or separately approved historical recovery is needed. Manual upload/link remains available.
- Read-only source/schema/deployment audit only; no live Coolify/Zoom/database access, credentials, imports, tests or production changes were executed. Next: authenticated production features response and sanitized startup logs, then owner approval of a specific migration/activation rollout before changing production. Do not infer successful live import from local code.


### 2026-11-23 — Compact mobile lesson quiz button

- Passer au quiz alone now uses a 50px pill radius and content-width mobile sizing (44px minimum touch height). Other lesson actions retain their sizing and behavior. Course script cache version v9.
- Actual course template checked in Chrome at 320/390/768/1440px: mobile button about 131px wide ×44px high, desktop about147px ×46px, radius50px, no horizontal overflow. Existing completion regression passed. No deployment.


### 2026-11-23 — Fix 90% lesson completion and stale progress

- Narrow fix in course-details.js only (plus its EJS cache version): native lesson timeupdate/pause now confirms completion at playhead >=90% of a positive finite duration; ended/manual completion remains. Existing SyntaAPI.markLessonComplete and backend authorization/database logic are reused unchanged. No player styles, controls, quiz behavior, resources, schema or unrelated business changes.
- Completion requests are coalesced per course/lesson and confirmed IDs suppress duplicate end/pause/timeupdate saves. Failed saves do not mark the UI complete; active-play retries are throttled to 10s and ended can retry immediately. Manual completion now uses the same confirmed-save/UI path.
- Confirmed completion patches the active sidebar AND detached overview DOM: green checkmark, chapter count/completed state and progress percentage/bar/count. This avoids replacing the player or losing its playback state. Course reload still uses authoritative server progress; percentages exclude quizzes.
- 37 targeted tests passed, zero failed/skipped: actual course browser threshold test at mobile/desktop, existing six-width real Video.js playback/quiz/resume test, course Markdown/layout and security suite. New regression verifies invalid durations/<90%, exact90%, repeated events/end duplicate protection, persisted reload, failed save/no false checkmark and end retry to 100%. Synthetic API storage is used by the new browser test; no live student data or production changes. The earlier unrelated full-suite offer-card assertion remains outside this fix; full suite not rerun.
- Files: public/js/course-details.js, views/pages/courses/details.ejs (v8), tests/lesson-completion.test.js, package test list and these docs. No migration/env change/deployment. Next: verify the affected student's course in staging after rollout approval; Drive provider embeds still lack reliable native timeupdate/ended events and retain manual completion.


### 2026-11-23 — Video.js 10.6.0 mobile-first replacement

- Replaced hand-maintained playback controls in public/js/learning-player.js with the pinned self-hosted @videojs/cdn 10.6.0 stock skin. Existing native video IDs/listeners, signed lesson/replay URLs, authentication, progress/completion, resume, quizzes, resources and course/sidebar layout are preserved. Drive/provider embeds remain unchanged. No frontend build system or npm runtime dependency added.
- Library owns play/pause, seek bar/time, ±10-second controls/double-tap gestures, tap-to-show/inactivity hiding, six rates (.75/1/1.25/1.5/1.75/2), captions when tracks exist and fullscreen fallback. Scoped brand CSS uses navy/orange/white and a subtle turquoise border. Small-screen skin overrides hide volume/cast/PiP and keep central controls large; tablet sizing is increased. Settings submenu is browser-tested. Retain the version pin when updating these skin selectors.
- Official @videojs/core orientation controller is vendored as orientation-support.js with only two predicate imports inlined. It locks landscape during supported library fullscreen/native presentation and unlocks on exit/removal, including late asynchronous lock responses. Unsupported/rejected lock APIs do not CSS-rotate the page. iOS native presentation state/events are recognized. Video.js disconnect lifecycle plus an observer clean up listeners. Library-load failure leaves native controls usable.
- Source assets: public/vendor/videojs/10.6.0 (625 production/attribution files, approximately 8.36 MB on disk; only imported modules are requested). Registry SHA512 checksums for CDN and core were verified; PROVENANCE.json records origins/adaptation and LICENSE is included. Development builds/maps omitted, shared module layout retained. utils/homepageDelivery.js caches only this pinned public vendor directory immutably. No private-media cache policy changed.
- Mounting uses state-preserving DOM moves where supported plus position/rate restoration around asynchronous attachment. Browser regression now uses a genuinely timed synthetic WebM with byte-range responses, verifying server lesson resume, existing position-save callback, actual media end → quiz, correct/wrong feedback, and paused next lesson at 320/375/390/430/768/1440px. Controlled native media tests separately verify library speed/caption controls, touch seeking, auto-hide, menu accessibility and replay resume.
- Validation: final combined affected suite passed 44 tests, zero failed/skipped (55.75s), using disposable PostgreSQL and Chrome. This includes the real timed-media/range/resume/progress fixture, 6-width mobile control suite, explicit fullscreen/iOS simulations, vendor import/caching and orientation-race tests, security, homepage, course Markdown, lesson preview, session manager and admin catalog tests. Earlier unrelated full-suite offer-badge assertion remains unresolved; do not call the entire project regression green.
- Important verification limit: this machine's headless Chrome rejects native fullscreen for both a plain element and the library with TypeError: not granted. Standard fullscreen entry/exit, supported/rejected/missing orientation APIs, and iOS native-presentation fallback were tested with explicit browser stubs; these are NOT physical-device rotation evidence. No live R2/Drive/Zoom playback, production access or deployment occurred. No schema/env/migration required. Existing 90%-watch threshold remains unimplemented.
- Next: staging on real Android Chrome and iPhone Safari: fullscreen entry/button exit/back, Android landscape request/rejection and orientation release, iOS native controls, app return, long signed-URL recovery, caption CORS, resume and quiz-at-end from fullscreen. Captions require actual provided tracks; this adds no caption-generation/upload workflow. Roll back by restoring the previous learning-player.js/CSS and the matching Courses/Calendar asset references; no database rollback required.


### 2026-11-23 — Educational video controls and smoother lesson quizzes

- Added shared learning-player.js/CSS for native uploaded lessons and course/calendar replays: central Play, orange seek range, ±10 seconds, playback speeds, mute/volume, fullscreen, keyboard-accessible labeled controls and graceful autoplay rejection. Existing page layout retained. Direct click-to-watch attempts autoplay; next lessons after completion/quiz wait paused. Lesson position uses the existing server save path; replay position is stored per profile/session/part on the device, without storing signed URLs.
- Lessons with a following quiz show Passer au quiz, and actual video ended opens that quiz over the current lesson once. No-quiz lessons show Leçon suivante. Quiz correct answers advance/results after 1.2s feedback (manual Continue still available); incorrect corrections wait for Continue. Advance timeout is cancelled on close, manual progression and results. Tracking remains one call per submitted answer.
- Drive replays and Drive lesson URLs retain provider iframe controls and manual quiz navigation; custom controls/ended detection cannot be applied reliably across provider origins. Existing signed URL retry, resources and access APIs retained; no Gemini calls or schema changes.
- Removed completion-on-first-playing for the native inline lesson path; end/manual completion remains. The prior 90%-watched requirement (P1-2) is still not implemented; do not claim watch-time verification.
- 39 affected regression tests passed, zero failed/skipped, with disposable PostgreSQL and Chrome at 1440/390/360px. New browser test generates synthetic WebM, performs trusted keyboard playback through actual media end, checks automatic quiz/correct-answer progression, retained wrong-answer feedback, single tracking calls, paused next lesson, closing during feedback, speed/resume/seek/autoplay fallback, uploaded replay enhancement and unchanged Drive embed selection. Student lesson-preview/API security, course layout and admin session/catalog tests also passed. Mobile capture inspected. No live Drive/Zoom/R2 playback or physical-phone validation; existing unrelated offer-badge full-suite assertion remains unresolved. No deployment.
- Next: staging playback across physical iOS/Android, actual R2/Drive media and fullscreen; no migration/feature flag required for these controls.


### 2026-11-22 — Course copy form and offer audience badges

- Course rows now have a Dupliquer le cours action beside edit. It opens the existing form with copied metadata/image/offer selections, a blank ID, title suffix — Copie and publication off. Nothing is saved until confirmation. UI explicitly states chapters are not copied; the existing chapter-reuse workflow remains available after saving. Source course and shared media are untouched.
- Linked-offer picker retains price/status and adds separate class/branch badges, including unrestricted labels. Existing picker search now naturally matches these labels. Admin filter offer options include audience labels, and Offers replaces free-text Recherche with an existing-offer selector as requested. Shared script version bumped.
- 35 targeted tests passed with no failures/skips: security plus actual admin Chrome at 1440/390/360px, same-name Arabic offers, audience badges, existing-offer selection, draft-copy payload/offer links and original preservation. Backend save endpoint is reused unchanged; browser save uses synthetic API storage, not live data. No migration/deployment. Prior unrelated full-suite badge assertion remains unresolved.
- Next: staging review; attach/reuse chapters in the copied course as desired. This is a settings copy, not a deep content clone.


### 2026-11-22 — Admin course and offer organization filters

- Existing Courses and Offers pages now share an accessible responsive filter bar: class, branch, search and status; Courses preserves category/publication filters and adds an audience-filtered Offer selector with Sans offre associée. Visible/total counts and reset are provided. SessionStorage remembers each page's choices across navigation/reloads in the same tab.
- Course audience derives from existing offers_ids and offer targeting. Class and branch must match the same linked offer; unrestricted targets match all. Unlinked courses remain visible under audience filters and are labeled Tous les niveaux · Sans offre associée. Shared courses appear once. All offers, including inactive ones, remain available under the default filters. No student authorization, API, schema or financial changes.
- Shared assets: public/admin/js/catalog-filters.js and css/catalog-filters.css. Existing search/category/status controls are moved into the unified bar without removing their behavior. Offer activation reapplies current filters; filtered-course edit targets retain correct IDs.
- 36 targeted tests passed, zero failed/skipped. Actual Chrome at 1440/390/360px covers same-offer targeting, shared/general courses, independent remembered page filters, reset, empty state, search, publication/status filtering, inactive offer activation, correct course editor, hostile HTML-like labels and viewport overflow. No deployment. Prior unrelated full-suite offer-card assertion remains documented; full suite not rerun for this admin-only change.
- Next: review using real admin data in staging; no migration or feature flag needed.


### 2026-11-22 — Correct thumbnail first-load regression

- Supersedes the buffered-image proxy below: it added a full backend R2 download before sending image bytes. Restored direct R2 loading with a signed image-only response cache override; redirect and bytes cache privately for 23 hours, signed thumbnail lifetime 24 hours. No backend image download. Authentication/folder restrictions remain.
- Longer signing is explicitly restricted to validated Courses-th raster images. Video, receipt and document limits remain unchanged; no public bucket, cookies, schema changes or deployment. External providers still control external-image caching.
- 35 security/course layout tests passed, zero failed/skipped, including Chrome 1440px/390px repeat navigation, one signer call and one image fetch, signing failure, unauthorized access and rejection of longer protected-media signatures. Synthetic R2 only: live latency is unmeasured, so production speed is not claimed verified. Earlier unrelated offer-badge suite failure remains unresolved.
- Next: staging measurement against actual R2 thumbnails before deployment.


### 2026-11-22 — Cache course image bytes at stable URLs

- Authenticated Courses-th image delivery now returns image bytes at the existing stable URL, with private 24-hour browser caching, ETag revalidation and nosniff. Removed expiring signed redirects from this route. No cookies store images; no changes to private video/document delivery or schema.
- Admin uploads already generate UUID keys, so image replacements use a fresh URL. External third-party image URLs retain their provider caching behavior. Browser cache may be cleared/evicted; no promise of offline or instant first loads.
- 34 targeted security/course-Markdown tests passed, zero failed/skipped, including actual Chrome 1440px to 390px navigation displaying the same image with exactly one R2 read, unauthorized/wrong-folder rejection, conditional 304 and noncached storage failures. Synthetic storage only; live R2 not exercised. Previous unrelated offer-badge full-suite failure remains documented. No deployment.
- Next: staging verification with actual course thumbnails; no migration needed.


### 2026-11-22 — Inactivity window revised to 14 days

- Owner revised the previous 48-hour policy to 14 days. Normal refresh tokens/cookies and startup diagnostics now use 14 days; 30-day absolute cap, logout/revocation, and one-hour nonrenewable admin login-as sessions remain unchanged. Existing refresh cookies retain their original expiry until successfully renewed.
- Targeted authentication suite rerun: 35 passed, zero failed/skipped, including disposable PostgreSQL and Chrome checks. Previous unrelated full-suite offer-badge assertion failure remains unresolved; full suite not rerun for this constant-only revision.
- No new migration. Existing pending refresh-token migration still requires approval before production activation. No deployment or production changes. Next: TASK-003 migration rollout approval and staging verification.


### 2026-11-22 — Session renewal and stale countdown fix

- Normal refresh sessions now use a 48-hour inactivity window advanced on renewal, retaining one-hour access JWTs and the 30-day absolute cap. Admin login-as links remain deliberately nonrenewable one-hour test sessions. Logout/revocation preserved.
- Fixed a stale Turbo expiry countdown surviving navigation into a renewable session. Guard asset version bumped. Added read-only startup diagnostics for missing refresh_tokens storage; no runtime schema changes.
- Focused suite: 35 passed, zero skipped, including real HTTP/disposable PostgreSQL rotation, concurrency, revocation, expiry, migration prerequisites and Chrome countdown/401 checks. Full suite: 91 tests, 88 passed, 3 failed (one unrelated offer-browser assertion plus two parent tests: old annual/monthly badge wording at 320px). No skipped tests. Full regression is not green.
- Existing pending migration database/pending-migrations/202611200001_create_refresh_tokens.sql applied only in disposable test databases. Production state unverified; approval still required before promoting/applying migration or deploying. Missing storage leaves normal logins at one hour. Fresh normal sign-in is needed after activation. Next: approve/verify renewal migration rollout and separately reconcile stale offer-badge browser assertions.


### 2026-11-22 — Orange annual offer badge

- Annual badge now matches the monthly badge structure using orange border/tint, school-year title and the configured cutoff as an inclusive Tunis date. If no valid cutoff is supplied, shows Accès pour l’année scolaire. Prices, actions, images and monthly styles unchanged; offer asset versions bumped.
- Actual EJS/browser checked at 1440/390px with synthetic offers, including an ISO cutoff crossing midnight into the next Tunis date. No browser errors; no deployment.

### 2026-11-22 — Single monthly offer badge

- Badge-only monthly card refinement: combined Abonnement mensuel and 1 mois d’accès · renouvellement manuel into one cyan/blue-tinted badge beneath the image; removed the duplicate monthly notice below the price. Other card content/actions and annual badges unchanged. Offer CSS/JS asset versions bumped.
- Actual EJS template checked with synthetic offers at 1440/390px: exactly one monthly badge, expected blue border, price/renewal action and annual label preserved; no browser errors. No deployment.

### 2026-11-22 — Local video compression removed at owner request

- Removed the local watcher, compressor/progress scripts, launcher, test, docs, logs/state, temporary output and portable FFmpeg/Node tools. Original video remains in Replays Zoom; its SHA256 was verified unchanged. That media folder stays Git/Docker-ignored to avoid uploading private recordings. No compression processes or startup services remain. Full remaining regression suite: 88 passed, 0 failed/skipped. No R2 or production changes.
- Unrelated pending historical replay editing remains: Détails → Modifier edits title, Tunis date/time, duration, associated course and description for imported non-Zoom replays, preserving media/resources. The protected details PATCH endpoint rejects unauthorized users, future dates and Zoom changes; browser/API tests were executed before the local compression removal. No migration or deployment.

### 2026-11-22 — Single dashboard replay

- Replays disponibles now shows only the latest session by scheduled date (API already orders descending). Course replay lists and access checks unchanged. Dashboard asset version bumped. Verified six-item, empty and error results with the actual render function; no deployment.

### 2026-11-22 — Historical replay discovery for locked course viewers

- Reproduced the screenshot state: a viewer without course enrollment sees preview lessons and locked paid lessons, but the old configureCourseTabs logic hid Replays entirely. This is a local reproduction; no production student enrollment or media records were inspected/changed.
- Course detail API now exposes only id/title/original date/duration of course-wide completed historical replays, after existing published-course/targeting checks. No video, signed URLs or resource keys are returned in previews. Sessions with offer/audience/invitation restrictions are excluded. One additional parameterized query; no migration.
- Course UI lists those entries as locked under their original month and links to offers; enrolled playback still uses the unchanged protected live API. Empty replay tabs remain hidden. Updated asset version.
- Tests verify full page load for an unenrolled viewer at 360/390/1440px, October grouping, locked CTA and no playable URL; PostgreSQL checks metadata allowlist and restricted-session exclusion. Full regression: 88 passed, 0 failed/skipped. No push/deploy or production modifications. If the actual student already owns active access, verify their enrollment separately; this change does not grant access.

### 2026-11-22 — Historical replay entry

- Existing Live Sessions page has Ajouter un replay: responsive native dialog with title, original Tunis date/time, duration, one associated course, external Drive/HTTP(S) link or video upload, and optional teaching files. Form body scrolls while save remains visible. Existing source files and Zoom import pipeline are untouched.
- Administrator-only POST /api/live/replays saves a completed legacy-policy course session without Zoom. Existing fields only; no migration. Past completed dates and safe external schemes are validated. Client UUID retry identity avoids duplicate session creation. Uploads reuse existing video/resource APIs; successful per-file work is skipped when retrying in the same popup. Closing a failed upload leaves the saved session available in the manager for completion.
- Fixed manager Details fallback for primary-course legacy sessions when multi-audience association arrays are empty. Course permissions and October date preservation tested on disposable PostgreSQL. Full regression: 88 passed, 0 failed/skipped. Final browser rerun passed at 1440/390/360px with save button visible. Actual Zoom/R2 media delivery was mocked, not live-tested. A non-fatal local config/db connection-probe timeout appeared in full-suite logs; the disposable database-backed cases all passed.
- New asset: backend/public/admin/js/historical-replay.js; include it in any reviewed commit. No production changes, push or deployment.

### 2026-11-22 — Simple lesson free/paid switch

- Added an accessible Gratuit/Payant switch beside each lesson in the existing admin chapter manager. Uses the existing administrator-only PATCH lessons endpoint and is_preview field; no schema, access rules or existing preview values changed. Saves immediately, disables while saving and rolls back the control on failure.
- Local browser test passed at 1440/390/360px for both directions and failed saves. Tests/lesson-preview.test.js added to normal test command. No deployment; administrators choose the first lesson manually, other lessons are not automatically changed.

### 2026-11-21 — Plain course-card previews and compact live-session actions

- Course cards use a normalized plain-text Markdown preview via textContent, with three-line CSS clamping and a reserved three-line area even for short/empty descriptions. Catalog grid rows have equal heights. Full sanitized Markdown rendering on course details and stored descriptions remain unchanged. Asset query versions updated.
- Admin session cards now show accessible gear, green host-video and red trash icons (40px targets). Trash is available for completed sessions and reuses the existing protected cancellation API; confirmation explains removal of the session/replay/resources from platform access while preserving original Drive/R2 files. No physical files were deleted; no backend/schema changes.
- Regression coverage includes escaped Markdown, whitespace, plain text, XSS probes, equal short/long/empty card heights and clamping at 360/390/1440px; completed-session removal from its card without opening the manager. Full regression: 86 passed, 0 failed/skipped on disposable PostgreSQL and Chrome. Mobile preview screenshot inspected. No push/deploy/production changes.

### 2026-11-21 — Safe course description Markdown

- Admin description remains the original plain-text textarea/storage, with a short formatting hint. Student course cards now display formatted previews (220 visible characters plus ellipsis, four-line clamp); course details display the complete description.
- Shared course-markdown.js supports bold, italic, paragraphs, unordered/ordered lists. Raw HTML is rendered as text; generated DOM is sanitized through an element allowlist with no attributes, links or images. No dependencies, database changes or description rewrites.
- Added course-markdown.css and tests/course-markdown.test.js; included the test in the package test command. Browser checks use actual EJS course templates and synthetic content at 360/390/1440px, including Arabic/French, plain text, long descriptions and HTML/script/unsafe-link probes. Full regression: 86 passed, 0 failed/skipped, including disposable PostgreSQL and Chrome. Screenshots visually inspected. No deployment.

### 2026-11-21 — Final session manager integration verification

- Full regression: 85 passed, 0 failed/skipped with disposable PostgreSQL and Chrome. Affected suite rerun after additional assertions: 12 passed. Manager Details tested against actual multi-offer/course/invitation API responses on desktop/mobile. Real browser file-chooser events uploaded synthetic Python and MP4 fixtures to localhost storage; actual R2/video decoding was not tested.
- Fixed confirmed recording deletion/reference race and failed-storage discard behavior in live.js. Deletion locks/checks references; manual attachment locks and rejects discarded keys. Retained discarded object keys act as tombstones. Tests cover shared references, current/published replay protection, storage failure and concurrent attach/delete. No new schema migration.
- Normal package test command now includes both new integration suites. New fixture is tests/fixtures/session-manager-fixture.js. Include all untracked assets/helpers/tests and pending migration 004 in the future reviewed commit.
- Production verdict BLOCKED pending hosted Zoom/private R2/production-image smoke evidence and separate production approval. Exact steps, dependencies and distributed deletion limitation: SESSION_MANAGER_INTEGRATION_REPORT.md. No push/deploy/production changes performed.

### 2026-11-21 — Admin session management dialog

- Session cards now open Gérer la séance, with responsive Replays/Ressources/Détails tabs. Native dialog provides focus containment and Escape close, restores focus to the card and contains scrolling. Cards retain host/cancellation actions and no longer expand segment/file lists inline. Unassigned recording review remains available.
- Reuses the existing recording list/publish/retry/delete, manual replay upload/link, and resource upload/delete handlers. Added current replay source, private signed previews/downloads on the existing admin sessions API, segment timestamps/durations, published part labels, search and explicit load failures. Manual and segment replacements require confirmation.
- Confirmed and fixed a playback defect: old published Zoom segments could remain attached after replacing the base replay manually. Segment attachment now requires the published source to match the session replay. The Zoom import worker and its schema were preserved.
- 84 tests passed, 0 failed/skipped, including disposable PostgreSQL, backend authorization and responsive browser cases at 360/390/1440px. Manual upload tests use browser File APIs with synthetic PUT storage; no real Zoom/R2 traffic or native file chooser was tested. Screenshots were visually inspected. Hosted playback/upload checks remain pending.
- New files are public/admin/css/session-manager.css, public/admin/js/session-manager.js and tests/session-manager.test.js. No new migrations. No push, deployment or production changes. Continue with owner-approved hosted staging verification when requested.

### 2026-11-21 — OR session audiences implemented and locally validated

- Searchable Offers/Courses selectors and invited-student chips in the existing admin session dialog. At least one offer or course is mandatory. Backend OR authorization covers Dashboard, Calendar, join, replay and session files. One session appears once even when several selections match.
- Existing sessions retain the legacy policy. New OR sessions support offer-only and independent-course audiences. Session invitations do not create enrollments; a real paid-lesson API request for an invited student returned 403 in regression testing.
- Pending migrations 002, 003 and 004 were run only on disposable local PostgreSQL 17.6. 004 requires 002; 003 is independent recording import support. SQL remains under pending-migrations, outside the deployment image's migration directory. Creation defaults off through LIVE_MULTI_AUDIENCE_ENABLED.
- All 82 automated tests passed with 0 skipped, including PostgreSQL, API and headless Chrome checks at 1440px and 390px. Zoom/R2 services were synthetic doubles; live external meeting/media delivery is not validated. Node 24 was used for the local run.
- Fixed nullable session descriptions breaking calendar details, and updated stale browser test selectors that depended on removed offer image alt text. Shared media helper supports course and Calendar replay views.
- Next step is hosted staging smoke testing with a test Zoom meeting and private test R2 files after owner approval. No push, deploy, production migration or production data change performed. Detailed rollout and rollback are in LIVE_SESSION_MULTI_AUDIENCE_PLAN.md.

### 2026-11-20 — Multiple live-session audiences proposal

- Owner confirmed OR access through any selected active offer, selected active course enrollment or individual invitation, requiring at least one course or offer. Prepared `LIVE_SESSION_MULTI_AUDIENCE_PLAN.md` and held migration `202611200004_live_session_multi_audience.sql` for approval. No migration executed. Application implementation and disposable PostgreSQL validation are pending migration review.

### 2026-11-20 — Embedded replay sizing

- Replay iframes explicitly fill their 16:9 frame and override the shared iframe min-height of 100vh, which cropped Drive video on desktop and phones. Drive embeds declare media/fullscreen permissions.

### 2026-11-20 — Desktop student timetable

- Wide screens (1200px+) show a seven-day time grid, sticky day headings, and separate lanes for overlapping sessions. The grid opens near the week's earliest session. Tablets retain the readable week agenda and phones retain the selected-day view.
- Checked on a disposable local preview using synthetic sessions at 1440px and 390px. Session details, overlapping sessions and next-week navigation were exercised. Live authenticated session joining still needs staging verification.

- Homepage orange elements use white text across registration, free trial, enrollment, CTA buttons and course badges.

- Removed the standalone Contact page and student sidebar entry. Existing contact URLs redirect to the landing footer’s contact section, and public contact links point to that section.

- Removed the student sidebar’s Mon profil link on desktop and mobile. Profile access is available through the top header dropdown.

### 2026-11-20 — Mon Portefeuille UX pass (uncommitted; payment logic untouched)

- **What was wrong:** the transaction table was 584px wide on phones and was cut off at the Statut column on desktop. The add button sat at the bottom of the table, past the rows. Achats d’offres was a bullet list of run-on text, and its "Réessayer" button was about 19px tall. Several popup and toast styles were inline.
- **Now:**
  - Layout: one column below 1200px, with the accounts in a two-column grid from 600px. From 1200px the accounts sit beside the content. The D17 card puts the QR code beside its details.
  - Transactions: a table when the history panel is at least 520px wide (1440px and 1920px desktops). Cards below that (phones, 1024px screens, and narrow side-by-side layouts). This uses a container query, so it adapts to the real panel width.
  - The add button is in the history header, with the same label and action.
  - Achats d’offres: one card per purchase, with a status badge (green, amber or red), the same details, the same tranche list, and the same pay button, which is now 44px tall.
  - The deposit popup and toasts use CSS classes. Escape closes the popup and focus returns to the button. An invalid amount now shows an inline error instead of an alert. On phones the popup is a bottom sheet.
  - Colours match the Cours pages (orange and navy). The payment method tiles no longer look clickable, because they are not.
- **Unchanged, on purpose:** the deposit request (`POST /api/user/transactions`: amount, `type: deposit`, `status: pending`, the payment method, the description, the optional receipt), the installment payment request, the confirm dialog, the reload after payment, and every displayed number, label and bank detail.
- **Verified** on the local mock with synthetic data. The mock records the deposit POST and stores nothing:
  - Sizes from 320×568 to 1920×1080, active and new-student scenarios: no page-level sideways scroll, and every button and link is at least 40px.
  - Interaction checks pass: card vs table switching, the popup open/close paths, the inline error, the exact deposit payload, the toast, the empty states and the phone bottom sheet.
  - Unit tests: 51 passed, 3 skipped.
- **Not run:** the database-backed browser test in `tests/timed-offers.test.js` (it covers the installment payment from this page). It needs a disposable PostgreSQL, which isn't installed on this machine. Run it before merging.
- **Next:** a real-phone check of the wallet. Then the next nav item (Offres), if the owner asks. Deployment is still paused.

### 2026-11-20 — Cours pages UX pass: course list, course details, lesson and replay players, quiz popup (uncommitted)

- **Course list** (`views/pages/courses/index.ejs`, `public/js/courses.js`, `public/css/courses.css`, all rewritten):
  - The banner text no longer overlaps the mascot on phones.
  - Phones show compact horizontal cards; tablets and desktops show a grid.
  - Cards are grouped into "Mes cours" and "Découvrir d’autres cours", with progress and a "Continuer", "Commencer" or "Découvrir le cours" call to action.
  - When there is no thumbnail, cards show the course initial instead of an external placeholder image.
  - Loading skeletons, and styled no-results and error states.
  - Purchase and enrolment functions are unchanged.
- **Course details** (`views/pages/courses/details.ejs`): the ~720-line inline `<style>` is gone. The page now loads the new `public/css/course-details.css`, and every element ID is kept.
  - Phones and tablets show one column. At 1200px and wider, the course card and files sit in a sticky side column. The JS breakpoint `COURSE_WIDE_LAYOUT` must match the CSS.
  - The category shows a readable label ("Bac Informatique") instead of the slug.
  - Chapters are numbered, with lesson and mini-défi counts and per-chapter progress. Rows use a chevron and are keyboard accessible (`aria-expanded`; lesson rows respond to Enter and Space). The first unfinished chapter opens by default.
- **Lesson player** (`public/js/course-details.js`):
  - Layout: chapter label, video, then a details card with the title and a green "Terminer & suivante" button, the description, and the lesson files.
  - The chapter list in the player highlights the current lesson (`.is-current`, matched by `data-lesson-id` instead of the onclick text) and opens only its chapter.
- **Replay player:** same layout. Fixed a bug where the replay title box was stretched to 288px tall.
- **Quiz popup:** the owner's timer line is kept, flush at the top edge.
  - New top bar: "Mini-défi" label, quiz title, an m:ss countdown, and the close button (it no longer overlaps the header).
  - The countdown and the timer line turn red in the last 15 seconds.
  - Below the top bar: step segments with "Question x/3", then A/B/C/D answer badges.
  - After checking, the right answer is marked green and a wrong pick red.
  - The button sits in a fixed footer, and results show a score ring.
  - On phones the popup is a bottom sheet.
  - Scoring, tracking and timing logic are unchanged.
- **Shared fix in `public/css/user.css`:** removed a phone-only rule that forced every `<section>` to `calc(100vh - 70px)` with its own scroll. It made lesson resources 954px tall and also affected inner sections of other pages such as Mon Portefeuille.
- **Verified** on the local mock with synthetic data, no real accounts:
  - Screenshots of the list, overview, replays tab, lesson, replay and quiz at 7 sizes from 360×740 to 1920×1080: no overflow and no JS errors.
  - Interaction checks pass at 390 and 1440px: tabs, chapter toggle, Enter opens a lesson, next item, replay parts, the full quiz flow, countdown, Escape and the close button.
  - Unit tests: 51 passed, 3 skipped.
- **Next:** a real-phone check of the Cours pages. Then Mon Portefeuille, the next item in the nav, if the owner asks. Deployment is still paused.

### 2026-11-20 — Calendar responsive UX pass (uncommitted)

- **What was wrong:** on phones the week controls stacked into three full-width buttons, so the days started below the fold, and Mardi and Mercredi were both labelled "M". From 900 to 1200px the week wrapped into a 4 + 3 grid of tall empty columns. On a normal desktop the seven columns were too narrow, so session titles broke into one word per line.
- **Now:**
  - Phones: one header, chevron week controls, a seven-day strip labelled Lu Ma Me Je Ve Sa Di, then the selected day's sessions.
  - 700px and wider, including 1024px and old 4:3 or 1:1 screens: the whole week as rows, with the full session title on one line.
- **Bugs fixed in `public/js/calendar.js`:** a date opened from a link now wins over "today" (the details used to show today anyway), and changing weeks keeps the same weekday selected. Escape now closes the session details. Past sessions still show "Séance terminée" with Rejoindre disabled.
- **Kept:** every session, the countdown, Rejoindre, "Ajouter à calendrier", and the empty-week message.
- **Verified** on a local mock with synthetic data, no real accounts: week changes, day selection, past and upcoming session details, and empty week. No horizontal overflow and no tiny tap targets from 320×568 to 1920×1080.
- **Next:** the same UX pass on Cours, the next item in the nav, if the owner asks. Deployment is still paused.

### 2026-11-20 — Dashboard responsive UX pass (uncommitted)

- **Root cause of the messy mobile dashboard:** the dashboard container was a flex item with `margin: 0 auto`, so it sized itself to the chapter stepper's content width (~815px). Every phone and tablet rendered an 815px page cut off at the right. Fixed with `width: 100%` and `minmax(0, 1fr)` grid tracks.
- **Layout (`public/css/dashboard.css`, rewritten; `views/pages/dashboard/index.ejs`, same content and IDs):**
  - Phones: one column ordered greeting → stats → continue → next session → path → replays → quick links.
  - 700–1339px (tablets, 1024px, and old 4:3 or 1:1 screens such as 1280×1024): balanced two-column grid.
  - ≥1340px: independent main and side columns (`.dash-col` wrappers), so tall cards no longer leave empty gaps.
- **Other fixes:**
  - Tap targets are at least 40–48px.
  - Calendar quick link no longer wraps.
  - Replays use light outline buttons instead of heavy orange ones.
  - Cards no longer lift on hover.
  - The chapter stepper scrolls horizontally and auto-centers on the current chapter.
  - Empty and error states are styled.
  - Focus-visible and reduced-motion styles added.
- **Shared shell (`public/css/user.css`):**
  - `body` uses `100dvh`.
  - On phones `.main-section` stretches instead of using `calc(100vh - 70px)`. The phone header is 60px, so pages previously ended 10px short, and the mobile browser toolbar hid content.
  - Code Pratique (`views/pages/code/index.ejs`) had the same hard-coded 70px. `.cp-page` and the phone `.code-pratique-main` now fill their container.
- **Verified (local mock server with synthetic data; no real accounts):**
  - Dashboard at 11 sizes from 320×568 to 1920×1080, active and new-student scenarios: no horizontal overflow, no tap targets under 32px, no JS errors.
  - Dashboard, calendar, courses and Code Pratique scroll areas end exactly at the screen bottom at 360, 390, 768 and 1440px.
  - Unit tests: 51 passed, 3 skipped (no PostgreSQL).
- **Next:** a real-phone check (iOS Safari and Android Chrome), then the same UX pass on other student pages if the owner asks. The deployment track is still paused, waiting for the owner's backup verification.

### 2026-11-20 — Live sessions verified + automatic Zoom → R2 replays (uncommitted; owner-approved plan)

- **Verification of the existing feature:** admin scheduling, cancellation and host launch were unchanged and working. Every student endpoint shares one access rule (`liveSessionAccess`), and no host link reached students.
  - Gaps found: no multi-offer support (now added); the join window was enforced only in the browser (now enforced on the server); there is no "edit session" endpoint (still true).
  - BUG-010 (status never becomes `live`/`completed`) remains.
- **Implemented (owner decisions 2026-11-20, see BR-17 and BR-19):**
  - Additional offers and individual grants per session.
  - Server join check `GET /api/live/:id/join`. Student APIs return `join_url`, never `zoom_join_url`. `/api/events` `zoomLink` is now this internal path.
  - Zoom webhook → durable queue → streamed R2 multipart import → automatic publish for a single segment; review for several segments, an existing replay, or an unmatched or ambiguous session.
  - Admin recording status, publish selection, assignment of unassigned recordings, « Réessayer », and deleting unwanted segments from R2, all in `admin/pages/sessions.html`.
  - « Partie N » replay parts and automatic recovery from expired links in `course-details.js`.
- **New files:**
  - `routes/zoom-webhook.js`
  - `services/live-features.js`, `services/zoom-recordings.js`, `services/recording-worker.js`
  - `tests/zoom-recordings.test.js`
  - `database/pending-migrations/202611200002_extend_live_session_access.sql` and `202611200003_create_zoom_recording_imports.sql`
- **Changed files:**
  - `server.js`, `routes/live.js`, `routes/user-api.js`
  - `utils/offerAccess.js`, `utils/r2Utils.js`, `utils/zoomClient.js`
  - `public/js/calendar.js`, `public/js/course-details.js`, `public/admin/pages/sessions.html`
  - `tests/security.test.js`, `package.json` (test script), `.env.example` (names only)
- **HELD — not in production:** both migrations sit in `database/pending-migrations/`, which the Docker runner does not read.
  - Without them, behavior is exactly as before: the new admin fields return 409, the admin features report off, and the webhook returns 503.
  - Also required: `ZOOM_WEBHOOK_SECRET_TOKEN`, `ZOOM_RECORDING_IMPORT_ENABLED=true`, the Zoom app scope `cloud_recording:read:list_recording_files:admin` (or `recording:read:admin`), and an event subscription for `recording.completed` → `https://<domain>/api/zoom/webhook`.
  - Recommended: an R2 lifecycle rule that aborts incomplete multipart uploads after 1 day.
- **Verified (fake Zoom and fake R2 only; disposable PostgreSQL 17.6, deleted afterwards; no real credentials or student data):**
  - 71/71 unit and database tests.
  - 20/20 API end-to-end checks: access matrix, join check, webhook signature and deduplication, import and publish, Range requests, review/publish/delete, R2 outage retry, missing-file retry, admin-only actions, leak scan.
  - 19/19 browser checks at 360, 390 and 1440 px: calendar join, dashboard, replay playback and seek, parts, a student without a purchase, the admin page, expired-link recovery.
  - Restart recovery: a stale import is reclaimed and its orphaned multipart upload aborted.
  - The pre-migration fallback: webhook 503, site normal.
  - Real fullscreen could not be exercised: headless Chrome refuses fullscreen even on a bare page. The test only confirms that native controls allow it.
- **Caveats:**
  - The worker runs inside the web process. One server instance is assumed, but leases make several instances safe.
  - Matching picks the occurrence whose `scheduled_at` is closest, within ±60 minutes of the session window.
  - Cancelled sessions are excluded from matching.
- **Next:** owner approval for the held migrations and the env/Zoom configuration, then one controlled real test (see the final report of this session). After that, BUG-010 or an "edit session" endpoint if requested.

### 2026-11-20 — LAUNCH PRIORITY: feature freeze (owner instruction)

- **Goal:** start teaching real Tunisian lycée students as soon as possible. No new feature batches. Batch 3 (resume lesson, 90% completion) is paused, not cancelled.
- **Launch scope only:**
  - Existing registration for lycée students.
  - Admin offers containing several courses.
  - Courses organized as chapters, lessons, video replays and quizzes.
  - Admin-scheduled Zoom sessions for eligible students, shown automatically on the student Dashboard and Calendar.
  - Students reach their purchased courses and materials.
  - A clean mobile and desktop experience, with Admin and Student data in sync.
- **Out of scope now (documented, not developed):**
  - University students and new audience types.
  - WhatsApp integration.
  - XP, badges and ranks.
  - Major redesigns.
  - Code Pratique Web mode.
- **Launch-blocker checklist and smallest fix set:** see the final report of this session, summarized here.
  - **Verification blockers (no code):**
    - Read `schema_migrations` on production (read-only) and back up the database before any deploy.
    - Confirm that active offers have `fixed_price` and linked courses.
    - Run one end-to-end smoke test on a disposable PostgreSQL or staging database with synthetic accounts: admin offer with 2 courses → deposit → purchase → course, video and quiz → targeted Zoom session on the dashboard and calendar, hidden for an ineligible student.
    - Do a quick pass on a real iPhone and Android phone, including Google sign-in.
    - Confirm the receipts R2 bucket is not public.
    - Confirm the Zoom and Resend variable names are set in production.
  - **Smallest code fixes — owner-approved and DONE 2026-11-20 (uncommitted):**
    - WAL-01: `public/js/paiement.js` shows only the `transactions` ledger, so purchases no longer appear twice. Purchases with no `payment_method` read « Achat ». Script version `?v=3`.
    - SEC-02: deleted `public/data/events.js` (3 past February 2026 events with Zoom links; it had no `export`, so `/api/events` never used it and still returns 200), `public/js/update_offers.cjs` and `public/js/paiement.js.backup`. Git history keeps them. `public/data/README.md` still mentions `events.js` and is stale.
    - A06 (display only): `public/admin/pages/payments.html` shows legacy `approved` deposits as « Confirmé », `cancelled` as « Annulé », and escapes unknown statuses instead of calling them « Rejeté ».
    - Verified: 4/4 browser checks (wallet at 390 and 1440 px, removed files return 404, `/api/events` 200), 7/7 status-label checks, and a 94/94 regression.
  - **End-to-end test on real PostgreSQL — DONE 2026-11-20 (owner-approved, local only):**
    - Setup: portable PostgreSQL 17.6 on `127.0.0.1:55432`, deleted afterwards. The repository's `schema_postgres.sql` loaded with no errors, and all 14 committed migrations applied cleanly through the real `scripts/migrate.js`.
    - The real `server.js` ran with `dotenv` stubbed, so `.env` was never read. Zoom, R2 and email were stubbed, outbound connections blocked, and the server bound to localhost.
    - **Launch flow: 36/36 PASS.**
      - Registration requires email verification.
      - The admin creates a targeted offer, two courses, chapters, a video with replay and a 3-question quiz.
      - A deposit is confirmed by the admin, and the offer purchase is idempotent.
      - The wallet ledger shows each movement once, and access works for both courses: signed video URL, quiz, progress saved.
      - A student who didn't buy gets 403. A student in another section doesn't see the offer.
      - A Zoom session for the offer, and one targeted at one student, are shown only to eligible students on the API, Dashboard and Calendar. An ineligible audience is refused.
      - Sync: a lesson rename shows on the student side, a session cancel disappears, the admin sees the purchase, and a deactivated offer is hidden while existing access is kept.
      - Security: no host link or password hash in any student response.
      - Browser at 390 and 1440 px: dashboard, calendar, course, catalog and wallet are clean.
    - **Batch 2B migration on the disposable database only: 6/6 PASS** (the hash-only storage, the 7 and 30 days, rotation, page renewal, 5 parallel renewals with one row lock, reuse revocation, logout revocation). Running it twice is a safe no-op.
  - **Launch polish — DONE 2026-11-20 (owner-approved):**
    - DSH-02: removed the synthetic XP, level and badges from the dashboard. The stats card now shows only lessons completed and overall progress (`dashboard/index.ejs`, `dashboard.js?v=7`, `dashboard.css`).
    - PRF-03: removed the placeholder level, points, active days and achievements from the profile (`profile/index.ejs`).
    - Course page counters: « Séances » is renamed to « Replays », which is what the counter counts, and the hard-coded « Arabe » language box is removed (`courses/details.ejs`, `course-details.js`).
    - Gamification stays a documented future feature.
    - Browser check at 390 and 1440 px: 6/6 PASS with no console errors. Unit tests: 46 pass, 0 fail.
- **Accepted launch risks:**
  - No self-service password reset; admins can set a new password via `/api/admin/change-student-password`.
  - Lessons are marked complete when the video starts (LRN-01).
  - Quiz scoring is client-side.
  - Admin magic links are not single-use.
  - The overview revenue KPI misses wallet offer purchases.
  - The live status never shows "en direct".
  - A harmless view-transition console exception after login.
  - The SQL has never been run against real PostgreSQL in these sessions.

### 2026-11-20 — Batch 2B: automatic session renewal (uncommitted)

- **Completed:** roadmap P0-4 / TASK-003 / BUG-003 (audit AUTH-01, AUTH-04).
  - New `backend/services/sessions.js`: opaque refresh tokens stored as SHA-256 hashes, rotation, reuse detection, logout revocation and one-time legacy JWT conversion.
  - `sessionRenewal(pool)` in `middleware/requireAuth.js`, mounted in `server.js` before all routes.
  - All sign-in paths use `startSession()`: password login, Google popup, iPhone Google callback and placement `/set-password`. Magic login is non-renewable. Duplicate token signers were removed from the routes.
  - Cookies are now `SameSite=Lax` everywhere. Expired access tokens clear only `synta_access`.
  - `head.ejs` renders the expiry meta only for sessions that cannot renew.
- **Owner decisions:** 7-day idle limit and 30-day absolute cap; `SameSite=Lax`; old refresh JWTs accepted once; migration file created for the owner to apply.
- **Migration (held, owner approval required):** `database/pending-migrations/202611200001_create_refresh_tokens.sql` (additive). It has NOT been run. The Docker image copies only `database/migrations/`, and `npm run migrate` reads only that folder, so a deploy cannot apply it. Without the table, login, pages and logout work exactly as before with one-hour sessions; this was browser-verified with the table missing (6/6 behavior checks).
- **Deployment sequence:**
  1. Deploy the code as is: renewal stays dormant, and sessions last one hour with the Batch 2A expiry handling.
  2. After owner approval, move the file into `database/migrations/` and redeploy; `npm run migrate` creates the table before the app starts. The owner can also apply it with `psql` first; the runner then applies it again (`IF NOT EXISTS`, a safe no-op) and records it.
  3. Renewal starts on the next sign-in, and existing refresh cookies convert on first use. No restart or code change is needed.
  4. Rollback: the table can stay unused; dropping it returns to one-hour sessions.
- **Verified:**
  - Unit tests: 46 pass, 0 fail, 2 PostgreSQL tests skipped. The 6 new tests cover rotation, reuse, expiry, the cap, legacy tokens, logout, magic login, a storage failure and the middleware fail-safe.
  - Browser, isolated harness with a stand-in DB that serializes transactions like row locks: 12/12 renewal checks, 24/24 Batch 2A checks and 94/94 Batch 1 regression.
- **Known limits:**
  - Not tested against real PostgreSQL; the SQL ran only against the stand-in.
  - Real Google sign-in and real phones were not tested.
  - The renewal failure throttle is per process and in memory, like `authRateLimit`.
  - A logout CSRF can still clear cookies; the refresh token is not revoked in that case. This existed before 2B.
- **Next:** launch-readiness only (see the launch-priority entry above). Batch 3 is paused by the owner.

### 2026-11-20 — Batch 2A: session expiry and recovery (uncommitted)

- **Completed:** roadmap P0-3 (audit AUTH-02, AUTH-03).
  - New `backend/utils/returnPath.js`.
  - `requireAuth` redirects to `/login?next=`, adding `&reason=expired` when a session existed.
  - `/login` shows the French notice and honors `next`; `redirectIfLoggedIn` uses the exported `verifyToken`.
  - `auth-entry.js` and `google-auth.js` return to `next`. On iPhone/iPad Google, a `synta_next` hint cookie scoped to the callback path is validated again server-side.
  - New `public/js/session-guard.js`, loaded from `head.ejs` together with a `synta-session-expires-in` meta tag: an expiry dialog, a 5-minute warning banner, and replay of failed progress and quiz saves.
  - The catalog, offers and wallet no longer auto-redirect on 401.
- **Unchanged:** token lifetimes, cookie flags, signing, and the unused refresh cookie (read only as a presence hint).
- **Verified:**
  - Unit tests: 40 pass, 0 fail, 2 PostgreSQL tests skipped.
  - Browser, isolated harness with the real `auth-api`, `pages` and `user-api` routes and a stand-in DB: 24/24 Batch 2A checks at 390 and 1440 px, plus a 94/94 Batch 1 regression run.
- **Known limits:**
  - An in-progress quiz restarts after re-login; its answers already sent are kept.
  - Unsaved profile and wallet form fields are not stashed.
  - The real Google sign-in (popup and iPhone redirect) was not exercised.
  - Login is rate-limited to 30 attempts per 15 minutes per IP.
- **Next:** propose roadmap P0-4 (refresh-token renewal) for owner approval, then Batch 3 (P1-1 resume next lesson, P1-2 90% completion).

### 2026-11-20 — Student experience audit and first quick-win batch

- Full read-only audit and roadmap: `docs/SYNTA_PLATFORM_AUDIT.md` (issue IDs) and `docs/STUDENT_UX_ROADMAP.md` (P0–P3). The audit's "Known Bugs" notes supersede the older table below where they differ.
- Owner decisions: a video lesson is complete at about 90% watched; XP, levels and badges are hidden; refresh-token renewal is approved; students cannot change class or section; students can join live sessions 10 minutes early.
- Implemented and covered by the regression suite (37 pass, 2 opt-in PostgreSQL skipped), syntax checks and EJS compilation:
  - Live sessions stay listed until their scheduled end.
  - The calendar uses `turboReload`, the 10-minute join window and `duration_minutes`.
  - Profile saves cannot change class or section and validate the phone number.
  - Catalog category chips use the stored values, and the empty results state and phone card widths are fixed.
  - The quiz has a close button and closes on Escape.
  - Offers link to the wallet when the balance is insufficient, and the stray CSS brace is fixed.
  - The favicon, sidebar logo, offer fallback and slogan use the lighter images.
  - The sidebar has Profile and Contact entries and sets `aria-current`.
- Browser-verified on 2026-11-20 with headless Chrome against an isolated local harness (synthetic data, stand-in DB, no `.env`): 94/94 checks pass, covering 8 pages × 5 widths plus calendar, profile, catalog, quiz, offers, wallet and sidebar actions. Details are in `docs/SYNTA_PLATFORM_AUDIT.md` Section 11.
- Not yet verified: the live-session duration SQL on real PostgreSQL, and real phones. Uncommitted; nothing has been deployed.
- New pre-existing findings: OFF-08 (offer cards show no offer name) and PRF-06 (mobile profile form sits below the stats).
- Next: roadmap P0-3 (session-expired handling) and P0-4 (refresh tokens), then P1-1 and P1-2 (resume the next lesson; complete at 90% watched).

### 2026-11-14 — Project-wide audit and bug fixes

- Fixed: receipt XSS (deposit receipts must be PNG/JPEG/WebP/GIF/AVIF by magic bytes, max 20 MB; the admin proxy serves only raster types with nosniff and sandbox CSP), refresh/magic token reuse as sessions, unescaped profile values in `head.ejs`, server-crashing admin handlers, NaN debt payments, `.env` load order in `server.js` and `scripts/migrate.js`, startup crash without `RESEND_API_KEY`, CRLF-sensitive migration checksums, 500s for CORS rejections and malformed JSON, and negative or NaN admin page sizes.
- Fixed: Turbo re-execution of page scripts. The courses, course details, dashboard, offers, profile, contact and wallet pages pass `turboReload: true` to `head.ejs` and fully reload. Remove that flag only after their scripts are made idempotent.
- Fixed: missing course-thumbnail endpoint, course back link, calendar course title, missing `showToast` in admin students, admin login for non-admins, the Skulpt load-failure spinner, sidebar outside-click, session-form timezone, invalid AI calendar sources and the `push_notification.js` syntax error.
- Verified: 35 regression tests pass (2 opt-in PostgreSQL tests skipped), plus syntax checks and scripted receipt, JWT and template checks. Browser, staging and production were not exercised.
- Owner-approved: an expired permanent enrollment no longer blocks course re-purchase or free re-enrollment. The existing row is reactivated with the new payment. Not yet exercised against PostgreSQL.
- Removed the unused lesson-feedback flow from the course player and API. The old table is left untouched.
- Lesson progress is saved only when the student can access the lesson.
- The wallet history no longer shows the broken Ouvrir button. The contact form opens the student's mail app instead of pretending the message was sent.
- Code Pratique loads the Python editor only. The deferred Web editor source stays in the page and its extra language scripts are not downloaded.
- Kept for the student journey: registration, Bugi, Code Pratique Python, courses with video and live sessions, and the révision, monthly and annual offers.
- Open, needs owner decision: `PUT /api/user/me` accepts unvalidated class/branch; there is a global 50 MB JSON body limit; `TRUST_PROXY_HOPS` must be 1 behind Coolify for per-client rate limits.

- Annual offer cards show « Abonnement annuel » followed by the academic year configured by the administrator.

- Eligible monthly offers open a renewal dialog with a fixed-price receipt submission, a link to wallet payment details and an existing wallet checkout option. Receipt submission enters the existing pending deposit review flow.

- Removed the examples dropdown from Code Pratique and updated the empty-editor prompt.

- Student offer cards use the access label in the title slot. Annual cards show the configured academic year, while exact expiry and installment options remain in checkout.

- Chapters and Replays tabs are hidden when their respective content is empty. A replay loading error remains visible to enrolled students so they can retry.

- The Replays tab lists and counts available recordings only. Upcoming live sessions remain in the calendar.

- Replay-only course details open on Replays. Chapter and replay updates show red dots for students with course access until they open the affected tab. Revisions are compared in the student's browser without a time limit.

- The course editor clarifies that Niveau is difficulty. Linked offers target discovery by class and section, and published courses with no linked offer are visible to all users.

- The historical enrollment form defaults the Tunis access start to the payment date. Admins can unlock the field to enter a different start date.

- Admin installment receipts support an optional reference and optional raster attachment. Historical dates and admin verification remain required for backdating. Attachments use the existing transaction receipt field and admin viewer.

### 2026-11-13 — Admin offer assignment

- Timed offers without linked courses are explained in student details and excluded from the enrollment picker.

- Student details now uses the same class and branch matching as the student catalog. Admins can prepare a monthly enrollment and use the existing verified external payment form to enter the original payment and coverage dates. Full-payment monthly offers require the full price.

- Student offer cards share a centered row when the available content width fits them and stack on narrow phones. Card styling and checkout are unchanged.

### 2026-11-12 — Original offer styling restored

- Restored centered prices, rounded gradient buttons, full-width featured banner and original card colors. Cards stay in a responsive grid with natural page scrolling. Checkout and access terms are preserved.

### 2026-11-12 — Monthly and academic-year offer terms

- The catalog distinguishes access modes, shows manual monthly renewal and the configured annual cutoff, and displays installment options when scheduled checkout is enabled. Exact student-specific amounts and expiry remain in checkout and purchase history.

### 2026-11-12 — Student offer cards

- Replaced the clipped offer carousel with a responsive grid. Cards display all features and one purchase action, and use the saved featured status. Monthly prices display `DT / mois`.
- Validated responsive rendering and checkout in local Chrome with synthetic data and disposable PostgreSQL. Production verification remains pending.

### 2026-11-11 — Offer editor viewport

- Kept the title, header close button and form buttons outside the scrolling fields. Chrome verified the Save button stays visible with 30 features in short mobile and desktop windows.

### 2026-11-11 — Admin course images and visual fixes

- Added course image selection from associated offers and recent Courses-th R2 images, upload and removal. Students can load the same references in the course list and detail views. No schema change.
- Improved the admin toolbar and profile icon, Live Sessions heading contrast, and offer dialog sizing and footer.
- Verified 31 regression tests with one opt-in PostgreSQL test skipped, and the course editor image flow in Chrome with synthetic responses. Live R2 permissions and deployment remain unverified.

### 2026-11-11 — Placement and thumbnail rendering

- Fixed the approved placement interpolation and course thumbnail URL assignment. Headless Chrome verified literal text, a valid image, rejected schemes and the failed-image placeholder. The regression suite passed 29 tests with one opt-in PostgreSQL test skipped.
- The audit records the unused raw EJS configuration fragment and UUID-bound inline actions as separate findings. No deployment or backend schema changes.

### 2026-11-11 — Approved admin offer and rendering fixes

- Added an admin-only offer activation switch and corrected the active-offer KPI. Existing purchase eligibility and grants use their current rules.
- Encoded untrusted text and bound actions safely in Students and Payments, and encoded the Offers list fields. Other admin views were audited only. Verified 27 regression tests and local Chrome checks. One opt-in PostgreSQL test was skipped. No deployment.

### 2026-11-11 — Admin dashboard UX and audit

- Modernized the existing admin shell and pages with shared styles, responsive tables and keyboard navigation. See ADMIN_DASHBOARD_AUDIT.md for route inventory, test coverage, security findings and pending owner decisions.

### 2026-11-11 — Deep analysis deployment QA

- Audited credential isolation and added a guarded one-request synthetic staging smoke command with sanitized output. The full 26-test PostgreSQL suite passed. No Coolify access, live request or deployment was performed.

### 2026-11-11 — Separate Gemini key for deep learning analysis

- Added an internal on-demand analysis service that uses only LEARNING_GEMINI_API_KEY. It skips accounts without supported weaknesses and never runs from Bugi chat. LEARNING_GEMINI_ENABLED=false disables it.
- All 26 tests passed, including disposable PostgreSQL and mocked key isolation, provider failure and quota backoff. No live provider validation or production changes.

### 2026-11-11 — Bugi cross-device clear

- Added account history revisions and atomic PostgreSQL transactions for clearing and saving Bugi history. A reply from a previous revision can return to the requesting device but cannot be stored or restore learning evidence.
- The disposable PostgreSQL suite covers simultaneous clears, stale and fresh replies, interrupted provider calls, concurrent saves and evidence consistency. Migration 202611110003 follows the two Bugi transcript and evidence migrations.
- Prepared a staging-only Gemini validation command with six multilingual synthetic cases. The dry run passed. Live provider validation remains pending.

### 2026-11-11 — Bugi learning QA

- Ran the full migration runner twice on disposable PostgreSQL 18 with the repository base schema. All 25 tests passed, including synthetic conversations, account isolation, concurrent evidence writes, foreign keys, indexes and cascades.
- Tightened evidence validation and deduplication and prioritized practice recommendations by evidence count then recency.
- A reply already in progress on another device can be saved after a history clear. Existing committed messages and derived evidence are deleted together. Confirm cancellation semantics before production.
- Live Gemini metadata accuracy, provider token counts and production-scale query performance remain unverified. The synthetic database was dropped and the local server stopped.

### 2026-11-11 — Bugi learning intelligence

- Added account-scoped learning evidence and read-time profiles for topic interest, difficulties, demonstrated progress and explicit preferences. Bugi uses a bounded, relevant subset. Gemini can supply evidence metadata in the same reply.
- Apply migrations 202611110001 (transcript) then 202611110002 (learning evidence). The migration runner sorts and records both. Production has not been changed. Next verify against staging PostgreSQL and measure real Gemini metadata quality.

### 2026-11-11 — Bugi conversation history

- Implemented the approved Bugi transcript migration, signed-in history pagination and deletion, and topic-based personalization with no additional Gemini call. Successful exchanges are saved. Legacy browser-only history and raw attachments are not imported.
- Mocked provider and history route checks and all 16 regression tests passed. The migration has not been run on production. Next verify on PostgreSQL and across two signed-in devices.

### 2026-11-11 — Proposed Bugi history and study topics

- Documented the proposed account-scoped Bugi transcript and topic labels in DATABASE_SCHEMA.md. Current history still keeps up to 20 bubbles in the browser. Awaiting schema confirmation before adding a migration.

### 2026-11-11 — Bugi status badge

- Added a green En ligne pill around the label and dot. The Hors ligne state for exhausted free replies depends on the pending account allowance.

### 2026-11-11 — Bugi chat controls

- Restyled the popup in blue with French controls. Students can attach editor code or a local .py file, copy reply snippets, and load and run Python snippets in the editor with the green Play button. Template and snippet action checks passed. Desktop and phone visual checks are pending.

### 2026-11-11 — Bugi typing and repeat explanations

- Replaced visible typing text with three staggered dots. The debugger answers locally if the editor still contains the last successfully explained code. Failed requests remain retryable. Verified template rendering and debugger decisions with a mocked request.

### 2026-11-11 — Bugi chat palette

- Tinted the chat and composer blue-gray, raised contrast between message surfaces, and removed extra whitespace around code snippets. Browser visual verification is pending.

### 2026-11-11 — Bugi offer setup

- Added an admin offer checkbox that stores a Bugi feature in the existing offer JSON. Updated the expired-login copy.
- Five-reply enforcement is pending confirmation of the proposed durable account counter in DATABASE_SCHEMA.md. Then connect the feature to existing offer entitlement checks and render the offer action when the allowance runs out.

### 2026-11-11 — Bugi character

- Centralized Bugi's Tunisian Darja tutor prompt and offline messages in backend/services/bugi-character.js. The popup maps expired sessions, quota limits and service failures to local copy without another model call.
- Verified six fallback cases and all 16 regression tests. Live Gemini tone remains to be checked.

### 2026-11-11 — Bugi chat popup

- Replaced the drawer with a Messenger-style popup, a phone layout, a typing indicator, and an unread dot when minimized.
- Both entry points share one request flow. Fixed launcher input, duplicate history loading, overlapping requests, and late replies after clearing history. Session and quota errors have distinct messages and failed typed questions return to the composer.
- Verified rendering, mocked chat behavior and all 16 regression tests. Next check the authenticated popup on desktop and with a phone keyboard and test live Gemini responses.

### 2026-11-11 — Bugi Gemini usage

- Use Gemini 3.5 Flash-Lite first with a 480-token output budget and minimal thinking. Fall back to 3.5 Flash only if Flash-Lite returns 404. Honor provider quota cooldowns.
- Deduplicate and reuse identical requests for five minutes within the same account and backend process. Limit each authenticated account to 15 requests per five minutes.
- Mocked provider tests verified cache isolation, deduplication, model fallback and quota handling. All 16 existing regression tests passed. Live free-tier quotas and answer quality remain to be checked.

### 2026-11-11 — Bugi tutoring

- Shortened Tunisian Darja replies to a focused diagnosis and correction. Direct questions work without code, follow-ups include the last reply, and debugging omits stale console errors.
- The student UI greets by first name. Gemini receives academic level, branch and up to two existing weak-topic labels. History uses account-scoped JSON and safe text rendering. Legacy shared HTML history is no longer loaded.
- Verified template rendering, mocked provider fallback and request validation, and 16 regression tests. Next verify live answer quality with Gemini and sample student exercises.

### 2026-11-11 — Code Pratique readability and results

- Matched the login code window's font stack and switched Python to a dedicated CodeMirror theme so the Dracula background cannot override the academy palette. Increased editor and console type and enabled visual wrapping.
- Phones open the console when a Python run finishes if the student is still on the editor tab. Python receives the original indentation.
- EJS, script syntax, mobile result routing and 16 regression tests passed. Next verify the authenticated layout, interactive input and live output in a desktop and phone browser.

### 2026-11-11 — Code Pratique workspace design

- Matched the editor, console and variables to the login code window using shared navy, cyan and orange styles. Improved the variables empty state, focus rings and tablet panel sizing.
- Verified EJS rendering, inline script syntax, existing event handlers and 16 regression tests. Python runtime logic and the deferred Web mode were preserved.
- Next check the authenticated workspace visually on desktop, tablet and phone and exercise Python input and a course-file handoff in the browser.

### 2026-11-11 — Navbar logo spacing

- Constrained the official navbar logo to 56px high on desktop, 50px on tablet and 44px on phones. Block image layout removes the inline-image baseline gap; 8px navbar padding keeps the logo vertically centered within the existing header heights.
- Homepage stylesheet hash refreshed. Browser visual verification remains pending.

### 2026-11-11 — Footer/menu pre-release review

- Fixed a closed-menu visibility inheritance conflict and reserved the footer logo's intrinsic aspect ratio to avoid a lazy-load layout jump.
- Review checks include visible text/image preservation, balanced homepage HTML, asset hashes, script syntax and the full regression suite. Actual mobile-browser animation remains a manual follow-up.

### 2026-11-11 — Unified mobile menu transition

- Grouped the existing navigation and account links in one header-menu container. Desktop keeps its flex layout through display:contents. Mobile uses one fixed scrollable panel with a short coordinated fade/6px transition.
- Removed separate fixed positioning and transition behavior from the mobile navigation/account sections. Account buttons now sit inside the panel and remain reachable on short screens. Selected links use a restrained navy/orange highlight.
- Kept the 44px toggle, Escape/Tab handling, scroll restoration, reduced-motion support and existing link text/destinations. Expanded state now controls the combined panel and closed panels are inert.
- Browser animation verification remains pending. The regression suite covers the combined panel state, DOM grouping, focus and scroll behavior.

### 2026-11-11 — Footer alignment follow-up

- Fixed the screenshot's heading/social-icon misalignment by aligning the RTL social row to its contact heading. Constrained the footer width and sized its brand/link/contact columns deliberately.
- Set consistent logo sizing, description width, readable link spacing and 44px social targets. Tablet layout groups the brand above two columns; phone layout centers the brand/contact blocks and arranges quick links in two columns.
- Existing footer copy, imagery, destinations and copyright content are preserved. Refresh the homepage stylesheet hash after stylesheet edits. Browser visual verification remains pending.

### 2026-11-11 — Homepage UI refinements

- Retained all visible homepage text, images, section order and the existing animated hero concept. Added root-only styles for consistent spacing, aligned course cards, balanced feature/testimonial grids, restrained hover feedback and higher-contrast orange buttons.
- Improved phone layouts, 44px menu targets, visible keyboard focus and reduced-motion styles. The existing About links now target the existing academy features section.
- Mobile navigation preserves the page scroll position, exposes expanded state, excludes closed links from focus, contains keyboard focus while open, closes with Escape and resets on desktop resize/browser return. No new front-end dependency or asset was added.
- Existing homepage content hashes were refreshed and the delivery middleware continues computing them after deployment. All 16 tests pass, including menu scroll/focus/resize behavior. Visible text, image descriptions and content hashes were checked. Browser visual verification is still pending.

### 2026-11-11 — Homepage delivery optimization

- The root/index homepage now references the existing WebP conversions instead of original PNG/JPG/JFIF/GIF assets. Original files remain available. Its 177-frame course animation retains every frame duration, the 5900 ms total and looping. A 64px PNG favicon replaces the 3507px icon download for this page.
- Total referenced image bytes, including the favicon and below-fold images, decrease from 24,348,129 to 674,635 (97.23%). These are file payload measurements, not a live page-load or Lighthouse score. The hero image has an explicit preload and high fetch priority; below-fold images keep lazy loading and gain async decoding.
- Homepage HTML, style.css and main.js use cached Brotli/gzip encodings through a narrowly scoped public-file middleware. HTML remains revalidated; content-hashed static URLs use one-year immutable caching. Hashes are recomputed when the homepage is loaded after an app restart/deployment. Other static URLs keep normal Express cache behavior; authenticated APIs and EJS pages are outside the compression middleware.
- CSS, interaction scripts and visible UI markup/text compare unchanged against HEAD after normalizing only image delivery attributes and asset URLs. Existing image conversions are lossy/resized; their transparency, animation timing and source-file availability were checked.
- Fifteen tests pass, including actual loopback HTTP checks for encoding negotiation, ETags/304, HEAD, range fallback, cache headers and private-route isolation. The live website was inaccessible to the web tool, so actual browser layout/performance and post-deployment cache behavior still need verification.
- No database migration, new npm dependency or deployment environment variable is required. Next step is staging verification of homepage/mobile menu, animation and HTTP headers before publishing these changes.

### 2026-11-11 — Registration-style verification email

- Signup and resend verification emails now mirror the registration confirmation screen with a centered official logo, pale envelope badge, cyan eyebrow, navy headline, light slate background and full-width orange confirmation button. French copy is adapted for an email already in the learner's inbox.
- Uses responsive presentation tables, inline styles, an Outlook width wrapper and a plain-text alternative. Recipient/name/URL HTML is escaped; verification URLs are built with URL/searchParams.
- Email payload checks and all 14 regression tests pass. Live Gmail/Outlook rendering and delivery remain unverified. Next step is a staging mailbox check of the signup and resend messages.

### 2026-11-11 — Restore academy branding on authentication pages

- Auth pages now reuse the official logo.webp and whiteorangeweb.webp assets. Removed the invented s. mark.
- The shared auth palette follows public/css/style.css brand tokens: navy #013047, orange #F6851F, cyan #219EBC, neutral slate and white. Typography follows the shared site head using Tajawal with display=swap. The French login and signup copy remains in place.
- No separate graphic charter document was found in the repository; existing brand tokens, shared typography and supplied logo assets were used as the source of truth.
- All 14 security tests pass. All five auth templates render with the official logos, French copy and no Arabic characters in the rendered test pages. Verification emails also use the official logo and palette. Browser visual verification remains pending.

### 2026-11-10 — Legacy payments deployment recovery

- Production logs confirmed migration 202611100003 failed because the existing payments table lacks status. This prevents Node startup and causes the proxy's Bad Gateway response.
- Added 202611100002_ensure_offer_payment_status.sql, ordered before the failing index migration. It adds the documented status column with pending as its default and preserves existing rows. Already-applied migration contents are untouched.
- Redeploy the recovery commit through Coolify. Verify the compatibility migration and active-offer index both apply, then confirm the server starts and /health responds.

### 2026-11-10 — French authentication experience

- Login, two-step email signup, Google profile completion, email confirmation and account recovery guidance use a shared French layout with responsive styling and reduced-motion support. Native cross-document transitions progressively enhance navigation.
- Signup separates account details from the learning profile. School learners choose an existing year and section; independent learners use the existing other/other profile values. Phone normalization accepts the Tunisian country prefix. Signup and Google onboarding share server-side profile validation.
- Removed the unused Supabase SDK and external font/icon downloads from these pages. Verification email copy is French. The unavailable password-reset form is replaced by direct support guidance. The old terms checkbox linked to an absent /terms page; that dead control was removed pending real terms content.
- Thirteen regression tests, five EJS auth template renders and JS syntax checks pass. Desktop/mobile browser visual verification is incomplete because Computer Use could not reliably identify the Windows browser URL. Verify the two signup steps, focus, Google handoff and mail resend on staging before claiming visual sign-off.

### 2026-11-10 — Critical security remediation and payment integrity

- Placement registration returns generic acceptance and sends a 30-minute email proof for eligible new users. Email confirmation consumes the signed proof by atomically changing the registration revision. The resulting HttpOnly cookie authorizes quiz submission and one account activation. Activation never changes an existing user's password, requires quiz completion and links `auth_user_id` in a transaction. Old UUID-based placement credentials are rejected. TASK-007 is complete.
- Legacy enrollment permits free courses only. Paid course access uses the authenticated wallet checkout and a recorded debit. User-submitted wallet requests are forced to pending deposits.
- Offer purchases lock the user before duplicate checks, record an independent offer grant and debit the configured database price atomically. A repeat active user/offer pair returns success without a charge. Admin installment enrollment uses the same lock and independent offer grant. Shared course enrollment no longer drops a newly purchased offer's live benefits.
- Migration `202611100003_unique_active_offer_payments.sql` adds uniqueness for new active offer grant statuses without rewriting historical rows. Existing active offer enrollments retain access. Older overlapping purchases with no reliable stored offer ID need operator review; no balances or historic charges were modified.
- Live lists, replays, resource code, calendar and eligible student selection share the same authorization predicate. Cancelled sessions are hidden. Cancellation preserves records and only deletes a shared Zoom meeting after its final active local date, or for an explicit series cancellation. Zoom errors abort the local operation; retries accept Zoom's already-deleted code.
- Thirteen regression tests use Node's test runner and service/database doubles and pass locally. Actual PostgreSQL locking/SQL, real Resend delivery, browser behavior and Zoom integration still need isolated staging verification. No production operations were performed. Run `node --experimental-vm-modules --test backend/tests/security.test.js` from the repository root, or `npm test` in backend when npm is installed.
- Configure `RESEND_API_KEY`, `APP_URL` and exact `TRUST_PROXY_HOPS` for the deployment topology. Auth rate limits are per process. Existing JWT sessions are not globally revoked by password changes; TASK-003/TASK-006 should address session renewal and revocation. Admin password changes clear pending email verification credentials.
- Next step is isolated staging validation of the migration, duplicate checkout from separate connections, new placement activation, overlapping offers and cancellation retries. Do not deploy or push these changes without the user's release instruction.
- API compatibility changes are intentional. Placement registration no longer returns an ID/token; email confirmation creates an HttpOnly session before the quiz. Legacy paid enrollment returns 403; paid browser callers use the wallet endpoint. Admin session JSON returns `has_host_link` instead of the host URL; the host button uses a protected page redirect. Existing no-fixed-time Zoom meetings have no stored occurrence identifiers, so cancellation of one date is local while its shared meeting remains for other dates.

### 2026-11-10 — Google sign-in and learner journey review

- Login and registration use Google's visible button and the same `GOOGLE_CLIENT_ID` as the backend. The iPhone/iPad callback validates Google's CSRF token. The numbered migration reconciles existing auth fields that previously depended on legacy SQL scripts.
- The temporary public database initialization and admin promotion routes were removed. After deploying, review existing admin accounts since older builds exposed the promotion route.
- Verify both existing and new Google users on desktop and iPhone after Coolify deployment. Check the exact production origins and redirect URIs in Google Cloud. Then prioritize TASK-003 for session renewal and TASK-012 for password recovery.
- Learner journey reviewed across public entry, registration/placement, profile, dashboard, catalog, wallet, course player, live/replay, progress and Python practice. The next product decisions are an explicit onboarding path for learners outside school and reusable cohorts. Define paid individual access and offer-included group access separately before changing billing or enrollment. Per-session audiences shipped as the first step toward TASK-013.

### 2026-11-10 — Individual and group session audiences

- Admin → Sessions → Participants supports selecting one or several currently eligible students when scheduling a Zoom session. Recurring dates share the selected audience. This is a per-session selection.
- Student session lists, calendar entries, replays and resources enforce the audience alongside enrollment. Existing sessions keep their course and offer access.
- The production Docker command applies migration `202611100001_add_live_session_audience.sql` before starting Node. After deploying, verify a restricted session with one selected and one unselected student account. TASK-013 remains open for reusable cohorts.

> **Last updated:** 2026-11-06  
> **Updated by:** Auto  
> **Next recommended task:** Deploy and verify dashboard continue/parcours on a student with no courses, one unstarted enrollment, and a last-watched course; then continue TASK-004 in `IMPLEMENTATION_PLAN.md`

---

## Project Status: OPERATIONAL — CRITICAL PURCHASE AND AI AUTHORIZATION FIXES APPLIED

The backend is running in production on Coolify. Core features (login, course access, payment flow) work. Purchase identity and the AI debugger endpoint require cookie JWT authentication. Course details now show real enrolled-course live sessions and replay state; other open issues remain listed below.

### 2026-11-06 Google Sign-In iPhone Fix
- Custom Google button no longer nests GIS controls inside a `<button>` (invalid HTML that blocked iPhone taps).
- Overlay uses non-zero opacity and `pointer-events: none` on the ripple layer so taps reach Google’s iframe.
- iPhone/iPad uses GIS `ux_mode: 'redirect'` to `POST /api/auth/google/callback` (needs that URI in Google Cloud Authorized redirect URIs).
- Failed redirect sign-in returns to `/login?google_error=…` with a visible message.

### 2026-11-06 Dashboard Continue / Parcours Fix
- Continuer ton apprentissage now features the last-watched / started course (`last_accessed` or lesson activity), with Commencer vs Continuer CTAs. Empty enrollments show an offers CTA and hide parcours.
- Unpublished courses (`Publier le cours` unchecked) are excluded from student my-courses / dashboard cards and student course detail access; enrollment alone no longer surfaces them.
- Empty modules and load errors get explicit empty states. Offer purchase clears dashboard SWR cache keys so enrolled courses appear after buy.

### 2026-11-06 Code Pratique UX Update
- Reworked the Code Pratique page layout for responsive desktop, tablet, and mobile panel navigation; added dedicated mobile tabs for editor/console/variables and editor/preview.
- Added local draft persistence for Python and Web editors, an approachable default Python example, clearer French guidance, and run-button progress/error states.
- Course-file startup remains idempotent; queued lesson files populate the editor and filename after CodeMirror mounts.
- **Verification pending:** static checks and visual checks at 1920×1080, 1440×900, 1366×768, 1024×768, 390×844, and 360×800. Changes are local and require deployment before production verification.

### 2026-11-06 Mobile Control Density Update
- On mobile, workspace tabs now remain in one row; narrow phones use icon-only tabs with accessible labels/tooltips.
- Python Run and Export are compact icon-only buttons on mobile; screen-reader labels/tooltips remain. Redundant status/subtitle copy is hidden only on the narrowest screens.
- Lesson resource download/preview/Code Pratique actions were already icon-only and accessible.
- Visual verification on-device remains pending; deploy before checking real mobile behavior.

### 2026-11-06 Desktop Controls and Deferred Web Mode
- Run and Export are compact icon-only controls on desktop and mobile, with accessible labels and tooltips.
- The Code Pratique header shows a green readiness dot beside the product name; the “Python prêt” text is screen-reader announced only.
- Python/Web mode tabs are hidden. Python remains the active student workspace; the existing HTML/CSS/JavaScript editor code is retained but dormant.
- **Product decision:** Web mode and its “Aperçu” tab are intentionally hidden until the rest of Synta’s student website is stable. Do not resume or expose either until the user explicitly asks to continue Code Pratique Web development. This decision is recorded in `AGENTS.md`.
- The Python editor now receives the largest desktop column; console and variable panels have wider minimums and the code font scales slightly larger. Tablet keeps a full-width editor above the two output panels.
- On mobile, the editor panel now expands to fill the available viewport below the compact header and three panel tabs. “Aperçu” is removed from the visible tabs while Web mode is deferred and will return with Web mode.

### Python Curriculum Compatibility — Implemented, Browser Verification Pending
- Basic snippets remain on Skulpt. Snippets containing imports or `match/case` use a lazily initialized Pyodide 0.29.2 sandbox, with package loading from imports; NumPy is included in Pyodide's package distribution.
- The Pyodide runner is in `backend/public/pyodide-runner.html` and `backend/public/js/pyodide-runner.js`. It runs in a sandboxed iframe (`allow-scripts allow-modals`), returns stdout/stderr and a variable snapshot, and uses the browser's native prompt for `input()`.
- Parent page hardens iframe creation with a shared promise, keeps Skulpt-style success/error/Bugi feedback, and only shows the first-load NumPy message until Pyodide has completed once.
- Course `.py` handoff and normal Skulpt input behavior remain unchanged. The first advanced run requires downloading the Pyodide runtime; NumPy is loaded only when imported.
- **Known limitation:** synchronous Pyodide code runs in the sandbox iframe's main thread, not a Web Worker. Very long/infinite loops may affect responsiveness. A worker input bridge is future hardening work.
- **Verification pending:** run a NumPy + `match/case` exercise on the live Code Pratique page and test multiple `input()` prompts. Routing regex and runner syntax checks pass locally; full browser execution against a running server is still pending.

---

## 1. Working Features (Verified in Source Code)

### Authentication
- ✅ Email/password registration with email verification (Resend)
- ✅ Google OAuth sign-in (google-auth-library)
- ✅ JWT-based sessions (HttpOnly cookies: `synta_access` 1h, `synta_refresh` 7d)
- ✅ Email verification flow (token-based, 24-hour expiry)
- ✅ Logout (cookie clearing)
- ✅ Admin magic login (impersonate any student)
- ✅ Google onboarding (collect phone/class/branch after Google sign-in)
- ✅ Placement quiz session (register → quiz → score → account creation)

### Course Content
- ✅ Course catalog (published courses, category/level filter)
- ✅ Module and lesson structure (course → modules → lessons)
- ✅ Video content via Cloudflare R2 signed URLs (5-minute expiry)
- ✅ PDF content via Cloudflare R2 signed URLs
- ✅ Preview lessons (accessible without enrollment)
- ✅ Thumbnail signed URLs

### Enrollment & Progress
- ✅ Course enrollment (via purchase or admin)
- ✅ Offer enrollment (enrolls in all associated courses)
- ✅ Free course enrollment
- ✅ Enrollment access control (checks enrollment before serving content)
- ✅ Lesson progress tracking (completion %, last position for video resume)
- ✅ Course progress % (automatically recalculated on lesson completion)

### Financial System
- ✅ Internal wallet (users.balance)
- ✅ Deposit requests with proof upload (image → Cloudflare R2)
- ✅ Admin payment confirmation (credits balance atomically)
- ✅ Admin payment rejection
- ✅ Course purchase (balance deduction + enrollment)
- ✅ Offer purchase (balance deduction + all-course enrollment)
- ✅ Partial enrollment with debt tracking (admin-managed installments)
- ✅ Debt payment (admin-managed)
- ✅ Transaction history (student view)

### Offers
- ✅ Offer catalog with class/branch targeting
- ✅ Offers bundled with multiple courses
- ✅ Offer features (live_access, exams, community) stored as JSONB
- ✅ Best seller flag and offer image

### Live Sessions
- ✅ Zoom session scheduling (admin creates via Zoom S2S OAuth)
- ✅ Recurring session creation
- ✅ Student upcoming sessions (filtered by enrollment)
- ✅ Session replay listing (past sessions with replay_url)
- ✅ Zoom meeting deletion
- ✅ `zoom_start_url` correctly excluded from student responses

### Admin Panel
- ✅ Student list with search, pagination, class/branch filters
- ✅ Student detail view with enrolled offers
- ✅ Student deletion
- ✅ Student password change
- ✅ Course CRUD (via admin API + admin HTML panel)
- ✅ Offer CRUD (via admin API + admin HTML panel)
- ✅ Payment queue management
- ✅ Payment receipt viewing (R2 proxy)
- ✅ Admin notification polling (pending payments, new signups)
- ✅ Placement quiz question management (CRUD)
- ✅ Session config management (date, subject)

### AI Assistant
- ✅ Bugi code debugger (Python code analysis in Tunisian Darja; requires authenticated JWT cookie)
- ✅ Gemini model fallback chain (3 models)

### Other
- ✅ Lesson feedback submission
- ✅ Quiz response recording
- ✅ Weak topics listing (table exists, reads fine — writing is broken)
- ✅ Notifications (per-user, stored in DB)
- ✅ Calendar events (static + live session events)

---

## 2. Partially Working Features

| Feature | Status | Issue |
|---------|--------|-------|
| Refresh token renewal | ✅ 2026-11-20 | Rotating hashed refresh tokens renew sessions automatically (Batch 2B, in code). Dormant until the owner approves `database/pending-migrations/202611200001_create_refresh_tokens.sql`; sessions last one hour until then. |
| Weak topics tracking | ⚠️ PARTIAL | Table exists, read endpoint works, but nothing writes to it. Always returns empty. |
| Session → User link | ⚠️ PARTIAL | `session_registrations.auth_user_id` is never updated after account creation in `set-password` route. |
| Live session status | ⚠️ PARTIAL | `status` field exists but always stays `'scheduled'` — never updated to `'live'` or `'completed'`. |
| Password reset | ⚠️ PARTIAL | EJS page exists (`/password-reset`) but backend endpoints do not exist. |

---

## 3. Known Bugs (Critical First)

| ID | Severity | File | Description |
|----|----------|------|-------------|
| BUG-001 | ✅ FIXED 2026-11-05 | `routes/purchase.js` | Both purchase endpoints use `authApiMiddleware` and take the purchaser ID from `req.user.id`; browser callers no longer send `userId`. |
| BUG-002 | ✅ FIXED 2026-11-05 | `routes/ai-api.js` | `POST /api/ai/debug` uses `authApiMiddleware`. |
| BUG-003 | ✅ FIXED 2026-11-20 | `services/sessions.js`, `middleware/requireAuth.js` | Refresh tokens now rotate and renew sessions automatically (Batch 2B, uncommitted). |
| BUG-004 | 🟡 HIGH | `routes/admin-api.js`, `routes/user-api.js` | Schema columns added at runtime via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Fragile and unversioned. |
| BUG-005 | 🟡 HIGH | `routes/session.js` | `POST /api/session/set-password` creates user account but does NOT update `session_registrations.auth_user_id`. |
| BUG-006 | 🟡 HIGH | No backend files | Password reset flow is not implemented. The `/password-reset` EJS page has no backend support. |
| BUG-007 | 🟡 HIGH | `routes/tracking.js` | `GET /api/tracking/weak-topics` reads from `user_weak_topics` which is never written. Always returns empty array. |
| BUG-008 | 🟠 MEDIUM | `backend/public/admin/` | Admin HTML pages served as static files with no server-side authentication. API-level auth works, but HTML is accessible to anyone. |
| BUG-009 | 🟠 MEDIUM | `server.js` | No rate limiting on any endpoint. Brute-force and abuse possible. |
| BUG-010 | 🟠 MEDIUM | `routes/live.js` | `live_sessions.status` is never updated. `GET /api/live/upcoming` could show sessions that have already occurred (relies on `scheduled_at >= NOW()` filter). |
| BUG-012 | ✅ FIXED 2026-11-05 | `public/js/course-details.js` | Course details previously substituted a random live count and had no session list. Count now matches the student's accessible course sessions; past sessions remain listed while replay is pending. |
| BUG-013 | FIXED IN SOURCE 2026-11-06 | `views/pages/code/index.ejs` | Lesson Python file banner could appear while CodeMirror remained empty. CodeMirror boot is now idempotent and the starter remains queued until the editor is available; deploy and verify with an actual lesson file. |
| BUG-011 | ✅ FIXED 2026-11-10 | `server.js` | Removed the temporary public database initialization and admin promotion routes. Production protection takes effect after deployment. |

---

## 4. Database State

**Primary schema file:** `database/schema_postgres.sql`

**Applied migrations (required for full functionality):**
- `add_google_auth.sql` — Adds `google_id` column, makes `password_hash` nullable
- `add_email_verification.sql` — Adds `email_verified`, `verification_token`, `token_expires_at`
- `add_offers_targeting.sql` — Adds `target_classes`, `target_branches` arrays
- `add_offers_features.sql` — Adds `features` JSONB
- `add_feedback_table.sql` — Creates `lesson_feedback` table

**Columns added at runtime (may or may not exist in production DB):**
- `users.debt` — added by `ensureUsersSchema()` on first admin student detail request
- `offers.discount_percentage`, `offers.is_best_seller`, `offers.image_url` — added by `ensureOffersSchema()` on first offer POST
- `transactions.status`, `transactions.payment_method`, `transactions.transaction_code`, `transactions.is_confirmed`, `transactions.processed_at`, `transactions.receipt_url` — added by `ensureTransactionsSchema()` on first deposit

**Tables created at startup:**
- `notifications` — created by the numbered deploy migration

---

## 5. Architecture Issues

1. **Two auth middleware systems** (`auth.js` with Bearer+Cookie, `requireAuth.js` with Cookie only) are used inconsistently across routes.
2. **No versioned migrations** — SQL files are unordered, unreversible, and un-tracked.
3. **No group/cohort concept** — placement quiz classifies students as beginner/advanced but this has no effect on live session access.
4. **No automated tests** — zero test coverage.
5. **Static events** — calendar events are in a `.js` static file, not database-managed.
6. **Duplicate financial tables** — `purchases`, `payments`, `transactions` overlap in purpose.

---

## 6. Environment Variables Required

> **NEVER put real values here.** See `.env.example` for template.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signs/verifies JWT tokens |
| `CLOUDFLARE_ACCOUNT_ID` | R2 endpoint construction |
| `R2_ACCESS_KEY` | R2 credentials |
| `R2_SECRET_KEY` | R2 credentials |
| `R2_BUCKET` | R2 bucket name |
| `ZOOM_ACCOUNT_ID` | Zoom S2S OAuth |
| `ZOOM_CLIENT_ID` | Zoom S2S OAuth |
| `ZOOM_CLIENT_SECRET` | Zoom S2S OAuth |
| `GOOGLE_CLIENT_ID` | Google OAuth client |
| `GEMINI_API_KEY` | Gemini AI for Bugi |
| `RESEND_API_KEY` | Email delivery |
| `APP_URL` | Base URL for email links (e.g., `https://syntaacademy.tn`) |
| `ALLOWED_ORIGINS` | CORS whitelist (comma-separated) |
| `ADMIN_EMAILS` | Comma-separated admin email bypass |
| `PORT` | Server port (default 3000) |
| `NODE_ENV` | `production` or `development` |
| `DB_SSL` | Set to `true` to enable Postgres SSL |
| `SIGNED_URL_EXPIRY` | R2 signed URL lifetime in seconds (default 300) |

---

## 7. Last Verified Milestone

**Date:** 2026-11-05  
**Activity:** Complete codebase audit for documentation purposes  
**Source-reviewed:** Purchase endpoints now enforce authenticated identity; AI debug endpoint now requires a valid cookie JWT. The endpoints were not manually exercised in this session.  
**Not verified against live database:** Actual runtime column existence (debt, offers columns, transaction columns)

### 2026-11-06 — Course Player UX and Loading
- Replays now use the same in-page player area and chapter sidebar as lesson playback; player buttons switch between the live-session list and chapters.
- Lesson playback resumes from the saved position and saves periodically, on pause, and before switching to live sessions. The position route checks enrollment/preview access and preserves completion state.
- While a replay plays, the course sidebar now lists only available replays grouped by month, highlights the active session, and lets the student switch recordings without returning to the course session list.
- Course details now request access status alongside course data, then load live sessions, resources, and progress concurrently. A failed secondary request no longer blocks the other sections.
- Added `min-width: 0` constraints to the course grid and responsive player controls.
- `node --check` passed for `course-details.js`, `courses.js`, and `api-client.js`.
- Production page baseline captured on 2026-11-06: navigation duration 1,333 ms, HTML transfer 11,054 bytes; course API timing 111 ms, access 103 ms, live 83 ms, course resources 80 ms, progress 65 ms. These individual durations are not additive network timings. Lighthouse mobile audit: accessibility 97, best practices 100, SEO 92; CLS 0.096, with heading order, main landmark, and meta description flagged.
- **Not yet verified:** the modified files have not been deployed to production, so browser interaction and after-change performance are pending deployment. The authenticated session was used to inspect production baseline data only.

### 2026-11-06 — Code Pratique Lesson File Handoff
- Reproduced the production symptom using temporary sample code: filename notice rendered but editor value was empty; invoking the starter loader after mount inserted the code.
- Made `boot()` preserve an already-mounted CodeMirror instance, and made Turbo page load consume a queued file only after the active editor is confirmed.
- `loadPracticeStarterFile()` now leaves session storage untouched until the editor exists.
- EJS template compilation and inline JavaScript syntax checks pass. The production fix remains pending Coolify deployment and a live test with an uploaded `.py` resource.

---

## 8. Current Development Priorities

1. **TASK-004 / BUG-004:** Move runtime schema changes to migration files
2. **TASK-003 / BUG-003:** Implement refresh token redemption endpoint
3. **TASK-012 / BUG-006:** Implement password reset flow
4. **TASK-005 / BUG-009:** Add rate limiting

---

## 9. Next Recommended Task

TASK-001 and TASK-002 are complete. Continue with TASK-004 in `IMPLEMENTATION_PLAN.md`.

Admin course management now supports shared chapters, lesson management, and lesson documents. Admin → Sessions supports Zoom scheduling and uploaded recordings. Students see their enrolled courses, course documents, live sessions, and authorized replays. There is still no separate cohort/group entity; live access remains course/offer enrollment based.

---

## 10. Incomplete Work

- TASK-001 and TASK-002 are implemented; automated and manual endpoint verification has not been run in this session.
- Admin chapter/lesson/document and live recording workflows are implemented in source; they have not been manually exercised against production Postgres, Zoom, or R2.
- Direct browser uploads require the production Synta origin in the R2 bucket CORS policy. Upload limits: lesson documents 25 MB; replay videos 1 GB.
- Remaining work is tracked in `IMPLEMENTATION_PLAN.md`; TASK-004 is the next recommended task.

## 11. Course Module Reuse and Deployment Migrations (2026-11-05)

- Added `course_modules`, a many-to-many course/module mapping with per-course ordering. Existing module placements are copied into it by `202611050002_create_course_modules.sql`.
- Course catalog/detail, lesson access, progress tracking, and user stats now read course membership through the join table.
- Added `backend/scripts/migrate.js`; it serializes concurrent runs with a PostgreSQL advisory lock, runs new SQL migrations transactionally, records file checksums in `schema_migrations`, and stops the app launch when a migration fails.
- Docker now expects repository root as build context and `/backend/Dockerfile`; it includes SQL migrations and runs them before starting Express. See `backend/QUICK_DEPLOY.md`.
- `202611050001_create_notifications.sql` replaces notifications DDL previously performed at runtime in `backend/config/db.js`.
- No live database migration was run. On first deploy, the existing Postgres DB must already contain the base schema. Back up before deploying.
- Admin can now create a chapter once and attach it to other courses. Keep legacy `modules.course_id` and `order_index` for compatibility while new reads use `course_modules`.
- Student course pages replace placeholder resources with enrolled-only signed document links; the dashboard lists all enrolled courses and available replays.
- Uploaded replay object keys are stored in existing `live_sessions.replay_url`; students receive expiring signed links. External replay URLs remain supported.
- **Deployment prerequisite:** set R2 CORS for the exact admin site origin before testing browser uploads.
- **BROKEN/RISK:** Other runtime `ALTER TABLE` calls remain, so TASK-004 is still in progress.

---

## 12. Important Files to Inspect

| File | Why |
|------|-----|
| `backend/routes/purchase.js` | Purchase endpoint authorization and transaction behavior |
| `backend/routes/ai-api.js` | AI endpoint behavior and Gemini fallback chain |
| `backend/routes/auth-api.js` | Auth flow, verify logic, magic login |
| `backend/routes/admin-api.js` | Full admin operations, payment confirmation, enrollment |
| `backend/config/db.js` | Shared DB connection pool |
| `database/schema_postgres.sql` | Base schema — always reference before schema changes |
| `backend/middleware/requireAuth.js` | Cookie auth system |
| `backend/middleware/requireAdmin.js` | Admin auth — dual mechanism |
| `backend/utils/zoomClient.js` | Zoom token caching, meeting creation |
| `backend/routes/session.js` | Placement quiz onboarding flow |

## 13. Admin Content and Student Course UX (2026-11-05)

- Admin → Courses now includes a chapter manager: create a chapter, attach an existing shared chapter, reorder it, edit its title, and remove its placement without deleting shared chapter content.
- The chapter manager creates, edits, reorders, and deletes lessons; admins can upload a lesson document (PDF/DOC/DOCX, 25 MB limit) directly to private R2.
- Admin → Sessions includes replay upload after a session (MP4/WebM/MOV, up to 1 GB) or external replay URL. Uploaded object keys use existing `live_sessions.replay_url`; student endpoints convert keys to expiring signed download links and enforce course, offer, and enrollment expiry.
- Student course pages show actual lesson/quiz counts, enrolled-only downloadable lesson documents, live join links, and replays. Student dashboard lists each enrolled course plus recent eligible replays and the student's class/branch.
- Lesson progress totals now exclude quiz items to match the dashboard's separate lesson/quiz counts.
- **R2 prerequisite:** configure bucket CORS to allow `PUT` from the exact production site origin with the `Content-Type` request header; setup details are in `backend/QUICK_DEPLOY.md`.
- **Verification:** JavaScript and embedded admin scripts pass syntax checks. Production database, Zoom, browser interactions, R2 CORS, and actual file uploads remain unverified.

### Student course navigation update (2026-11-05)

- The course page now opens on a **Chapitres** tab and has a separate **Séances en direct** tab.
- Upcoming sessions and past sessions/replays are grouped by calendar month. Each month can be expanded or collapsed; the newest month is open initially.
- Session visibility and replay URLs still come from the existing enrollment-protected API. No database/API changes.
- Course details JavaScript syntax was checked. Browser visual behavior and production session data were not manually verified.

### Offer-targeted student course visibility (2026-11-05)

- The student course catalog and direct course-detail API now show offer-linked courses only when at least one linked active offer matches the student's class and branch targets and is within its validity dates.
- Active enrollments preserve visibility and access even if offer targeting is later edited. Expired enrollments no longer appear in `my-courses`.
- Published courses with no `offer_courses` link remain visible as open formations (for example, AI or web development); existing free-enrollment rules still apply.
- `/api/offers` now filters targeted offers strictly when the student profile lacks class/branch, and excludes offers outside validity dates.
- No database changes. Runtime behavior still needs verification against representative student accounts and offer configurations.

### Chapter drag ordering and interactive quizzes (2026-11-05)

- Admin chapter manager supports drag-and-drop ordering for chapters and for lessons/quiz items within a chapter; existing numeric order controls remain available.
- Admins can create/edit a three-question quiz and choose among multiple choice, true/false, code-word drag and drop, ordering, and matching pairs.
- Student course player supports the five formats, answer feedback, progress through all three questions, result screen, and quiz completion tracking.
- Added `202611050003_add_lesson_quiz_content.sql` for `lessons.content` JSONB; the migration has not been run manually. Coolify applies it on deployment.
- Verification is limited to source/syntax checks; no DB migration, browser interaction, or live student/admin flow was exercised.

### Replay player and lesson/session practice files (2026-11-05)

- Course-page replays now open in an in-page video modal; YouTube and Vimeo links use embeds, while direct recording URLs use the native video player.
- Replay modal can display and download files attached to that live session. Lesson videos can show attached practice files below the player.
- Admin course and session pages can upload multiple Python, HTML, CSS, JavaScript, JSON, TXT, and ZIP files (25 MB each) to private R2 and remove attachments.
- Student file routes enforce lesson/course/session enrollment and return signed URLs with attachment disposition.
- Added migration `202611050004_create_learning_resources.sql` and base schema table. No DB migration was executed manually; Coolify will apply it on deployment.
- JavaScript syntax checks pass. Browser interaction, deployed DB migration, R2 CORS, and actual downloads remain unverified.

### Quiz launch and chapter-list polish (2026-11-05)

- Fixed course chapter clicks so quiz lessons route to the interactive quiz player instead of attempting to open a video URL.
- Reused the already-loaded authenticated lesson payload to avoid fetching the quiz twice.
- Quiz checkpoints now have a compact lavender row, smaller bolt/check icon, and a “Mini-défi · 3 questions” badge, visually separating them from video lessons while keeping them discoverable in sequence.
- JavaScript syntax checked; browser interaction still needs verification after deployment.

### R2 upload error clarity (2026-11-05)

- Lesson and live-session practice-file upload UIs now identify a rejected browser-to-R2 request as an R2/CORS upload failure instead of displaying the unhelpful browser “Failed to fetch” message.
- A successful upload still requires the R2 bucket CORS rule to allow `PUT` from the exact admin page origin and allow the `Content-Type` header. This bucket-side setting cannot be changed from the application code.
- No database changes. Actual upload still needs verification against the configured production bucket.

### Course quiz layout integration (2026-11-05)

- Root cause: the quiz was rendered as a generic `video-modal` without course-page modal layout styles. Its 680px card defaulted to the viewport's left edge, while the fixed dashboard sidebar covered it.
- The quiz overlay now measures `#main-section` and is centered/bounded inside that content area; it recalculates on resize, closes on Escape/backdrop/button, and closes the mobile drawer when launched.
- Added responsive width/height limits and overflow-safe question/options/code/matching controls; no quiz logic or question schema changed.
- JavaScript syntax checks and browser verification at requested viewport sizes are pending.

### Course replay player layout integration (2026-11-05)

- The replay player had the same missing outer modal positioning as the quiz, plus an 1100px panel that could exceed the available space beside the fixed sidebar.
- Replay overlay now measures `#main-section`, centers the player within that area, resizes with the viewport, constrains player height, and closes on Escape/backdrop/button while pausing direct video playback.
- Mobile navigation closes before opening the replay. Playback and attached resource behavior are unchanged.
- JavaScript syntax checked; visual browser verification remains pending because no Synta app session is available locally.

### Show lesson attachments in the student player (2026-11-05)

- Root cause: course lesson rows call `playLesson()` and render into `showVideoInMainArea()`, which previously never requested or rendered `learning_resources`; a separate unused modal path did.
- The active course lesson path now loads the entitled signed resource list and shows all attached files below the lesson content. Lessons with files/documents but no video show a file-only view rather than a video-unavailable error.
- The admin course and session pickers already use `input.multiple = true`; batch uploads remain sequential and now continue after one file fails, refresh the resource list after successful files, and report partial success.
- JavaScript syntax checks pass; actual student/admin browser flows and production resource records remain unverified.

### Multi-offer course editor (2026-11-05)

- The course API and `offer_courses` already supported linking a course to several offers; the old modal used a native multi-select that required Ctrl/Command-click and was easy to miss.
- Replaced it with a searchable checkbox list, selected-offer count, and clear-all action. Existing links are checked when editing; save submits every checked offer ID in the existing `offers_ids` array.
- No database or API changes. Syntax checked; admin browser save/visibility behavior still needs live verification.

### Open lesson Python files in Code Pratique (2026-11-05)

- Lesson resource lists retain a working named download action and add “Ouvrir dans Code Pratique” for Python files.
- The selected file is fetched from its existing signed resource URL and passed to the Code Pratique page through same-origin session storage. The existing Python editor loads it as editable starter code; students choose when to execute it.
- No schema or API changes. Browser flow and R2 CORS behavior need live verification.

### Unify lesson documents and resources (2026-11-06)

- Replaced the separate single-document upload control with the existing multi-file lesson resource flow. New lessons can also upload multiple resources at creation.
- Existing legacy PDF attachments remain visible in the same lesson resource list; students no longer see the oversized standalone “Voir le document” button. PDF resources have compact preview and download actions.
- Expanded the validated resource allowlist to common PDF/Office/ODF documents, slides, spreadsheets, images, text/notes, programming files, and ZIP archives. Each file remains limited to 25 MB and private behind signed R2 links.
- No database migration. Syntax checks pass; admin upload, student downloads, and R2 CORS still need browser verification.

### Lesson resource UX and Python editor loading (2026-11-06)

- Resource rows now use compact aligned download, PDF-preview, and Python-editor icon buttons.
- Python editor loading uses authenticated same-origin endpoints for lessons and live sessions, verifies the matching lesson access or course enrollment, and reads the private R2 object server-side. This avoids browser-to-R2 CORS for editor loading. Files over 1 MB can still be downloaded but are not loaded into the editor.
- No database changes. Browser interaction and deployed API/R2 behavior still need verification.


## 2026-11-12 — Timed offer access

Implemented monthly and academic-year access, independent course grants, installment management, signed checkout quotes, wallet history and expiry reminders. The migration was tested on a disposable production-shaped PostgreSQL schema. Both runtime feature flags default off. Production rollout and live calendar verification are pending separate authorization. Follow [the technical plan](OFFER_ACCESS_TECHNICAL_PLAN.md) for activation and compatible rollback.

## 2026-11-12 — Student course navigation

The catalog cards now use native links. Course details group the description, counts and lesson action above the content tabs. Directs et replays links both player modes, and Google Drive file shares use a preview with an external fallback. Validate playback and permissions with an actual shared recording in staging.

- Course players now discard outdated lesson requests, show video loading and failure states, and request fresh media links on retry. Real-device playback remains a staging check.

- The course catalog reloads when browser Back restores a cached page, preserves existing cards during refresh, and provides a retry state on catalog failures.

- Course quizzes now appear as lightning buttons on the preceding lesson row, with icon-only access for quiz-only chapters.

- Student quiz shows authored titles and corrections and advances independently of response tracking. The admin editor keeps save controls visible and preserves commas inside answer choices.

- Course quizzes run over the mounted lesson with a configurable orange time bar. Legacy quizzes default to 90 seconds. Admins can opt a quiz into free preview. Results lead to the next lesson or the existing offers page.

- The quiz time bar starts at 4% and fills left to right. Authored French and Arabic quiz text uses automatic direction with Inter and Tajawal.

- On desktop the course overview and resources share a sticky right sidebar. On narrower screens the overview appears above the chapters.

- The course overview Resources card lists distinct file formats from course lessons and live sessions the student can access. File links stay with the lesson or replay.

- Course chapter and replay panels override the shared mobile section height so they scroll within the main course page with Resources below.

- Admins can upload or replace a video lesson's MP4/WebM via private R2 upload, or remove its video reference while retaining the lesson and stored objects. Verify a real R2 upload in staging.

- Student dashboard uses fresh authenticated data, actual chapter completion, and course player replay links. Responsive cards wrap long titles and actions.

- Replays and lessons share the course player frame and details card. Drive replays stay embedded with the standalone Drive link removed.

- First-login dashboard now leads to the free session, course previews and targeted offers. Chapter connectors fill using completed lesson counts. Historical external payment dating awaits approval of an additive audit field.

- Academic-year checkout now displays the school year, estimated remaining access, inclusive cutoff, and Tunis timezone. The monthly expiry rule remains as originally approved. Historical payment entry and financial reconciliation are documented for approval.

## 2026-11-12 — Timed offer reconciliation

Implemented inclusive short-month expiry, audited historical external payments, receipt deduplication, external installment reversals and separated financial KPIs. Local validation uses synthetic records. Staging browser tests and provider checks remain required before activation.

## 2026-11-12 — Final timed-offer staging audit

Local loopback Chromium tests exercised the actual student and admin templates at 1280px and 390px against disposable PostgreSQL. The fixture uses synthetic JWTs and disables remote assets. The protected lesson response now explicitly prohibits caching. A real staging R2 bucket, hosted deployment and real-device playback remain unverified. Keep timed sales off for real students.

## 2026-11-12 — Offer upgrades

Implemented locally behind TIMED_OFFER_UPGRADES_ENABLED, which defaults off. Scheduled annual checkout, verified source credit, wallet collection, admin external confirmation and audited credit corrections reuse the existing timed access paths. Disposable database and browser fixtures exercise the upgrade. Production configuration and staging provider checks remain separate.

- Upgrade audit added tampering, stale quote, revoked/reversed credit, forced rollback, cutoff, and accounting checks. Checkout shows remaining access and exact Tunis expiry. Hosted staging still needs a designated URL and synthetic access.

- Offer editor now displays the API validation reason inline, including incompatible timed terms and unavailable migrations.

- The offer calendar accepts a public source URL via Gemini URL Context, and the editor displays consecutive school years as YYYY/YYYY.

- Admin upgrade rules use an expandable source checklist with aligned controls and conditional deadline and partial-payment fields.

- Installment suggestions now display a French recovery message for plain-text gateway failures.

- Student offer cards now show a single checkout action. The scheduled checkout uses a centered responsive dialog and separates credit, due-now amount, and the remaining schedule.

### 2026-11-24 — Focused Zoom recording code audit and local validation

- See ZOOM_RECORDING_AUDIT.md for exact findings and safe activation plan. No application code/schema/production changes. Occurrence UUID is stored but matching uses meeting ID/time; lease ownership is not fenced; queue insertion is not atomic; activation diagnostics can misidentify request failures as missing migration; R2 deletion precedes DB commit.
- Executed zoom-recordings, session-manager and live-multi-audience suites: 29 passed, 0 failed/skipped, disposable PostgreSQL and local Chrome synthetic fixtures (360/390/1440). Zoom/R2 mocked; no live recording or production verification. Disposable PostgreSQL stopped afterward.
- Next: read-only Coolify/schema/webhook evidence; approve focused safeguards and any additive migration before implementation/activation. Existing preview/publish pipeline retained. Production readiness remains BLOCKED.

2026-11-24 final recovery-extension validation: 84 focused tests passed, zero failed/skipped (18.7s), disposable PostgreSQL and mocked Zoom/R2; Chrome 360/390/1440 including no-Zoom local refresh, on-demand discovery and Corbeille restore. Held migration 202611240002 not promoted. Full suite not rerun for extension; previous unrelated offer assertion remains. Disposable server stopped after tests; no deployment/live calls.

### 2026-11-24 — Local deployment commit prepared

- Owner approved promotion of exactly 202611200003_create_zoom_recording_imports.sql, 202611240001_zoom_recording_reliability.sql and 202611240002_recording_trash_retention.sql to database/migrations. SQL contents retained unchanged; startup runner will apply them on the next deployment. Imports flag does NOT disable migrations.
- Refresh-token migration 202611200001 and live-audience migrations 202611200002/202611200004 remain pending. Updated recording regression paths for promoted files; included all recording implementation/runtime/test files. No production access, migration execution, push or deployment.
- Production gate: backup, stop all old backend workers, deploy initially with ZOOM_RECORDING_IMPORT_ENABLED=false, verify schema/replays and then separately activate. Existing real Zoom/R2 validation and the previously documented unrelated offer-card full-suite failure remain outstanding. See ZOOM_RECORDING_IMPLEMENTATION.md.

Release packaging verification 2026-11-24: post-promotion focused suite 84 passed, zero failed/skipped (20.1s), with the actual startup migration runner against disposable PostgreSQL and synthetic Chrome. SQL checksums match the reviewed files; exactly three recording migrations promoted; refresh-token/audience pending files unchanged. Implementation was captured in concurrent local commit f3ad840; final packaging notes follow without rewriting it. No push/deploy/production execution.

### 2026-11-24 — Admin Zoom recording presentation refresh (local)

- Owner reports deployed manual occurrence discovery works. This local follow-up changes presentation only: selectable occurrence cards sorted newest-first, session/topic/date metadata, collapsed UUID details, chronologically numbered segment cards, HH:MM:SS durations, Mo/Go sizes, view types, statuses, summaries and selected-count import/publication actions.
- Byte-based progress uses existing bytes_transferred/file_size; unknown totals render native indeterminate progress. No automatic provider polling or additional per-occurrence Zoom calls. Corbeille is a compact native details section with a count from the existing local endpoint and unchanged restoration/48-hour rules. Manual uploads/external links/previews retained.
- New shared public/admin/js/recording-ui.js is loaded before the manager; manager JS v5/CSS v3. Discovery response forwards available topic/duration/count/size metadata only, uses actual session title as fallback, and reports MP4 format. No schema migration, worker/queue changes, credentials, deployment or push. Session times display in the platform Africa/Tunis timezone.
- Validation: see latest test result below. Synthetic desktop/mobile previews and API/security/concurrency regressions cover safe text, null metadata, occurrence selection, counts, measured/indeterminate progress, publication, retry, uploads and trash restore. Real production UI/provider behavior was not exercised by this task.

Recording UX validation 2026-11-24: final focused suite 86 passed, zero failed/skipped (20.3s), disposable PostgreSQL and mocked Zoom/R2. Synthetic Chrome 360/390/1440 validated occurrence cards, no raw UUID visibility, full-width desktop discovery, safe text, part summaries, selected import counts, progress, compact trash, manual uploads/external links and existing authorization/concurrency. Saved phone/desktop screenshots visually inspected. No production UI/provider testing, push or deployment; no new migration or worker changes. Full project suite not rerun; prior offer-card assertion remains outside this change.
