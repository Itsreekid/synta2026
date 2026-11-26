### TASK-FREE-FUNNEL — optional email confirmation COMPLETED LOCALLY2026-11-26

Owner-approved direct skip preserves an unverified account, normal password login for free-session signups, secure guest result/reservation ownership and later profile verification.193 complete regressions and18 final affected checks pass. No migration needed; not published/deployed. See latest CURRENT_STATE.md.

### TASK-FREE-FUNNEL — final student journey implemented locally, 2026-11-26

Admin publication/section controls, read-only date card, quiz-first final registration, automatic member reservations and secure email/login/Google recovery implemented. Pending250004 and260005 remain held; no production activation. Validation/results and remaining gates: FREE_SESSION_FINAL_FLOW_IMPLEMENTATION.md and latest CURRENT_STATE.md.

### TASK-FREE-FUNNEL — readiness review, 2026-11-26

Alias promotion completed locally with exact approved checksum; supplied production metadata verified. Hosted staging explicitly waived. Final combined regressions and operational runbook: PRODUCTION_RELEASE_READINESS_20261126.md. Deployment still requires final owner approval and verified backup; do not promote held funnel or unrelated migrations.

### TASK-FREE-FUNNEL — campaign flexibility COMPLETED LOCALLY 2026-11-26

Verified multiple same-class campaigns; completed read-only/authoritative profile targeting, strict open-profile validation, held alias ownership/redirects and rename-safe drafts. Tests: FREE_CAMPAIGN_FLEXIBILITY_IMPLEMENTATION.md. Production NO-GO; next is authorized staging and explicit promotion review, not deployment.

### TASK-FREE-FUNNEL — compatibility fix COMPLETED LOCALLY 2026-11-26

Original migration immutable; exact replacement/repair works with original pending/applied and audience migrations before/after. Supplied production ledger hashes all match. No held promotion. Remaining production gates: current schema evidence, restored-backup staging rehearsal, hosted smoke tests and separate deployment approval. See SESSION_MIGRATION_COMPATIBILITY.md.

### TASK-FREE-FUNNEL — local implementation COMPLETED 2026-11-26; production BLOCKED

Guest quiz, signup recovery, exact-date reservations, admin controls and held migration implemented/tested. Next: ledger-aware free/multi-audience compatibility repair, combined migration rehearsal and separately approved hosted validation. Full suite retains 14 related live failures. See FREE_SESSION_FUNNEL_IMPLEMENTATION.md.

# IMPLEMENTATION_PLAN.md — Synta Academy

> **Last updated:** 2026-11-05  
> **Source:** Post-audit engineering roadmap  
> **Status legend:** NOT STARTED | IN PROGRESS | COMPLETED | BLOCKED

---

## Phase 1 — Critical Security & Schema Fixes

### TASK-001: Fix Unauthenticated Purchase Endpoints
- **Priority:** CRITICAL
- **Status:** COMPLETED — 2026-11-05
- **Objective:** Prevent user impersonation in purchase routes
- **Current situation:** Resolved 2026-11-05. Both routes require cookie JWT authentication and derive the user ID from `req.user.id`.
- **Required changes:**
  1. Add `authApiMiddleware` to both routes in `purchase.js`
  2. Remove `userId` from request body; derive it from `req.user.id`
  3. Updated browser callers to omit `userId`; purchase identity comes from the JWT cookie
- **Dependencies:** None
- **Risks:** Browser callers were updated to stop sending `userId` in the request body.
- **Acceptance criteria:** Both endpoints return 401 without valid JWT; `userId` from body is ignored
- **Notes:** Check `backend/public/js/paiement.js` and `offers.js` to update client-side callers

---

### TASK-002: Fix Unauthenticated AI Debug Endpoint
- **Priority:** CRITICAL
- **Status:** COMPLETED — 2026-11-05
- **Objective:** Prevent API key abuse and unauthorized usage
- **Current situation:** Resolved 2026-11-05. `POST /api/ai/debug` requires cookie JWT authentication.
- **Required changes:**
  1. Add `authApiMiddleware` to `POST /api/ai/debug` in `ai-api.js`
  2. Rate limiting remains tracked separately in TASK-005
