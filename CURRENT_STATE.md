# CURRENT_STATE.md — Synta Academy

> **Last updated:** 2026-11-05  
> **Updated by:** Codex  
> **Next recommended task:** TASK-004 (Move runtime schema changes to migration files) in `IMPLEMENTATION_PLAN.md`

---

## Project Status: OPERATIONAL — CRITICAL PURCHASE AND AI AUTHORIZATION FIXES APPLIED

The backend is running in production on Coolify. Core features (login, course access, payment flow) work. Purchase identity and the AI debugger endpoint now require cookie JWT authentication; other open issues remain listed below.

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
- `notifications` — created in `config/db.js` pool startup query

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

---

## 8. Current Development Priorities

1. **TASK-004 / BUG-004:** Move runtime schema changes to migration files
2. **TASK-003 / BUG-003:** Implement refresh token redemption endpoint
3. **TASK-012 / BUG-006:** Implement password reset flow
4. **TASK-005 / BUG-009:** Add rate limiting

---

## 9. Next Recommended Task

TASK-001 and TASK-002 are complete. Continue with TASK-004 in `IMPLEMENTATION_PLAN.md`.

---

## 10. Incomplete Work

- TASK-001 and TASK-002 are implemented; automated and manual endpoint verification has not been run in this session.
- Remaining work is tracked in `IMPLEMENTATION_PLAN.md`; TASK-004 is the next recommended task.

---

## 11. Important Files to Inspect

| File | Why |
|------|-----|
| `backend/routes/purchase.js` | Purchase endpoint authorization and transaction behavior |
| `backend/routes/ai-api.js` | AI endpoint behavior and Gemini fallback chain |
| `backend/routes/auth-api.js` | Auth flow, verify logic, magic login |
| `backend/routes/admin-api.js` | Full admin operations, payment confirmation, enrollment |
| `backend/config/db.js` | DB connection, notifications table creation |
| `database/schema_postgres.sql` | Base schema — always reference before schema changes |
| `backend/middleware/requireAuth.js` | Cookie auth system |
| `backend/middleware/requireAdmin.js` | Admin auth — dual mechanism |
| `backend/utils/zoomClient.js` | Zoom token caching, meeting creation |
| `backend/routes/session.js` | Placement quiz onboarding flow |

