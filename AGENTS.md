# AGENTS.md — Synta Academy

> **This file governs ALL AI coding agents working on this repository.**
> Read this file completely before touching any code.

---

## Identity of This Project

**Synta Academy** is a Tunisian e-learning platform (Node.js/Express + PostgreSQL + Cloudflare R2 + Zoom + Gemini AI). It sells educational offers to Bac-level high school students, manages live Zoom sessions, tracks lesson progress, and operates a manual internal wallet system. The UI language is French/Arabic; currency is TND (Tunisian Dinar).

---

## Mandatory Reading Before Any Code Change

| Document | Read when |
|----------|-----------|
| `AGENTS.md` (this file) | Always — before every task |
| `CURRENT_STATE.md` | Always — to understand what is broken or in progress |
| `ARCHITECTURE.md` | Before adding routes, middleware, or changing system design |
| `DATABASE_SCHEMA.md` | Before any database change, migration, or query modification |
| `BUSINESS_RULES.md` | Before implementing any user-facing feature |
| `IMPLEMENTATION_PLAN.md` | To check if a task is already planned and to understand its dependencies |

**After reading documentation, inspect the actual source code before writing any changes.**

---

## Before Coding — Checklist

- [ ] Read `CURRENT_STATE.md` — understand current working state and known bugs
- [ ] Check `IMPLEMENTATION_PLAN.md` — is this task already defined? What is its priority?
- [ ] Check `ARCHITECTURE.md` — will your change affect the existing architecture?
- [ ] Check `DATABASE_SCHEMA.md` — are the tables you need already defined?
- [ ] Check `BUSINESS_RULES.md` — is the behavior you are implementing documented and verified?
- [ ] Inspect actual source files in the area you will modify
- [ ] Confirm you understand what middleware protects the route you are touching

---

## During Coding — Mandatory Rules

### Database Rules
1. **NEVER invent tables or columns** that are not in `DATABASE_SCHEMA.md`. If you need a new column or table, document it first, propose a migration, and get confirmation.
2. **NEVER run migrations** in production without explicit human approval. Create the SQL file; do not execute it.
3. **ALL database access must use parameterized queries** (`pool.query('... WHERE id = $1', [id])`). No string concatenation into SQL.
4. **NEVER expose `zoom_start_url`** in any API response. It is the host meeting link. Filter it from every response object.
5. **Do NOT add `ALTER TABLE` calls to route files or startup code.** Put schema changes in `/database/` migration files only.

### Authentication & Authorization Rules
6. **Every new API endpoint must have explicit auth middleware.** Choose the correct middleware:
   - `authApiMiddleware` from `requireAuth.js` → protected API endpoints (returns 401 JSON)
   - `requireAdmin` from `requireAdmin.js` → admin-only endpoints (returns 403 JSON)
   - `authMiddleware` from `auth.js` → optional auth (sets req.user or null)
   - `requireAuth` from `requireAuth.js` → protected page routes (redirects to /login)
7. **Never trust `userId` from request body or query params for authenticated operations.** Always derive user identity from `req.user.id` (set by auth middleware after JWT verification).
8. **Never bypass the JWT cookie system.** Do not read tokens from localStorage, URL params, or other mechanisms in backend code.

### Business Logic Rules
9. **Never implement a feature that conflicts with `BUSINESS_RULES.md` without explicit confirmation.** If a rule is marked NEEDS CLARIFICATION, do not implement it — ask first.
10. **Never silently change how enrollments or payments work.** These are financial operations. Any change requires explicit review.
11. **Always use DB transactions (`BEGIN/COMMIT/ROLLBACK`) for operations that modify both `users.balance` and `transactions` or `enrollments`.** Use `pool.connect()` + client for transaction blocks.

