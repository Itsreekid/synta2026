## 2026-11-25 — Important session-change popup and automatic migration verification

- Added persistent, independent popup acknowledgments to existing reschedule notifications and a responsive, accessible modal with calendar navigation.
- Approved additive 202611250001 migration is now in the automatic deployment directory. Reused ledger/checksum/locking runner; blocked common destructive SQL and sanitized failure logs.
- 56 affected tests passed on disposable PostgreSQL and synthetic Chrome. No production action.

## 2026-11-24 — Refine notification dropdown

- Added compact category icons, cleaner flat rows, French timestamps and responsive panel styling. Simplified reschedule notification copy for existing and new messages.
- Removed visible Tunis timezone annotations across app/admin while preserving timezone calculations. Safe text rendering and read/navigation functionality retained. Two focused regressions pass; browser visual checks pending.

## 2026-11-24 — Fix unnecessary Zoom read dependency during rescheduling

- Rescheduling standalone meetings now uses direct Zoom PATCH; shared recurring meeting schedules remain local. Added safe actionable French errors and structured diagnostics. Five focused mocked regressions pass. No production operation.

## 2026-11-24 — Finish live sessions and edit replay titles

- Added Terminer la séance in existing manager Details, independent of nominal ending time. Completed sessions close platform joins and unlock replay editing immediately.
- Enabled upcoming session metadata editing; future time changes retain the dedicated reschedule workflow. Zoom recordings and manual publication pipeline unchanged. Five focused mocked regressions pass; full integration/browser checks pending.

## 2026-11-24 — Reschedule upcoming sessions

- Added admin reschedule form in the current session popup, Tunis date/time handling, stale-edit protection and deduplicated in-app notifications for eligible students. Existing Zoom meeting identities, recurring dates and replay pipeline preserved.
- Local mocked regression passes; PostgreSQL/browser validation remains blocked by local runner restrictions. No production operation or migration.

## 2026-11-24 — Edit imported replay details and remove finished sessions

- Enabled the existing replay metadata editor for finished Zoom sessions, including multiple associated courses. Preserved recording identity, selected offers and invitations.
- Finished-session removal now hides the session/replay locally without depending on Zoom availability or deleting original video files. No database migration.

## 2026-11-24 — Refine admin Zoom recording UX

- Replaced raw UUID selection with chronological occurrence cards and collapsed technical details. Added shared safe segment rendering, HH:MM:SS duration/size summaries, selection counts and measured/indeterminate progress.
- Made Corbeille compact/collapsible while preserving restore/retention. Existing upload, link, preview, retry and publication actions retained. No schema or import-worker changes, provider polling, push or deployment.

## 2026-11-24 — Prepare Zoom recording deployment commit

- Promoted only the three reviewed recording migrations, preserving SQL bytes/checksums. Updated regression paths and packaged existing runtime/admin recovery/retention implementation.
- Refresh-token and audience migrations remain pending. No push, deployment, production database changes or activation.

## 2026-11-24 — Event-driven recording search and retained Corbeille

- Added Rechercher sur Zoom with automatic exact occurrence lookup, ambiguous selection, safe MP4 metadata and selected import; no provider polling. Actualiser stays local.
- Added minimum 48-hour soft deletion, local restoration and deletion audit history through held additive migration 202611240002. No deployment or production changes.

## 2026-11-24 — Fenced Zoom recording imports and explicit review

- Added durable occurrence associations, per-claim fencing/keys, transactional multi-segment intake and admin review for every new import. Existing published replays and Zoom originals retained.
- Added recoverable deletion intent, completed-transfer reconciliation, safe redirect/DNS handling, expired metadata refresh, accurate readiness diagnostics and exact-UUID selected historical recovery in the existing admin popup.
- New additive migration 202611240001 remains held for review; no production migration, deployment or credential changes. Full-suite results and activation instructions: ZOOM_RECORDING_IMPLEMENTATION.md.

## 2026-11-23 — Restore 90% lesson completion tracking

- Mark native lessons complete at 90%, coalesce repeated saves, retry failures and refresh course/sidebar checkmarks, chapter counts and progress only after success. Reuse existing authorized API; player design unchanged.
- 37 targeted browser/security/player regressions passed, zero failed/skipped. No migration or deployment.

## 2026-11-23 — Video.js mobile-first player replacement

- Replaced hand-maintained controls with pinned self-hosted Video.js 10.6.0, retaining native video identity, progress/resume, quiz flow, resources and provider embeds.
- Added mobile sizing/visibility refinements, library touch gestures and speeds through 1.75×, caption controls and official orientation-controller cleanup. Native controls remain a library-load fallback.
- Versioned vendor assets cache immutably; no build tool, schema, production migration or deployment. Final affected suite: 44 passed, zero failed/skipped. Native fullscreen/physical rotation require device validation because available headless Chrome rejects fullscreen.

## 2026-11-23 — Educational video player and quiz flow

- Added custom native-video controls, click-to-play fallback, paused next lessons and local replay resume while preserving Drive embeds and page layouts.
- Linked quizzes open at native lesson end; correct answers advance after feedback, incorrect answers wait for Continue. Timer cleanup prevents duplicate navigation.
- 39 affected security/API/browser regressions passed with disposable PostgreSQL and 1440/390/360px Chrome checks. No deployment or migration.

## 2026-11-22 — Course copy and clearer offer selection

- Added reviewed draft-course settings copy, class/branch badges in linked offers, and existing-offer dropdown filtering with audience labels. Chapters remain explicitly outside the copy and can be reused through the chapter manager.
- 35 targeted security/browser tests passed, including same-name offers and desktop/mobile copy saves. No deployment.

## 2026-11-22 — Simplify admin Courses and Offers management

- Added persistent class/branch/search/status filters, course offer/category selection, counts, reset and clear audience labels within existing pages. No student-access or database changes.
- Verified actual desktop/mobile admin navigation, filters and retained actions; 36 targeted tests passed. No deployment.