- **Dependencies:** None
- **Risks:** Anonymous debugger usage now receives 401 and must sign in.
- **Acceptance criteria:** 401 returned without valid JWT; authenticated users can still use the debugger

---

### TASK-003: Implement Refresh Token Flow
- **Priority:** CRITICAL
- **Status:** COMPLETED 2026-11-20 (Batch 2B, uncommitted; dormant until the owner approves `database/pending-migrations/202611200001_create_refresh_tokens.sql`). Implemented as server-side renewal middleware with rotating, hashed refresh tokens instead of a client-called `/api/auth/refresh` endpoint, so no client change was needed. See `ARCHITECTURE.md` Section 7.
- **Objective:** Prevent users from being logged out every hour
- **Current situation:** Server middleware consumes rotating refresh tokens with a 30-day inactivity window and 90-day absolute cap. Deployment requires owner approval of the held refresh-token migration; missing storage falls back to one-hour access. Local HTTP/PostgreSQL and browser regressions passed 2026-11-22.
- **Required changes:**
  1. Add `POST /api/auth/refresh` endpoint in `auth-api.js`
  2. Verify `synta_refresh` cookie, issue new `synta_access`
  3. Optionally rotate refresh token on each use
  4. Update client-side `api-client.js` to auto-retry with refresh on 401
- **Dependencies:** None
- **Risks:** Refresh token rotation could cause race conditions on parallel requests
- **Acceptance criteria:** Client JS auto-renews access token; 401 is never shown to user with valid refresh token

---

### TASK-004: Move Runtime Schema Changes to Migration Files
- **Priority:** CRITICAL
- **Status:** NOT STARTED
- **Objective:** Eliminate fragile runtime `ALTER TABLE` calls
- **Current situation:** `users.debt`, `offers.discount_percentage`, `offers.is_best_seller`, `offers.image_url`, `transactions.*` columns are added at runtime via `ensureXxxSchema()` functions. The `notifications` table is created on startup in `config/db.js`.
- **Required changes:**
  1. Create `database/add_missing_columns.sql` with all missing columns
  2. Remove `ensureUsersSchema()`, `ensureOffersSchema()`, `ensureTransactionsSchema()` from route files
  3. Move `CREATE TABLE notifications` to a proper migration file
  4. Remove notifications table creation from `config/db.js`
  5. Run the migration file on the production DB
- **Dependencies:** None
- **Risks:** Column existence must be verified before removing ensure functions
- **Acceptance criteria:** `config/db.js` only connects; no DDL in route files

**Progress note (2026-11-05):** A deployment migration runner now applies numbered SQL files before the app starts, and notifications table DDL was moved out of `config/db.js`. TASK-004 remains IN PROGRESS because the runtime schema changes in `admin-api.js` and other routes still need conversion into migrations.

---

### TASK-005: Add Rate Limiting
- **Priority:** HIGH
- **Status:** NOT STARTED
- **Objective:** Protect against brute force and abuse
- **Current situation:** No rate limiting on any endpoint, including login, registration, and AI.
- **Required changes:**
  1. Install `express-rate-limit`
  2. Apply 5 req/15min to `POST /api/auth/login`
  3. Apply 3 req/hour to `POST /api/auth/register`
  4. Apply 20 req/min to `POST /api/ai/debug` (after TASK-002)
- **Dependencies:** None
- **Risks:** May impact legitimate users on shared IPs (school networks)
- **Acceptance criteria:** 429 returned after configured thresholds; logs show rate-limit events

---

## Phase 2 — Backend & Business Logic

### TASK-006: Unify Dual Authentication Middleware
- **Priority:** HIGH
- **Status:** NOT STARTED
- **Objective:** Eliminate confusion between two auth systems
- **Current situation:** `authMiddleware` (in `auth.js`) accepts Bearer token + Cookie. `authApiMiddleware` (in `requireAuth.js`) accepts Cookie only. Both are used inconsistently.
- **Required changes:**
  1. Decide on a canonical auth middleware (recommend: Cookie primary, Bearer fallback for API clients)
  2. Merge both into a single implementation
  3. Update all route files to use the unified middleware
- **Dependencies:** None
- **Risks:** Could break admin panel which may use Bearer token
- **Acceptance criteria:** One middleware, consistent behavior across all routes