### Code Quality Rules
12. **Follow existing naming conventions:** camelCase for JS variables, snake_case for SQL columns, kebab-case for route files.
13. **Never duplicate existing functionality.** Check if a helper/function/middleware already exists before writing a new one.
14. **Maintain existing comments and docstrings** unless they are demonstrably wrong.
15. **Never commit `.env` files or any file containing real secrets.** Check `.gitignore` before every commit.
16. **Never expose real secrets in API responses, logs, or error messages.** This includes JWT secrets, R2 keys, Zoom credentials, and API keys.

### Architecture Rules
17. **This project uses ESM modules** (`"type": "module"` in `package.json`). Use `import/export`, not `require/module.exports`.
18. **All database access goes through the single pool** exported from `backend/config/db.js`. Do not create additional database connections.
19. **Frontend JS is vanilla — no bundler.** Do not introduce webpack, Vite, React, or any build tooling unless explicitly instructed.
20. **New routes belong in existing route files or new files in `backend/routes/`**, mounted in `server.js`. Do not add routes directly to `server.js`.

---

## After Coding — Required Steps

1. **Verify your change does not break existing tests** (when tests exist)
2. **Manually test the happy path and at least one error path** for every new endpoint
3. **If you created or modified a database table:** update `DATABASE_SCHEMA.md`
4. **If you changed how the system works architecturally:** update `ARCHITECTURE.md`
5. **If you implemented or changed a business rule:** update `BUSINESS_RULES.md` with correct status
6. **If you completed a task from `IMPLEMENTATION_PLAN.md`:** mark it COMPLETED with the date
7. **Update `CURRENT_STATE.md`** with:
   - What you changed
   - What is now working
   - Any new known bugs or issues
   - What the next agent should do next
8. **Add a `CHANGELOG.md` entry** for significant changes

---

## When Switching Agents — Handoff Protocol

When you are finishing a session that another AI agent (or human) will continue:

1. **Commit or save your work** with a clear description of what changed
2. **Update `CURRENT_STATE.md`** immediately — this is the most critical document for continuity
3. **Write in `CURRENT_STATE.md`:**
   - Exactly what you completed
   - What is broken or incomplete
   - What the next task should be (by TASK-ID from `IMPLEMENTATION_PLAN.md`)
   - Any unexpected discoveries or caveats
4. **Do NOT rely on conversation history** being available to the next agent. All context must be in documentation files.
5. **If you left something in a broken state**, document it explicitly with BROKEN: label
6. **If you are mid-way through a migration**, document the exact SQL state

---

## Critical Security Rules (Never Violate)

| Rule | Reason |
|------|--------|
| `zoom_start_url` must NEVER appear in API responses to non-admins | Gives full Zoom host control |
| `password_hash` must NEVER appear in any API response | bcrypt hashes can be attacked offline |
| `JWT_SECRET` must NEVER appear in logs, errors, or responses | Full auth compromise |
| `R2_SECRET_KEY`, `R2_ACCESS_KEY` must NEVER appear in client-reachable code | Full storage access |
| `GEMINI_API_KEY` must NEVER appear in client-reachable code | Billing risk |
| `ZOOM_CLIENT_SECRET` must NEVER appear in client-reachable code | Full Zoom account access |
| Admin endpoints must ALWAYS use `requireAdmin` middleware | Privilege escalation |
| Purchase endpoints must ALWAYS derive `userId` from JWT, never from body | Impersonation risk |

---

## Project Directory Map