## 2026-11-22 — Remove thumbnail proxy bottleneck

- Supersedes buffered thumbnail delivery with direct R2 signed downloads. Cache image responses and redirects for 23 hours within a 24-hour image-only signature. Keep protected-media expiry unchanged. 35 targeted tests passed, including Chrome cache reuse. Live R2 latency not measured; no deployment.

## 2026-11-22 — Course thumbnail browser caching

- Serve course thumbnails at stable authenticated URLs with private 24-hour caching and ETags instead of expiring R2 redirects. Verified repeat desktop/mobile navigation avoids a second R2 read; 34 relevant tests passed. No deployment.

## 2026-11-22 — 14-day inactivity policy

- Revised normal session renewal from 48 hours to 14 days at owner request. Existing 30-day cap and revocation remain. All 35 targeted authentication tests passed locally; no deployment.

## 2026-11-22 — Session renewal reliability

- Normal renewal uses a 48-hour inactivity window; preserve the 30-day cap and short admin impersonation sessions.
- Clear stale Turbo expiry countdowns and diagnose missing renewal storage. Added real HTTP/PostgreSQL and browser tests. Production migration/deployment remain unapproved.

## 2026-11-22 — Orange annual subscription badge

- Matched the annual badge to the monthly style in orange, with school year and configured inclusive access cutoff. Badge-only change verified on desktop/mobile.

## 2026-11-22 — Consolidate monthly offer badge

- One blue monthly subscription badge combines access duration and manual renewal, replacing the duplicate notice. Desktop/mobile verified; no checkout or pricing changes.

## 2026-11-22 — Remove local video compression

- Removed the local compression tools, jobs and temporary outputs at the owner’s request. Original recording preserved and checksum-verified; media folder remains excluded from Git/Docker. No production changes.

## 2026-11-22 — Limit dashboard replay list

- Show only the most recent accessible replay on the dashboard instead of five; retain all replays within courses. Verified renderer and unchanged empty/error states. No deployment.

## 2026-11-22 — Show locked historical replays

- Show course-wide historical replay metadata to catalogue viewers instead of hiding the Replays tab when unenrolled. Paid playback and files remain protected; individually restricted sessions are excluded. Full suite: 88 passing; desktop/mobile checked. No migration or deployment.

## 2026-11-22 — Add dated historical replays

- Add old Drive or uploaded recordings with original Tunis dates, course association and teaching files, without scheduling Zoom. Reuses protected replay/resource APIs, adds retry identity and responsive popup. Full suite: 88 passing; final browser checks passed. No schema changes or deployment.

## 2026-11-22 — Lesson preview switch

- Added a simple free/paid switch per lesson using existing preview permissions and admin API, with immediate save and failure recovery. Browser checks passed at desktop/mobile widths. No database changes or deployment.

## 2026-11-21 — Compact session actions and plain course previews

- Course cards strip Markdown into normalized plain text, clamp to three lines and reserve consistent description heights. Complete safe formatting remains on details.
- Added gear/green host/red delete icons to admin session cards, including completed sessions. Existing cancellation protects source files and removes student session access after confirmation.
- Full regression: 86 passed, no failures/skips; mobile and desktop browser checks passed. No deployment.

## 2026-11-21 — Safe course description formatting

- Render bold, italic, paragraphs and lists using an attribute-free sanitized Markdown subset; preserve original descriptions and plain-text compatibility.
- Added short course-card previews, complete course-details formatting and admin field guidance. Desktop/mobile and XSS regression checks pass; full suite: 86 passed, no failures/skips.

# CHANGELOG.md — Synta Academy

## 2026-11-21 — Admin live-session management

- Added a responsive session management dialog with Replays, Ressources and Détails tabs, retaining existing recording and upload APIs.
- Added replay replacement confirmation, source visibility, private admin previews, file downloads and accessible dialog behavior.
- Fixed old Zoom segments being attached after manual replay replacement. All 84 local regression tests passed.

## 2026-11-21 — Multiple audiences for live sessions

- Implemented searchable course/offer selections and individual session invitations with server-side OR authorization and legacy compatibility.
- Added session replay/file access through the Calendar for invited students, without enrolling them in paid courses.
- Validated pending migrations and 82 automated tests using disposable local PostgreSQL and synthetic external services. Production activation remains held.

## 2026-11-20 — Drive replay frame

- Fixed viewport-sized iframe minimum height cropping embedded replays and added Drive media permissions.

## 2026-11-20 — Student desktop calendar

- Added a seven-day desktop timetable with hourly lines and overlap placement while preserving the mobile day view.

## 2026-11-20 — Contact navigation

- Removed the empty standalone Contact page and its student navigation entry. Contact links now target the public footer’s social links, and previous URLs redirect there.

## 2026-11-20 — Mon Portefeuille redesign (uncommitted)

- Transactions show as a table on wide panels and as cards on phones and narrow layouts, with no sideways scrolling. The add button moved into the history header.
- Achats d’offres: one card per purchase with a status badge. The installment button is 44px tall.
- Accounts sit beside the content from 1200px, with the D17 QR code beside its details.
- The deposit popup is styled with classes, closes with Escape, shows validation errors inline and is a bottom sheet on phones. Its request and the installment payment are unchanged.

## 2026-11-20 — Cours pages redesign (uncommitted)

- Course list: compact cards on phones and a grid on larger screens, "Mes cours" and "Découvrir" groups, progress on each card, and the course initial when there is no thumbnail. The banner no longer overlaps the mascot.
- Course page: numbered chapters with lesson counts and progress, a readable category name, and a sticky course card on wide screens. The inline styles moved to `course-details.css`.
- Lesson and replay players: the title, a clear "Terminer & suivante" button and the files sit in one card under the video. The current lesson is highlighted in the chapter list. Fixed the stretched replay title.
- Quiz popup: the timer line stays at the top, joined by a countdown that turns red in the last 15 seconds, step progress, A/B/C/D answers with right and wrong marking, a fixed check button, and a score ring. It opens as a bottom sheet on phones.
- Phone pages no longer stretch inner sections to full screen height.

