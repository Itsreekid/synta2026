# CHANGELOG.md — Synta Academy

> **Format:** Reverse chronological. Each entry includes date, type, description, and agent/author.  
> **Types:** SECURITY | SCHEMA | FEATURE | BUGFIX | ARCHITECTURE | BUSINESS_RULE | BREAKING

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

