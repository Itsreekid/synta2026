# Notification popup and automatic migrations — 2026-11-25

## Outcome and scope

Existing Docker deployment already runs npm run migrate && npm start before the application listens. Keep this entrypoint. No new migration framework, resets, schema synchronization or environment variables. Coolify's actual remote settings were not accessed; the instructions below must match the configured deployment.

The approved notification migration is database/migrations/202611250001_notification_popup_acknowledgment.sql. It adds nullable popup_session_id (FK to live_sessions, SET NULL), popup_scheduled_at and popup_acknowledged_at to notifications, plus idx_notifications_pending_popup. Existing rows remain unchanged with null metadata; no historical popup backfill. Dependencies: baseline live_sessions and 202611050001_create_notifications.sql. No unrelated pending migrations promoted.

## Automatic workflow for all future approved changes

1. Prepare/review additive numbered SQL under database/pending-migrations. Obtain approval for schema/business changes, especially breaking changes.
2. Move ONLY approved files into database/migrations with monotonically increasing sortable filenames. Never edit a file already applied. Held files remain outside the Docker copy.
3. Deployment image copies database/migrations into /app/database/migrations.
4. Container starts npm run migrate, with runtime DATABASE_URL and existing DB_SSL settings.
5. Migration runner takes a session-level PostgreSQL advisory lock shared by all deployment instances. schema_migrations(filename primary key, checksum, applied_at) records committed files. LF-normalized checksums detect changed applied migrations. Repeat runs skip applied files; concurrent processes serialize.
6. Each pending file runs in its own transaction; its ledger row commits together with schema changes. On failure the file rolls back, process exits nonzero and Docker's && prevents npm start. Earlier committed additive files remain and are skipped on retry. Migration failure/connection logs expose safe error codes, not provider messages or credentials.
7. Runner conservatively rejects new SQL containing DROP TABLE/SCHEMA/DATABASE, TRUNCATE, DELETE FROM or DROP COLUMN after comment removal. This guard is not a full SQL parser or a substitute for human review; functions, UPDATE statements and semantic breaking changes still require review. No automatic destructive migration support was added.

## Coolify deployment checklist (no manual SQL)

- Back up PostgreSQL through the existing backup facility and verify restore availability.
- Use Dockerfile build, repository root build context, Dockerfile path backend/Dockerfile; preserve image CMD. Do not override startup with node server.js or npm start alone. If using a custom start command, it must be npm run migrate && npm start.
- Keep runtime DATABASE_URL configured securely and DB_SSL appropriate to the existing connection. Database role must have required DDL rights. No new variables.
- Review the diff and approved migration list. New file for this feature: 202611250001 only. The runner will also apply ANY older approved database/migrations files not already in production's schema_migrations ledger; production ledger was not inspected, so do not assume this is the only pending file there.
- Push/deploy only after owner authorization. Watch startup logs for [migrate] applied: 202611250001_notification_popup_acknowledgment.sql, or already applied on repeat, before normal server startup. A failed migration must leave the new container unhealthy/stopped, not serving traffic. Keep the previous compatible release available.
- Verify synthetic staging students first: reschedule future session, confirm bell and popup, acknowledge, reload/another device, reschedule again. No real student transactions required.

With these settings, approved database changes run automatically on deployment; no manual PostgreSQL connection is needed. Existing database must already have its baseline schema. This is not a fresh-database bootstrapper.

## Popup behavior

Same notification row as the bell, independent popup acknowledgment. JWT-owned list/ack APIs. Current access is rechecked; started, completed, cancelled, deleted, superseded and unauthorized sessions are suppressed. New title/time comes from live_sessions formatted in Africa/Tunis. Existing title/message is not rewritten. Events show oldest first, only latest relevant reschedule per session. Exact reschedule retries create no new row.

X, J'ai compris, Escape and Voir le calendrier persist acknowledgment first. Failed acknowledgment keeps the popup with retry error. Backdrop clicks do nothing. Browser close, hidden tab or navigation without acknowledgment leaves it pending. Visibility/pageshow/Turbo events revalidate; no polling. Other open dialogs defer presentation. Already open second-device popups clear on their next focus/visibility fetch; no push/WebSocket infrastructure. Calendar button deep-links using session and date.

## Local verification

56 affected tests passed with disposable PostgreSQL and mocked Zoom/R2. Tests include concurrent real migration invocations, repeat skip, actual SQL failure rollback/ledger preservation, destructive SQL rejection, per-user acknowledgment persistence, separate bell read status, ownership, reschedule retries and supersession/cancellation. Browser checks: 320/375/390/430/768/1440 widths, safe synthetic HTML-like title, touch target/overflow, Escape, failed acknowledgment retry, refresh persistence and calendar navigation. No physical mobile-device or real Zoom test claimed.

No production build script exists: vanilla JS/EJS uses syntax checks and runtime/browser tests, not a bundler build. Production Docker image was not built in this run. Full repository regression is not claimed; results refer to the affected set.

## Rollback

Roll back to a compatible previous application image and retain additive columns, index and schema_migrations rows. Do not run a destructive down migration or reset data. Existing bell notifications continue working. Already acknowledged popups retain their stored timestamps. If a migration fails, fix the unapplied migration and redeploy; never change an applied migration checksum. External Zoom success followed by DB failure still requires existing reschedule reconciliation; no distributed transaction is claimed.