## 2026-11-20 — Calendar responsive layout (uncommitted)

- Phones show a week strip with distinct day labels and the selected day's sessions, instead of three stacked week buttons and a clipped week.
- Tablets, older square screens and desktops show the whole week as rows, so session titles stay on one line.
- Opening a date from a link highlights that day, and changing weeks keeps the same weekday selected.

## 2026-11-20 — Dashboard responsive redesign (uncommitted)

- Fixed the mobile dashboard rendering 815px wide and cut off. It is now one clean column on phones, a balanced two-column grid on tablets and older 4:3 or 1:1 screens, and two independent columns on wide desktops.
- All content kept. Larger tap targets, lighter replay buttons, no hover jumping, a scrollable chapter stepper centered on the current chapter, and styled empty states.
- App pages now fill the screen exactly on phones (`100dvh`, no 10px gap under the 60px phone header), including Code Pratique.

## 2026-11-20 — Live sessions: multiple offers, individual access, automatic Zoom replays (uncommitted; migrations held)

- A live session can accept several offers, and the admin can invite individual students without a purchase. Until held migration `202611200002` is applied, access stays exactly as before.
- Students no longer receive the Zoom link in page data. « Rejoindre » opens `/api/live/:id/join`, which checks access and the join window (10 minutes before the start until the scheduled end) on the server.
- Zoom cloud recordings are imported automatically into private R2 after `recording.completed`:
  - A single segment is published straight away.
  - Several segments wait for the admin, who chooses what to publish (shown as « Partie 1 », « Partie 2 ») and can delete unwanted segments from R2.
  - Failures retry automatically or with « Réessayer », and imports resume after a restart.
  - Zoom recordings are never deleted.
  - This needs held migration `202611200003` and `ZOOM_RECORDING_IMPORT_ENABLED=true`.
- The replay player fetches a fresh private link automatically when one expires.
- Verified with fake Zoom and fake R2 on disposable PostgreSQL 17.6: 71/71 unit and database tests, 20/20 API end-to-end checks, 19/19 browser checks at 360, 390 and 1440 px, plus restart recovery.

## 2026-11-20 — Launch fixes (feature freeze)

- Wallet history lists each money movement once; course and offer purchases are no longer repeated from enrollments.
- Removed three publicly downloadable scratch files, including an old events file containing past Zoom links.
- The admin payments page shows older « approved » deposits as « Confirmé » instead of « Rejeté ».
- Hid the synthetic XP, levels and badges on the dashboard and profile. The course page now labels its counter « Replays » and no longer shows a hard-coded language.
- Verified the launch flow end to end on a disposable PostgreSQL 17 database (36/36): registration, offers with several courses, chapters, video replays and quizzes, wallet purchase, targeted Zoom sessions on the Dashboard and Calendar, and admin–student sync.

## 2026-11-20 — Automatic session renewal (Batch 2B)

- Students stay signed in while they keep using Synta. The session ends after 7 days without a visit, and always 30 days after signing in. An expired access token is renewed on the next page or API request, with no dialog or reload.
- Refresh tokens are now random values stored only as SHA-256 hashes in the new `refresh_tokens` table, and each one works once. Reusing an old token ends every session from that sign-in; logout revokes the session on the server.
- Session cookies use `SameSite=Lax`, so links from WhatsApp or email keep students signed in.
- Refresh tokens from before this release are accepted once and converted, so the release logs nobody out. Admin "log in as student" sessions do not renew.
- New migration held in `database/pending-migrations/202611200001_create_refresh_tokens.sql` (additive) so deployments cannot apply it. Renewal activates only after the owner moves it into `database/migrations/`; until then, sign-in works as before with one-hour sessions.

## 2026-11-20 — Session expiry and recovery (Batch 2A)

- Students whose session has ended are sent to `/login?next=<page>` with a French notice and return to that page after logging in with email, Google popup, or Google on iPhone/iPad. Destinations are limited to `/dashboard` and `/app/...`.
- While studying, an expired session opens one « Session expirée » dialog instead of silently failing or redirecting. A banner warns 5 minutes before the end. Lesson-progress and quiz-answer saves that failed are replayed once after re-login.
- `/login` and `requireAuth` now share one token check, so they can never redirect a student back and forth. Old login redirects in the catalog, offers and wallet no longer pull the student off the page.
- Unchanged: token lifetimes, cookie flags and signing. Session renewal is still pending approval (roadmap P0-4).

## 2026-11-20 — Student experience audit and quick wins

- Audit: added `docs/SYNTA_PLATFORM_AUDIT.md` and `docs/STUDENT_UX_ROADMAP.md`.
- Live sessions stay listed on the dashboard and calendar until their scheduled duration ends. Students can join 10 minutes before the start. The calendar fully reloads under Turbo, uses `duration_minutes`, and shows French countdown and status text.
- Students can no longer change their class or section. Profile saves validate the Tunisian phone, keep it when the field is empty, and show the server's error message.
- Catalog chips use the stored categories. A search or filter with no results offers to clear the filters, and finished courses show « Terminé ». Cards fit 360 px phones.
- Quizzes can be closed with a button or Escape. Offers with insufficient balance link to the wallet, and the stray CSS brace hiding the price layout is fixed.
- Lighter images: a 6 KB favicon, a 6 KB sidebar logo, the WebP offer fallback (was a 22 MB GIF) and the WebP slogan.
- The sidebar has Profile and Contact entries, marks the active page with `aria-current`, and scrolls on short screens.

## 2026-11-14 — Student path cleanup

- Removed the lesson-feedback button and API. Progress is now saved only for lessons the student can access.
- Removed the broken wallet action button, the fake contact-form success, the offers confetti download, and the unused Code Pratique Web editor scripts.

## 2026-11-14 — Project-wide bug fixes