```
synta academy new/
├── backend/                    ← Main Node.js application
│   ├── server.js               ← Entry point, middleware, route mounting
│   ├── config/
│   │   ├── db.js               ← PostgreSQL pool (single instance)
│   │   └── r2.js               ← Cloudflare R2 client
│   ├── routes/                 ← All API route handlers
│   │   ├── auth-api.js         ← /api/auth/* (register, login, logout, verify)
│   │   ├── google-auth.js      ← /api/auth/google
│   │   ├── user-api.js         ← /api/user/* + /api/events
│   │   ├── content.js          ← /api/content/* (lessons, progress, thumbnails)
│   │   ├── courses.js          ← /api/courses/*
│   │   ├── enrollment.js       ← /api/enrollment/*
│   │   ├── purchase.js         ← /api/purchase/* (JWT protected)
│   │   ├── offers.js           ← /api/offers/*
│   │   ├── live.js             ← /api/live/* (Zoom sessions)
│   │   ├── tracking.js         ← /api/tracking/* (quiz, progress)
│   │   ├── admin-api.js        ← /api/admin/* (all admin operations)
│   │   ├── session.js          ← /api/session/* (placement quiz)
│   │   ├── ai-api.js           ← /api/ai/* (debug endpoint JWT protected)
│   │   └── pages.js            ← HTML page rendering (EJS)
│   ├── middleware/
│   │   ├── requireAuth.js      ← Cookie JWT middleware (page redirect / API 401)
│   │   ├── requireAdmin.js     ← Admin role check middleware
│   │   ├── auth.js             ← Optional Bearer+Cookie auth middleware
│   │   └── attachUserProfile.js ← Fetches DB profile for EJS templates
│   ├── services/
│   │   └── email.js            ← Resend email service (verification emails)
│   ├── utils/
│   │   ├── r2Utils.js          ← R2 signed URL generation, upload, delete
│   │   └── zoomClient.js       ← Zoom S2S OAuth, meeting create/delete
│   ├── views/                  ← EJS templates
│   │   ├── pages/              ← App pages (dashboard, courses, auth, etc.)
│   │   └── partials/           ← Shared EJS components (head, header, sidebar)
│   ├── public/                 ← Static assets
│   │   ├── index.html          ← Landing page
│   │   ├── Accueil.html        ← French landing page
│   │   ├── admin/              ← Admin panel (static HTML)
│   │   ├── js/                 ← Client-side JavaScript
│   │   ├── css/                ← Stylesheets
│   │   └── source/             ← Images
│   ├── .env.example            ← Environment variable template (no secrets)
│   ├── package.json            ← Dependencies (ESM, Node 18+)
│   └── Dockerfile              ← Multi-stage Docker build (Node 20 Alpine)
├── database/                   ← SQL migration files
│   ├── migrations/              ← Numbered incremental SQL files; applied by Docker before app start
│   ├── schema_postgres.sql     ← Base schema (self-hosted Postgres) — PRIMARY
│   ├── add_google_auth.sql     ← Adds google_id to users
│   ├── add_email_verification.sql ← Adds email_verified, token fields
│   ├── add_feedback_table.sql  ← Creates lesson_feedback table
│   ├── add_offers_targeting.sql ← Adds target arrays to offers
│   └── add_offers_features.sql ← Adds features JSONB to offers
├── AGENTS.md                   ← THIS FILE
├── ARCHITECTURE.md             ← System architecture documentation
├── DATABASE_SCHEMA.md          ← Full schema reference
├── BUSINESS_RULES.md           ← Business logic documentation
├── IMPLEMENTATION_PLAN.md      ← Development roadmap
├── CURRENT_STATE.md            ← Live status and handoff document
└── CHANGELOG.md                ← Change history
```

---

## Known Issues Summary (as of 2026-11-05)

| ID | Severity | Description |
|----|----------|-------------|
| BUG-001 | FIXED 2026-11-05 | Purchase endpoints require JWT auth and derive user ID from `req.user.id` |
| BUG-002 | FIXED 2026-11-05 | `/api/ai/debug` requires JWT auth |
| BUG-003 | CRITICAL | Refresh token is issued but never consumed — 1-hour login window |
| BUG-004 | HIGH | `users.debt`, `offers.*`, `transactions.*` columns added at runtime (schema drift risk) |
| BUG-005 | HIGH | `session_registrations.auth_user_id` never set after account creation |
| BUG-006 | HIGH | No password reset flow implemented despite page existing |
| BUG-007 | HIGH | `user_weak_topics` table is never populated by any code |
| BUG-008 | MEDIUM | Admin HTML served as static file with no server-side auth |
| BUG-009 | MEDIUM | No rate limiting on any endpoint |
| BUG-010 | MEDIUM | Live session `status` is never updated from `scheduled` |