---

### TASK-007: Fix session_registrations → users Linkage
- **Priority:** HIGH  
- **Status:** COMPLETED 2026-11-10
- **Objective:** Link placement quiz registrations to created user accounts
- **Current situation:** Verified placement activation creates the account, links `auth_user_id` and consumes activation in a transaction. Existing credentials are never replaced.
- **Required changes:**
  1. After user upsert in `set-password`, run `UPDATE session_registrations SET auth_user_id = $1 WHERE id = $2`
- **Dependencies:** None
- **Risks:** None
- **Acceptance criteria:** After password setup, `session_registrations.auth_user_id` = created user's UUID

---

### TASK-008: Consolidate Financial Tables
- **Priority:** HIGH
- **Status:** NOT STARTED
- **Objective:** Remove ambiguity between `purchases`, `payments`, `transactions`
- **Current situation:** Three overlapping tables. `payments` is never written to. `purchases` is written to by some routes. `transactions` is the operational ledger used by the admin payment flow.
- **Required changes:**
  1. Determine if `purchases` should be the canonical record or if `transactions` covers it
  2. If `transactions` is canonical: add columns `course_id` and `offer_id` to `transactions` for purchase reference
  3. Stop writing to `purchases` from enrollment routes; write only to `transactions`
  4. Archive or drop `payments` table (after confirming it's empty in production)
- **Dependencies:** Requires business decision (BQ-08 from BUSINESS_RULES.md)
- **Risks:** Data migration required; existing reports may reference `purchases`
- **Acceptance criteria:** One table per financial operation type; no overlap

---

### TASK-009: Zoom cloud recording imports and reviewed publication
- **Status:** COMPLETED LOCALLY 2026-11-24; production/staging activation NOT verified.
- Preserved webhook, private R2 transfer, existing admin preview/selection and student permissions.
- Added persistent occurrence bindings, fenced claims, atomic segment intake, manual approval for every new segment, durable deletion/reconciliation, diagnostics and selected exact-UUID historical recovery.
- Held dependency: existing live_sessions/users + 202611200003, then 202611240001_zoom_recording_reliability.sql. Do not promote unrelated migrations.
- Next operational step: owner review of the additive migration, then separately approved real Zoom/R2 staging validation. Production approval is still required. See ZOOM_RECORDING_IMPLEMENTATION.md; unrelated offer-card regression remains outside this task.

---

### TASK-010: Add Admin Audit Logging
- **Priority:** MEDIUM
- **Status:** NOT STARTED
- **Objective:** Track admin actions for security and accountability
- **Current situation:** No audit trail for admin impersonation, password changes, or payment confirmations.
- **Required changes:**
  1. Create `admin_audit_log` table (admin_id, action, target_id, metadata, created_at)
  2. Write entries for: magic login, password change, payment confirm/reject, enrollment, student deletion
- **Dependencies:** TASK-004 (clean schema process)
- **Risks:** None
- **Acceptance criteria:** Every admin action generates an audit log entry

---

## Phase 3 — Authentication & Authorization

### TASK-011: Add Admin Dashboard Server-Side Auth
- **Priority:** HIGH
- **Status:** NOT STARTED
- **Objective:** Prevent admin HTML from being served without authentication
- **Current situation:** Admin HTML files (`admin/login.html`, `admin/dashboard.html`, `admin/pages/*.html`) are served as static files from `backend/public/admin/`. No server-side auth check before serving them.
- **Required changes:**
  1. Move admin HTML to EJS views or add route handlers for each admin page
  2. Apply `requireAdmin` middleware to all admin page routes
  3. Redirect to `/admin/login` if not authenticated
- **Dependencies:** None
- **Risks:** Breaking admin panel if static path is hardcoded in scripts
- **Acceptance criteria:** `admin/dashboard.html` returns 302 to login if no valid admin JWT

---

### TASK-012: Password Reset Flow
- **Priority:** HIGH
- **Status:** COMPLETED 2026-11-26 (local, uncommitted)
- **Objective:** Allow students to reset forgotten passwords
- **Implemented:** No schema change: stateless 1-hour token signed with a key derived from `JWT_SECRET` and bound to a fingerprint of the current password hash + email (single use, invalid after any password change). Link uses the URL fragment (`/password-reset#token=…`). Endpoints `POST /api/auth/forgot-password` (generic reply, IP + per-email rate limits), `POST /api/auth/reset-password/check`, `POST /api/auth/reset-password` (revokes all refresh tokens, confirms email, sends a "password changed" notice). Branded emails share the verification layout. Steps 1–4 below are superseded.
- **Previous situation:** A `password-reset` page existed (`views/pages/auth/password-reset.ejs`) but no backend endpoints implemented the actual reset flow.
- **Required changes:**
  1. Add `password_reset_token` and `reset_token_expires_at` columns to `users`
  2. Create `POST /api/auth/forgot-password` — generates token, sends email
  3. Create `POST /api/auth/reset-password` — validates token, updates hash
  4. Update the EJS view to call these endpoints
- **Dependencies:** `services/email.js` (Resend) already set up
- **Risks:** None
- **Acceptance criteria:** Student can reset password via email link; token expires in 1 hour

---

## Phase 4 — Formation & Group Management

### TASK-013: Implement Groups/Cohorts
- **Priority:** HIGH
- **Status:** NOT STARTED
- **Objective:** Connect the placement quiz's beginner/advanced classification to live session access
- **Current situation:** `session_registrations.group` classifies students as beginner/advanced but there is no `groups` table, no group membership, and no filtering of live sessions by group.
- **Required changes:**
  1. Create `groups` table (id, name, offer_id, level, is_active)
  2. Create `group_memberships` table (group_id, user_id, joined_at)
  3. Update `live_sessions` to optionally reference a `group_id`
  4. Update `GET /api/live/upcoming` to filter by group membership
  5. Admin API to create groups and assign students
- **Dependencies:** Business decision needed (BQ-01, BQ-02 in BUSINESS_RULES.md)
- **Risks:** Significant schema migration; existing live sessions have no group_id
- **Acceptance criteria:** A student in group A does not see sessions scheduled for group B

---

### TASK-014: Implement Live Session Attendance Tracking
- **Priority:** MEDIUM
- **Status:** NOT STARTED
- **Objective:** Track which students attended each live session
- **Current situation:** No attendance tracking exists. Session `status` is never updated from `scheduled`.
- **Required changes:**
  1. Create `live_session_attendance` table
  2. Create endpoint for student to register attendance (or use Zoom webhook)
  3. Create admin endpoint to view attendance per session
  4. Update session `status` to `completed` after end time
- **Dependencies:** TASK-013 (groups useful but not required)
- **Risks:** Zoom webhooks are more reliable than self-reported attendance
- **Acceptance criteria:** Admin can see attendance list per session

---

## Phase 5 — Live Sessions

### TASK-015: Live Session Status Management
- **Priority:** MEDIUM
- **Status:** NOT STARTED
- **Objective:** Automatically update session status (scheduled → live → completed)
- **Current situation:** `live_sessions.status` is always `'scheduled'` — never updated.
- **Required changes:**
  1. Add `POST /api/live/:sessionId/start` and `/end` admin endpoints
  2. OR: implement a scheduled job to update status based on `scheduled_at + duration_minutes`
  3. Update admin panel to show current session status
- **Dependencies:** None
- **Risks:** Cron job approach requires reliable scheduling
- **Acceptance criteria:** Session shows as `live` during meeting, `completed` after

---

## Phase 6 — Student Experience

### TASK-016: Populate user_weak_topics
- **Priority:** MEDIUM
- **Status:** NOT STARTED
- **Objective:** Make the weak topic tracking actually useful
- **Current situation:** `user_weak_topics` table exists and is queried by `GET /api/tracking/weak-topics`, but no code writes to it. The table is always empty.
- **Required changes:**
  1. Add a trigger or function that updates `user_weak_topics` when `quiz_responses` is inserted
  2. OR: add a recalculation endpoint that the tracking route calls after each quiz submission
- **Dependencies:** None
- **Risks:** Triggers add DB complexity; recalculation on every quiz response may be slow
- **Acceptance criteria:** `GET /api/tracking/weak-topics` returns real data after quiz completion

---

### TASK-017: Student Debt Visibility
- **Priority:** LOW
- **Status:** NOT STARTED
- **Objective:** Show students their outstanding debt in the wallet UI
- **Current situation:** `users.debt` field exists and is managed by admin, but `GET /api/user/balance` only returns `balance`, not `debt`.
- **Required changes:**
  1. Add `debt` to `GET /api/user/balance` response
  2. Update wallet EJS view to show debt alongside balance
- **Dependencies:** TASK-004 (ensure debt column is in schema)
- **Risks:** None
- **Acceptance criteria:** Wallet page shows balance and outstanding debt

---

### TASK-018: Move Static Events to Database
- **Priority:** LOW
- **Status:** NOT STARTED
- **Objective:** Allow admin to manage calendar events without code changes
- **Current situation:** Calendar events are loaded from `backend/public/data/events.js` as a static JS file.
- **Required changes:**
  1. Create `events` table (title, description, date, time, target_classes, target_branches, icon)
  2. Add admin CRUD endpoints for events
  3. Update `GET /api/events` to read from DB instead of static file
  4. Add events management to admin panel
- **Dependencies:** None
- **Risks:** Existing static events must be migrated to DB
- **Acceptance criteria:** Admin can create/edit/delete events from admin panel

---

## Phase 7 — Testing & Security

### TASK-019: Add Integration Tests
- **Priority:** HIGH
- **Status:** NOT STARTED
- **Objective:** Prevent regressions in critical paths
- **Current situation:** No automated tests found anywhere in the codebase.
- **Required changes:**
  1. Install Jest + supertest
  2. Write tests for: register → verify → login flow
  3. Write tests for: purchase flow (auth check, balance deduction, enrollment creation)
  4. Write tests for: enrollment access control (enrolled vs. not enrolled)
  5. Write tests for: admin payment confirmation
- **Dependencies:** None
- **Risks:** Requires test database setup
- **Acceptance criteria:** `npm test` runs and passes; CI runs tests on push

---

### TASK-020: Security Audit
- **Priority:** HIGH
- **Status:** NOT STARTED
- **Objective:** Verify no other security holes after TASK-001–002
- **Required changes:**
  1. Audit all routes for missing auth middleware
  2. Check for SQL injection in any dynamic query construction (edge cases)
  3. Verify `zoom_start_url` is never sent to students
  4. Check for CORS misconfiguration
  5. Add security headers for file downloads
- **Dependencies:** TASK-001, TASK-002
- **Acceptance criteria:** Penetration test checklist passed

---

## Phase 8 — Production Readiness

### TASK-021: Versioned Database Migrations
- **Priority:** HIGH
- **Status:** NOT STARTED
- **Objective:** Reliable, ordered, reversible DB migrations
- **Current situation:** Manual SQL files with no version tracking or rollback capability.
- **Required changes:**
  1. Install `db-migrate` or adopt `knex` migrations
  2. Number existing SQL files: `001_base_schema.sql`, `002_google_auth.sql`, etc.
  3. Create a `schema_versions` table to track applied migrations
  4. Add `npm run migrate` script
- **Dependencies:** TASK-004
- **Risks:** Existing DB state may not match any single migration
- **Acceptance criteria:** `npm run migrate` runs idempotently; rollback works

---

### TASK-022: Payment Gateway Integration
- **Priority:** MEDIUM
- **Status:** NOT STARTED
- **Objective:** Accept online payments (cards, Flouci, D17)
- **Current situation:** Only manual deposit + admin confirmation. No online payment gateway.
- **Required changes:**
  - Decision required: Stripe, Flouci, Paymee (Tunisian options)
  1. Integrate chosen gateway's SDK
  2. Add webhook handler for payment confirmation
  3. Auto-confirm deposit on successful payment event
  4. Add payment method selection to wallet UI
- **Dependencies:** Business decision on preferred payment provider
- **Risks:** PCI compliance considerations; gateway availability in Tunisia
- **Acceptance criteria:** Student can pay by card; balance credited automatically

---

### TASK-023: Health Check & Monitoring
- **Priority:** MEDIUM
- **Status:** NOT STARTED
- **Objective:** Production visibility into system health
- **Current situation:** Basic `/health` endpoint returns `{status: "healthy"}` with no real checks.
- **Required changes:**
  1. Enhance `/health` to include DB connectivity check
  2. Add R2 connectivity check
  3. Add Zoom token validity check
  4. Set up uptime monitoring (UptimeRobot or similar)
- **Dependencies:** None
- **Risks:** None
- **Acceptance criteria:** `/health` returns 503 when DB is unreachable

---

### TASK-024: Unify Course and Replay Playback Experience
- **Priority:** MEDIUM
- **Status:** IMPLEMENTED IN SOURCE — 2026-11-06; production verification pending deployment
- **Objective:** Keep lesson and replay playback in one responsive course-player layout and reduce course-detail loading delay.
- **Changes made:** Replays now render in the course main area; during playback the sidebar lists available recordings grouped by month and allows direct replay switching. Player controls return to chapters/live sessions; lesson playback resumes from saved position and an authenticated, access-checked endpoint saves `last_position` without clearing completion; independent course/access and session/resource/progress requests run concurrently; course grid/player controls have responsive minimum-width constraints.
- **Verification:** `node --check` passed for the changed course-detail script and neighboring frontend scripts. Production baseline and a mobile Lighthouse audit were captured, but a post-change hosted measurement cannot be taken until the source is deployed.
- **Remaining acceptance checks:** Deploy through Coolify; verify lesson-to-live-to-replay-to-chapters flow on desktop and mobile; confirm position persistence and media playback; record post-deploy navigation and Lighthouse metrics.
- **Dependencies:** Existing course enrollment, live-session, resource, and progress APIs; no schema changes.
- **Risks:** Browser verification requires deployment of these source changes and an authenticated student account with an accessible replay.

---

## Priority Summary

| Priority | Tasks | Count |
|----------|-------|-------|
| CRITICAL | TASK-001, 002, 003, 004 | 4 |
| HIGH | TASK-005, 006, 007, 008, 011, 012, 013, 019, 020, 021 | 10 |
| MEDIUM | TASK-009, 010, 014, 015, 016, 022, 023, 024 | 8 |
| LOW | TASK-017, 018 | 2 |

**Recommended remaining start order:** TASK-004 → TASK-003 → TASK-005


TASK-009 follow-up completed locally 2026-11-24: automatic occurrence discovery on explicit search, selected historical recovery and 48-hour Corbeille restoration. New held dependency 202611240002; real deployment validation remains pending owner approval.

### 2026-11-24 — Local deployment commit prepared

- Owner approved promotion of exactly 202611200003_create_zoom_recording_imports.sql, 202611240001_zoom_recording_reliability.sql and 202611240002_recording_trash_retention.sql to database/migrations. SQL contents retained unchanged; startup runner will apply them on the next deployment. Imports flag does NOT disable migrations.
- Refresh-token migration 202611200001 and live-audience migrations 202611200002/202611200004 remain pending. Updated recording regression paths for promoted files; included all recording implementation/runtime/test files. No production access, migration execution, push or deployment.
- Production gate: backup, stop all old backend workers, deploy initially with ZOOM_RECORDING_IMPORT_ENABLED=false, verify schema/replays and then separately activate. Existing real Zoom/R2 validation and the previously documented unrelated offer-card full-suite failure remain outstanding. See ZOOM_RECORDING_IMPLEMENTATION.md.

TASK-009 presentation follow-up implemented locally 2026-11-24: mobile-first occurrence/segment cards, metadata summaries, byte-progress UI and compact Corbeille. Import pipeline and schema unchanged. Production rollout not performed.

TASK-015 student-status follow-up completed locally 2026-11-25: existing manual finish status enforced in shared LIVE reminders, five-minute join metadata and server join gate. Shared popup styling/reminders delivered without new schema; automatic database status-transition jobs remain outside this follow-up. See UNIFIED_POPUPS_IMPLEMENTATION.md; staging/physical-device validation remains.

### Custom-installment follow-up — COMPLETED locally 2026-11-25

Owner-approved independent amounts, automatic/manual dates and one-month cutoff buffer implemented in existing offer editor/checkout. Additive 202611250003 migration validated on disposable PostgreSQL. Production/staging activation remains gated; full-suite baseline failures documented in CUSTOM_INSTALLMENT_VALIDATION.md.