- Security: deposit receipts accept only verified raster images and the admin receipt viewer refuses scriptable content; refresh and magic-link tokens can no longer act as a session; the profile bootstrap script and placement quiz, wallet history and lesson descriptions are escaped.
- Stability: environment variables load before the database pool, Resend is created lazily, migration checksums ignore CRLF/LF differences, async admin handlers no longer crash the process, invalid debt amounts are rejected and client errors return 4xx.
- Enrollment: students whose permanent course enrollment expired can buy or enroll in the course again.
- Frontend: pages with top-level script state fully reload under Turbo, and broken links, missing helpers, the calendar course title, admin login denial and Skulpt load failures are fixed.

## 2026-11-14 — Project-wide bug audit fixes

- Security: deposit receipts accept only verified raster images, and the admin receipt viewer serves them with nosniff/sandbox headers. Refresh and magic-link JWTs are no longer accepted as sessions. The injected profile script is JSON-encoded. The placement quiz and wallet history escape text.
- Stability: environment variables load before the database config, email and migrate start without import-time crashes, admin question routes and transaction routes no longer crash the process on database errors, and malformed or oversized JSON returns 400 or 413.
- Correctness: debt payments reject non-numeric amounts, Turbo navigation no longer breaks page scripts, event targeting reads class and branch from the database, migration checksums ignore line endings, and several broken links, missing helpers and stuck buttons are fixed.

## 2026-11-12 — Restore original student offer styling

- Restored the original card appearance while retaining responsive widths and full feature lists.

## 2026-11-12 — Clearer subscription terms on student offer cards

- Added distinct monthly, academic-year and legacy badges, plus annual cutoff and installment information and manual monthly renewal copy.

## 2026-11-12 — Student offer cards

- Refined offer cards and removed nested feature scrolling. Added responsive browser coverage for card content, bilingual text and purchase states.

## 2026-11-11 — Manage course thumbnails in the admin editor

- Added offer image reuse, recent R2 images, uploads and removal. Refined the admin toolbar, Live Sessions heading and offer dialog.

## 2026-11-11 — Secure placement rendering and thumbnails

- Rendered placement values as text and restricted course thumbnail assignment to supported image URLs.

## 2026-11-11 — Admin offer activation and safe text rendering

- Added an activation switch in Offers, corrected the active-offer KPI, and secured student and payment display values.

## 2026-11-11 — Modernize the admin dashboard

- Added a shared admin visual style, responsive table and modal layouts, and keyboard controls for navigation and payment details.

## 2026-11-11 — Isolate deep learning analysis

- Added on-demand student learning analysis with a dedicated Gemini credential and independent quota backoff.

## 2026-11-11 — Prevent Bugi history from returning after a clear

- Added per-account history revisions so replies generated before a cross-device clear cannot restore the transcript or learning evidence.

## 2026-11-11 — Add Bugi learning profiles

- Bugi uses evidence of student work to adapt hints, track progress and preserve explicit preferences. Clearing history also removes its learning evidence.

## 2026-11-11 — Save Bugi conversations across devices

- Added account-scoped transcript history and deletion. Recurring topics help Bugi tailor hints without a separate Gemini request.

## 2026-11-11 — Redesign Bugi chat

- Bugi now opens in a responsive Messenger-style popup with message bubbles, minimize, and an unread indicator.

## 2026-11-11 — Reduce Bugi API usage

- Prefer Flash-Lite, limit answer tokens, reuse identical requests and pause when Gemini reports a quota limit.

## 2026-11-11 — Make Bugi more direct

- Bugi gives shorter Tunisian Darja hints, answers follow-up questions and adapts to available academic context. Python snippets render in separate code blocks.

## 2026-11-11 — Improve Python workspace readability

- Enlarged code and console text and matched the login code window's font and colors. On phones, completed Python runs open the console from the editor.

## 2026-11-11 — Restyle Code Pratique

- Brought the login page's navy code-window design to the student editor, console and variables panels, with clearer syntax highlighting, controls and empty-state text.

## 2026-11-11 — Give the navbar logo breathing room

- Centered the logo with responsive height limits and consistent vertical padding.

## 2026-11-11 — Unify the mobile homepage menu

- Navigation and account buttons now open and close inside one scrollable panel with coordinated motion, replacing the separate moving/fixed sections.

## 2026-11-11 — Correct homepage footer alignment

- Aligned the contact heading and social icons, tightened desktop column spacing and improved footer grouping on phones and tablets.

## 2026-11-11 — Refine homepage layout and mobile navigation

- Kept the existing copy, images and hero concept while improving card alignment, spacing, button contrast, responsive grids and focus states.
- Fixed mobile menu scroll restoration and added Escape handling, closed-menu focus exclusion and viewport reset behavior.

## 2026-11-11 — Optimize homepage assets and caching

- Switched homepage image references to existing WebP assets, preserving the animated course artwork and originals. Reduced the aggregate referenced image payload by 97.23% and added a correctly sized favicon.
- Prioritized the hero image and added content-versioned asset caching plus Brotli/gzip delivery for public homepage text files.
- Preserved the homepage stylesheet, text, elements and interaction scripts. Fifteen tests pass; live browser performance measurement is pending.

## 2026-11-11 — Match verification email to registration design

- Restyled the French confirmation email to match the signup screen using the official logo, centered layout, navy headings, envelope badge and orange confirmation action.
- Added a plain-text alternative and email-client-compatible layout. Payload checks and existing regressions pass.

## 2026-11-11 — Restore academy branding on auth pages

- Replaced the invented auth mark with official academy logo assets and restored the site's navy, orange, cyan and Tajawal styling across the shared French auth layouts.

## 2026-11-10 — Fix startup with legacy payments schema

- Added a compatibility migration for the documented payments.status column before the active-offer index. Production logs confirmed the missing column stopped deployment before the app could start.

## 2026-11-10 — French login and registration redesign

- Added a shared responsive auth layout, two-step signup, school and independent learner choices, inline validation and reduced-motion transitions.
- Translated Google onboarding, verification pages and emails. Removed unused third-party auth assets and replaced the unavailable password recovery form with support guidance.
- Fixed resend-button cooldown handling. Regression, template rendering and syntax checks pass; browser visual verification remains pending.

