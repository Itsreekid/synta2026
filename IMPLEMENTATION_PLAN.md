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
- **Status:** NOT STARTED
- **Objective:** Prevent users from being logged out every hour
- **Current situation:** 7-day refresh tokens are issued but never consumed. The only way to get a new access token is to log in again.
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
- **Status:** NOT STARTED
- **Objective:** Link placement quiz registrations to created user accounts
- **Current situation:** `session_registrations.auth_user_id` column exists but `POST /api/session/set-password` creates the user and does NOT update `auth_user_id` on the registration record.
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

### TASK-009: Implement Zoom Webhook for Auto-Replay
- **Priority:** MEDIUM
- **Status:** NOT STARTED
- **Objective:** Automatically set `replay_url` after Zoom cloud recordings complete
- **Current situation:** Zoom auto-records to cloud but `replay_url` in `live_sessions` must be manually set via DB.
- **Required changes:**
  1. Create `POST /api/live/zoom-webhook` endpoint
  2. Verify Zoom webhook signature
  3. On `recording.completed` event, update `live_sessions.replay_url` by matching `zoom_meeting_id`
  4. Add `ZOOM_WEBHOOK_SECRET` to env vars
- **Dependencies:** Zoom Marketplace app webhook configuration
- **Risks:** Zoom meeting ID matching requires 1-to-1 or careful many-to-1 mapping
- **Acceptance criteria:** `replay_url` is auto-populated within minutes of session end

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
- **Status:** NOT STARTED
- **Objective:** Allow students to reset forgotten passwords
- **Current situation:** A `password-reset` page exists (`views/pages/auth/password-reset.ejs`) but no backend endpoints were found to implement the actual reset flow.
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

## Priority Summary

| Priority | Tasks | Count |
|----------|-------|-------|
| CRITICAL | TASK-001, 002, 003, 004 | 4 |
| HIGH | TASK-005, 006, 007, 008, 011, 012, 013, 019, 020, 021 | 10 |
| MEDIUM | TASK-009, 010, 014, 015, 016, 022, 023 | 7 |
| LOW | TASK-017, 018 | 2 |

**Recommended remaining start order:** TASK-004 → TASK-003 → TASK-005

