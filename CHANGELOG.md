# CHANGELOG.md — Synta Academy

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