## 2026-11-10 — Critical placement, payment and Zoom remediation

- Required email confirmation before placement quiz access and single-use account activation. Removed existing-account password replacement, linked registrations, and added authentication rate limits.
- Closed unverified paid enrollment and prevented client-defined wallet transaction status/type. Wallet checkout records paid access and serializes offer retries.
- Added durable independent offer grants, a partial unique index, and shared live authorization for overlapping offers.
- Preserved recurring Zoom meetings when cancelling one date, added explicit series cancellation, retained cancelled records and surfaced provider failures.
- Added automated security regression coverage. Real PostgreSQL, email and Zoom validation remain staging tasks.

> **Format:** Reverse chronological. Each entry includes date, type, description, and agent/author.  
> **Types:** SECURITY | SCHEMA | FEATURE | BUGFIX | ARCHITECTURE | BUSINESS_RULE | BREAKING

---

## 2026-11-10 — Google sign-in and public admin route removal

- Replaced the custom Google overlay with Google's button and unified client configuration. Validated redirect CSRF and added a Coolify migration for the existing Google account schema.
- Removed public maintenance routes for database initialization and role promotion.

## 2026-11-10 — Individual and group live sessions

**Author:** Codex

**Type:** FEATURE / SCHEMA

- Admins can select one or more enrolled students when scheduling a session. Session lists, calendars, replays, and resources respect the audience.
- The production Docker migration runner adds the session audience column before startup.

## 2026-11-06 — Preserve Lesson Files During Code Pratique Startup

**Author:** Codex  
**Type:** BUGFIX

- Reproduced the live issue with a temporary sample Python file: the loaded-file banner appeared while CodeMirror stayed empty; applying the queued file after editor initialization populated it.
- Made CodeMirror boot idempotent so a repeated page initialization does not recreate the editor and erase the loaded source.
- Keep the pending `sessionStorage` file until the editor exists, and consume it on Turbo page load when the editor is already mounted.
- EJS and inline JavaScript compile checks pass. Fix is in source and requires deployment for live verification.

## 2026-11-06 — Improve Code Pratique Workspace UX

**Author:** Codex  
**Type:** UX / BUGFIX

- Reworked the Code Pratique workspace into responsive editor, console, variables, and preview panels, with mobile panel tabs and tablet layouts.
- Added keyboard focus styling, clearer French empty states and run feedback, and persisted Python/HTML/CSS/JavaScript drafts locally.
- Kept the Python/Web execution engines and existing course-file handoff; loaded lesson files now update the editor filename and saved Python draft.
- Browser verification at the requested viewport sizes remains pending; the source has not been deployed.

## 2026-11-06 — Compact Code Pratique Mobile Controls

**Author:** Codex  
**Type:** UX

- Kept the four workspace tabs on one row on phones, using icons with accessible names and tooltips; the narrowest phones hide the redundant visible tab words.
- Changed mobile Run and Export controls to compact icon buttons with accessible names and tooltips, giving the editor footer more room.
- Hid the redundant subtitle and Python-ready words on very narrow screens while retaining the status indicator.
- Existing lesson resource actions already use accessible icon-only controls for download, preview, and opening Python files in Code Pratique.

## 2026-11-06 — Compact Desktop Controls and Defer Web Mode

**Author:** Codex  
**Type:** UX / PRODUCT_DECISION

- Run and Export now use accessible icon-only buttons on desktop as well as mobile.
- Moved the green editor-ready dot beside the Code Pratique title and removed visible “Python prêt” status text.
- Hid the Python/Web mode selector and stopped automatically running a Web preview during startup. Python remains active; existing HTML/CSS/JavaScript implementation and drafts are retained.
- Recorded the user's decision to defer Web mode until the core student site is stable in `AGENTS.md` for future agent handoffs.

## 2026-11-06 — Give the Python Editor More Workspace

**Author:** Codex  
**Type:** UX

- Increased the Python editor's desktop share and minimum widths for the console and variables panels; raised code and console text sizing slightly.
- Kept tablet layout as a full-width editor above the output panels.
- Documented that “Aperçu” is the deferred Web iframe preview and is expected to be empty until Web mode is resumed and a Web snippet is run.

## 2026-11-06 — Harden Code Pratique Pyodide Fallback

**Author:** Auto  
**Type:** FEATURE

- Continued the Skulpt/Pyodide split: simple snippets stay on Skulpt; imports and `match/case` route to the sandboxed Pyodide runner.
- Hardened iframe startup (shared load promise), first-load messaging, variable cards, and Skulpt-aligned success/error/Bugi feedback.
- Pyodide still loads packages on demand via `loadPackagesFromImports()`; `input()` uses the browser prompt inside the sandbox.
- Browser verification of a live NumPy + `match/case` run remains pending.

## 2026-11-06 — Record School-Compatible Python Requirement

**Author:** Codex  
**Type:** PRODUCT_REQUIREMENT

- Added a lazy Pyodide sandbox fallback for code containing imports or `match/case`; basic snippets remain on Skulpt.
- Pyodide loads imported packages on demand, captures output/errors, and reports user variables. `input()` uses the browser's native prompt in this fallback.
- Preserved the existing Skulpt input modal and course-file flow. Static EJS/JavaScript checks pass; browser execution of the supplied example remains pending.
- Known limitation: advanced code currently executes on the iframe's main thread; long synchronous loops need a worker solution that preserves `input()`.

## 2026-11-06 — Fill the Mobile Code Editor and Hide Web Preview

**Author:** Codex  
**Type:** UX

- Removed the “Aperçu” mobile tab while the Web workspace is deferred.
- Changed the mobile Code Pratique layout to use the available viewport height; the active editor, console, or variables panel now expands below the header and three panel tabs instead of stopping at a fixed height.
- Recorded that the preview tab returns only when Web mode is resumed.

