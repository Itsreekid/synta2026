# CURRENT_STATE.md — Synta Academy

> **Last updated:** 2026-11-06  
> **Updated by:** Codex  
> **Next recommended task:** Deploy and verify the Code Pratique workspace UX and lesson-file handoff at desktop, tablet, and mobile sizes; then continue TASK-004 in `IMPLEMENTATION_PLAN.md`

---

## Project Status: OPERATIONAL — CRITICAL PURCHASE AND AI AUTHORIZATION FIXES APPLIED

The backend is running in production on Coolify. Core features (login, course access, payment flow) work. Purchase identity and the AI debugger endpoint require cookie JWT authentication. Course details now show real enrolled-course live sessions and replay state; other open issues remain listed below.

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
- **Product decision:** Web mode is intentionally deferred until the rest of Synta’s student website is stable. Do not resume or expose it until the user explicitly asks to continue Code Pratique Web development. This decision is recorded in `AGENTS.md`.

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
| Refresh token renewal | ⚠️ PARTIAL | Refresh tokens are issued and stored in cookie but never redeemed. Users must re-login every hour. |
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
| BUG-003 | 🔴 CRITICAL | `routes/auth-api.js` | No `POST /api/auth/refresh` endpoint. Refresh tokens are issued but never consumed. 1-hour session window. |
| BUG-004 | 🟡 HIGH | `routes/admin-api.js`, `routes/user-api.js` | Schema columns added at runtime via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Fragile and unversioned. |
| BUG-005 | 🟡 HIGH | `routes/session.js` | `POST /api/session/set-password` creates user account but does NOT update `session_registrations.auth_user_id`. |
| BUG-006 | 🟡 HIGH | No backend files | Password reset flow is not implemented. The `/password-reset` EJS page has no backend support. |
| BUG-007 | 🟡 HIGH | `routes/tracking.js` | `GET /api/tracking/weak-topics` reads from `user_weak_topics` which is never written. Always returns empty array. |
| BUG-008 | 🟠 MEDIUM | `backend/public/admin/` | Admin HTML pages served as static files with no server-side authentication. API-level auth works, but HTML is accessible to anyone. |
| BUG-009 | 🟠 MEDIUM | `server.js` | No rate limiting on any endpoint. Brute-force and abuse possible. |
| BUG-010 | 🟠 MEDIUM | `routes/live.js` | `live_sessions.status` is never updated. `GET /api/live/upcoming` could show sessions that have already occurred (relies on `scheduled_at >= NOW()` filter). |
| BUG-012 | ✅ FIXED 2026-11-05 | `public/js/course-details.js` | Course details previously substituted a random live count and had no session list. Count now matches the student's accessible course sessions; past sessions remain listed while replay is pending. |
| BUG-013 | FIXED IN SOURCE 2026-11-06 | `views/pages/code/index.ejs` | Lesson Python file banner could appear while CodeMirror remained empty. CodeMirror boot is now idempotent and the starter remains queued until the editor is available; deploy and verify with an actual lesson file. |
| BUG-011 | 🟠 MEDIUM | `server.js` | Temporary `/api/admin/init-db` and `/api/admin/promote` endpoints are unprotected and present in production. |

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

