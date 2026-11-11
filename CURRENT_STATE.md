# CURRENT_STATE.md — Synta Academy

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