## 2026-11-06 — Align Course/Replay Player and Parallelize Course Loading

**Author:** Codex  
**Type:** UX / PERFORMANCE

- Replaced the replay overlay with the same in-page course player area and chapter sidebar used by lesson playback.
- During replay playback, the sidebar now lists available replays grouped by month, marks the selected session, and switches recordings directly in the player.
- Added a player-level switch from lessons to live sessions and from a replay back to chapters. Lesson switching saves the current playback position first.
- Fixed the player-position API mismatch by adding authenticated `POST /api/tracking/position`; it checks active enrollment or preview access and preserves completion state while updating `last_position`.
- Parallelized the independent course access, live-session, resource, and progress requests to remove the serial request waterfall.
- Added minimum-width constraints to the course grid and responsive player controls.
- JavaScript syntax checks passed. Production baseline was measured, but the local changes cannot be measured in the hosted browser until deployed; authenticated production clicks were not used to verify these local edits.

## 2026-11-05 — Show Course Live Sessions and Replays

**Author:** Codex
**Type:** FEATURE

- Removed the random live count from course details and derive the count from sessions the enrolled student can access.
- Added an authenticated course-session endpoint with course and offer enrollment checks. Completed sessions stay visible while the replay is pending.
- Added a course page section for upcoming sessions, active Zoom links, and replays. Host links remain excluded.
- Added an admin control to add, update, or clear a replay URL after teaching.
- No database changes or migrations. Source reviewed; UI/API was not manually exercised in this session.

## 2026-11-05 — Separate Course Chapters and Live Sessions

**Author:** Codex
**Type:** FEATURE

- Reorganized the student course page into separate **Chapitres** and **Séances en direct** tabs; chapters remain the initial view.
- Grouped upcoming live sessions and past recordings by calendar month with collapsible month sections.
- Kept existing enrollment and offer checks for session/replay visibility; no schema or API changes.
- Verified the course details JavaScript syntax. Browser rendering and live data were not manually tested.

## 2026-11-05 — Filter Student Courses by Offer Target

**Author:** Codex
**Type:** FEATURE

- The course catalog and course-detail API now filter offer-linked courses against the student's class and branch and the offer's active validity window.
- Students with an active enrollment retain visibility; expired enrollments are excluded from the student course list.
- Published courses with no offer association remain discoverable as open formations.
- Offer listing now requires profile values to match any configured class/branch targets and honors validity dates.
- No schema changes. API syntax was checked; database and representative-account behavior were not manually exercised.

## 2026-11-05 — Add Chapter Ordering and Interactive Quizzes

**Author:** Codex
**Type:** FEATURE / SCHEMA

- Added drag-and-drop ordering for course chapters and for lessons/quiz checkpoints within a chapter; numeric ordering remains available.
- Added an admin quiz builder for exactly three questions with five styles: QCM, true/false, drag a word into code, reorder steps, and matching pairs.
- Added the student mini-quiz experience with interactive controls, feedback, score, and lesson completion tracking.
- Added `lessons.content` JSONB in migration `202611050003_add_lesson_quiz_content.sql` and the base schema reference. Migration was not executed manually.
- Syntax/source checks only; database and browser workflows remain unverified.

## 2026-11-05 — Play Replays In-Page and Attach Practice Files

**Author:** Codex
**Type:** FEATURE / SCHEMA

- Session replays open in a course-page player modal; direct videos play natively and YouTube/Vimeo URLs use embedded players.
- Added a private R2 resource flow for multiple Python, HTML, CSS, JavaScript, JSON, TXT, and ZIP files on a lesson or live session (25 MB per file).
- Admins can upload/remove attachments from lesson and session management. Entitled students see lesson files below the video and session files inside the replay player.
- Signed downloads use attachment disposition to download source files instead of rendering executable HTML in the browser.
- Added `learning_resources` to the base schema and migration `202611050004_create_learning_resources.sql`; not executed manually.
- Syntax checks passed; database/R2/browser flows remain unverified.

## 2026-11-05 — Fix Quiz Launch and Distinguish Checkpoints

**Author:** Codex  
**Type:** BUGFIX / UX

- Chapter-list clicks now inspect the lesson type and open quiz checkpoints in the interactive quiz player instead of the video player.
- Reuse the loaded lesson content so opening a quiz does not make a duplicate content request.
- Styled quiz items as compact checkpoint rows with a distinct bolt icon and “Mini-défi · 3 questions” badge.
- No database or migration changes.

## 2026-11-05 — Explain R2 Practice-File Upload Failures

**Author:** Codex  
**Type:** BUGFIX / UX

- Lesson and session admin upload flows now catch browser network/CORS errors from the direct R2 `PUT` and show a French message naming the required bucket CORS settings.
- Deployment guidance now calls out exact origin matching, including protocol and `www`.
- This improves diagnosis; it cannot replace enabling CORS on the Cloudflare R2 bucket.

## 2026-11-05 — Keep Course Quiz Inside the Learning Area

**Author:** Codex  
**Type:** BUGFIX / UX

- Added a quiz-specific modal layout bounded to the live `#main-section` rectangle, so the card centers in the available learning area after the dashboard sidebar.
- The modal responds to window resizing, closes the mobile drawer before opening, and has Escape/backdrop/close-button behavior.
- Added responsive max dimensions and overflow wrapping for long questions, code, and answers; quiz interactions and content remain unchanged.

## 2026-11-05 — Keep Replay Player Inside the Learning Area

**Author:** Codex  
**Type:** BUGFIX / UX

- Replay overlays now use the measured course `#main-section` bounds, keeping the player centered within the area beside the dashboard sidebar.
- The player panel and video height adapt to the available viewport; the overlay updates on resize and closes on Escape, backdrop, or close button.
- Direct video playback pauses when the replay is closed. Attached resource links and YouTube/Vimeo playback remain unchanged.

## 2026-11-05 — Show Lesson Files and Support Multi-File Batches

**Author:** Codex  
**Type:** BUGFIX / FEATURE

- Connected the student course page's actual lesson player to the authenticated lesson-resource endpoint; every attached practice file now appears below the lesson content.
- Lessons with practice files or a document but no video render a file-only lesson view instead of a video-unavailable error.
- Lesson and live-session upload pickers accept multiple files in one selection; batch processing continues after an individual file fails and reports partial success while refreshing the admin list.

## 2026-11-05 — Make Course Offer Linking Easier

**Author:** Codex  
**Type:** UX / FEATURE

- Replaced the Ctrl-click native offer multi-select with a searchable checkbox list inside the course create/edit modal.
- Editing a course preselects all existing offers; saving submits all checked IDs through the existing `offers_ids` array and `offer_courses` relationship.
- Added a selected count and clear-all control. No database or API changes.

---

## 2026-11-05 — Add Automatic Deploy Migrations and Reusable Course Modules

**Author:** Codex
**Type:** SCHEMA / ARCHITECTURE

- Added a checksum-tracked, advisory-lock protected migration runner; Docker runs it before the application on container startup.
- Added migrations for the notifications table and the `course_modules` many-to-many mapping, with data backfill from legacy module course fields.
- Updated course listing/details, content access, progress calculations, and user stats to read course/module membership from `course_modules`.
- Added Coolify build context and Dockerfile instructions. Requires repository root as build context and existing base Postgres schema; no live database migration was run.
- Admin course/module assignment UI is still needed to operationally reuse chapters.

---

## 2026-11-05 — Complete Course Content and Replay Workflows

**Author:** Codex
**Type:** FEATURE / ARCHITECTURE

- Added admin chapter management to create chapters, reuse them across courses, reorder placements, edit chapter titles, and remove a chapter from one course without deleting shared content.
- Added lesson creation/deletion and direct R2 PDF/Word uploads; enrolled students now see real course documents instead of placeholder resource cards.
- Added direct R2 upload for Zoom session recordings and signed replay URLs for enrolled students. Expired or unrelated offer enrollments do not unlock replays.
- Student dashboard now shows every enrolled course and recent available replays, with class/branch context.
- Course lesson and quiz counters are based on real mapped content, and lesson completion progress excludes quiz items.
- Fixed a duplicate global enrollment function declaration that prevented the course details script from parsing.
- R2 bucket CORS must allow PUT from the deployed site origin; see `backend/QUICK_DEPLOY.md`.
- No new database columns or tables. Source syntax checks are being performed; no live DB, Zoom, or R2 upload was exercised here.

---

## 2026-11-05 — Secure Purchase and AI Debug Endpoints

**Author:** Codex  
**Type:** SECURITY

- Protected course and offer purchase endpoints with `authApiMiddleware`; the authenticated JWT identity is now used for balance, transaction, and enrollment operations.
- Removed `userId` from all browser purchase request bodies and ensured the course details caller sends the session cookie.
- Protected `POST /api/ai/debug` with `authApiMiddleware`.
- Updated architecture, business rules, implementation status, and handoff docs. Rate limiting remains in TASK-005.
- Verification: source and diff reviewed. Automated/manual endpoint tests were not run.

---

## 2026-11-05 — Engineering Documentation Audit

**Author:** AI Documentation Audit (Antigravity)  
**Type:** ARCHITECTURE

### Added
- `ARCHITECTURE.md` — Full system architecture documentation covering stack, routes, middleware, auth, integrations, and known issues
- `DATABASE_SCHEMA.md` — Complete database schema reference with all tables, columns, constraints, indexes, and migration file inventory
- `BUSINESS_RULES.md` — Business logic documentation with IMPLEMENTED/PARTIAL/NOT IMPLEMENTED/NEEDS CLARIFICATION status for all rules
- `IMPLEMENTATION_PLAN.md` — Prioritized development roadmap with 23 tasks across 8 phases
- `AGENTS.md` (overwritten) — Permanent AI agent instructions replacing the previous skeleton AGENTS.md with comprehensive rules, security guidelines, and project map
- `CURRENT_STATE.md` — Initial handoff document documenting working features, known bugs, and next recommended actions
- `CHANGELOG.md` — This file

### Findings Documented

**Critical Security Issues Discovered:**
- `POST /api/purchase/course` and `POST /api/purchase/offer` accept `userId` from request body with no JWT authentication — user impersonation possible (BUG-001)
- `POST /api/ai/debug` has no authentication — open to public abuse (BUG-002)
- Refresh tokens issued but never consumed — 1-hour login window (BUG-003)

**Architecture Issues Documented:**
- Runtime `ALTER TABLE` calls in route files causing unversioned schema drift (BUG-004)
- Two inconsistent authentication middleware systems
- No versioned migration system
- No automated test coverage
- `zoom_start_url` correctly protected but stored in plaintext in DB
- Temporary admin endpoints (`/api/admin/init-db`, `/api/admin/promote`) present in production without protection

**No code was modified. No database was changed. This entry documents the state found during audit.**

---

## Pre-2026-11-05 — Historical Changes (Reconstructed from Migration Files)

> [!NOTE]
> These are reconstructed from migration file dates and content. Exact dates are UNKNOWN.

### UNKNOWN DATE — Google OAuth Integration
**Type:** FEATURE | SCHEMA  
- Added `google_id` column to `users` table (`add_google_auth.sql`)
- Made `password_hash` nullable for Google-only accounts
- Added `GET /api/auth/google` endpoint (google-auth-library)
- Added complete-profile onboarding flow for Google users

### UNKNOWN DATE — Email Verification System
**Type:** FEATURE | SCHEMA  
- Added `email_verified`, `verification_token`, `token_expires_at` to `users` (`add_email_verification.sql`)
- Added `POST /api/auth/resend-verification` endpoint
- Added verification email via Resend
- Blocked login for unverified email/password accounts

### UNKNOWN DATE — Offer Targeting
**Type:** FEATURE | SCHEMA  
- Added `target_classes` and `target_branches` TEXT[] to `offers` (`add_offers_targeting.sql`)
- Offers now filter by student academic level and branch

### UNKNOWN DATE — Offer Features
**Type:** FEATURE | SCHEMA  
- Added `features` JSONB to `offers` (`add_offers_features.sql`)
- Features: `{live_access, exams, community}`

### UNKNOWN DATE — Lesson Feedback System
**Type:** FEATURE | SCHEMA  
- Created `lesson_feedback` table (`add_feedback_table.sql`)
- Added `POST /api/tracking/lesson-feedback` endpoint

### UNKNOWN DATE — Zoom Integration
**Type:** FEATURE | INTEGRATION  
- Added Zoom Server-to-Server OAuth client (`utils/zoomClient.js`)
- Integrated live session scheduling with automatic Zoom meeting creation
- Added `zoom_meeting_id`, `zoom_join_url`, `zoom_start_url`, `zoom_password` to `live_sessions`
- Configured auto-recording to Zoom cloud

### UNKNOWN DATE — Cloudflare R2 Migration (from Supabase Storage)
**Type:** ARCHITECTURE | BREAKING  
- Migrated file storage from Supabase Storage to Cloudflare R2
- Added `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
- Video/PDF access now uses 5-minute signed URLs
- Receipt upload to R2 implemented in wallet flow

### UNKNOWN DATE — Supabase → Self-Hosted Postgres Migration
**Type:** ARCHITECTURE | BREAKING  
- Migrated from Supabase (hosted Postgres + RLS) to self-hosted Postgres on Coolify
- Removed Supabase client SDK from backend
- Replaced Supabase Auth with custom JWT + bcrypt authentication
- Replaced Supabase RLS with application-level access control
- Created `schema_postgres.sql` for self-hosted schema (without RLS policies)
- Legacy Supabase files preserved in `/database/schema.sql`, `/database/schema-with-users.sql`

### UNKNOWN DATE — Partial Payment / Installment System
**Type:** FEATURE | SCHEMA  
- Added `users.debt` column (via runtime ALTER TABLE)
- Added admin endpoints for partial enrollment and debt collection
- Students can be enrolled with installment payments tracked as debt

### UNKNOWN DATE — AI Code Debugger (Bugi)
**Type:** FEATURE | INTEGRATION  
- Added `POST /api/ai/debug` endpoint (Gemini API)
- Bugi responds in Tunisian Darja
- 3-model fallback chain
- Tutoring format with structured error explanation

### UNKNOWN DATE — Placement Quiz Session System
**Type:** FEATURE | SCHEMA  
- Created `session_registrations`, `session_questions`, `session_submissions`, `session_config` tables
- Full placement quiz flow: register → take quiz → score → tier assignment → account creation
- Tier system: explorer (<50%), challenger (50-79%), elite (≥80%)
- Group assignment: beginner/advanced based on perfect score

### UNKNOWN DATE — Security Incident
**Type:** SECURITY  
- Sensitive keys were accidentally exposed in `.env` file
- Supabase service key, R2 access/secret keys, Cloudflare account ID removed from `.env`
- Keys required regeneration (see `SECURITY_INCIDENT.md`)
- Root `.gitignore` added to prevent future `.env` commits

---

## Template for Future Entries

```markdown
## YYYY-MM-DD — Short Description

**Author:** [Name / AI Agent Name]  
**Type:** SECURITY | SCHEMA | FEATURE | BUGFIX | ARCHITECTURE | BUSINESS_RULE | BREAKING  
**Related tasks:** TASK-XXX

### Changed
- Description of what changed

### Added
- New files, tables, or endpoints

### Fixed
- Bug fixes

### Breaking Changes
- What broke and how to migrate

### Database Changes
- Tables created/modified
- Migrations applied: `database/xxx.sql`
```

## 2026-11-05 — Open Lesson Python Exercises in Code Pratique

**Author:** Codex  
**Type:** UX / FEATURE

- Lesson resource lists keep a named download action and add “Ouvrir dans Code Pratique” for Python files.
- Selected Python code loads in the existing editor as starter code; running it remains an explicit student action.
- No database or API changes.

## 2026-11-06 — Unify Lesson Documents and Resources

**Author:** Codex  
**Type:** UX / FEATURE

- Combined legacy lesson PDFs and uploaded lesson resources into one compact student resource section, with PDF preview/download actions, and removed the oversized standalone document button.
- Replaced the single-file admin document control with multi-file resource upload, including while creating a lesson.
- Added common document, office, image, text, programming, and ZIP formats to the server allowlist and admin pickers. Existing 25 MB per-file limit and private signed R2 access remain.
- No database changes.

## 2026-11-06 — Fix Lesson Resource Actions

**Author:** Codex  
**Type:** UX / BUGFIX

- Aligned each lesson resource into a full-width row with compact download, PDF preview, and Python editor icons.
- Added authenticated lesson and live-session endpoints that check access before reading small Python files from private R2 into Code Pratique, avoiding browser-to-R2 CORS for editor loading.
- Files larger than 1 MB remain downloadable; no schema change.


## 2026-11-12

- Added opt-in monthly and academic-year offers, audited installments, checkout expiry quotes, timed purchase history and deduplicated expiry reminders.
- Added admin-reviewed academic calendar drafts using the dedicated Learning Gemini integration.

- Reorganized student course details for mobile and desktop, removed placeholder activity statistics, and added Google Drive replay preview support.

- Added inclusive short-month timed access, audited historical payments and reversals, and separate dashboard totals for wallet funding, collected sales and installment debt.

- Added optional annual offer upgrades with exact installment schedules, verified credit, protected wallet collection and audited corrections.
# 2026-11-21 — Session manager integration safeguards

- Protected recording deletion against active/shared replay references and concurrent manual attachment; failed storage deletion leaves the import available for retry.
- Added PostgreSQL race/republication checks, actual browser file-picker verification and multi-audience manager integration checks. Full suite: 85 passing, no skips; hosted Zoom/R2 checks still required.
