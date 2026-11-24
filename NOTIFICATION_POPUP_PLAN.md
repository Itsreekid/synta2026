# Important rescheduling popup — proposed implementation, 2026-11-25

Status: approved 2026-11-25, implemented and verified locally. See NOTIFICATION_POPUP_DEPLOYMENT.md for final results and deployment procedure.

## Current architecture

Vanilla JavaScript, EJS and shared user.js/user.css; permanent header survives Turbo navigation. Existing cookie JWT middleware protects user notification APIs. Admin reschedule locks live_sessions and transactionally inserts one existing notifications row per currently entitled student, using liveSessionAccess. Same-date retry does not insert again. Bell read state is is_read, which cannot also mean explicit popup acknowledgment.

## Exact migration

Review database/migrations/202611250001_notification_popup_acknowledgment.sql. Three nullable columns on notifications only: popup_session_id (FK live_sessions, SET NULL on delete), popup_scheduled_at (rescheduling destination snapshot), popup_acknowledged_at (per-student acknowledgment time). Partial pending index. No separate event infrastructure or table. Existing notification ID identifies each student's event and is the acknowledgment target. No historical backfill and no modification of is_read.

Dependencies: baseline live_sessions and database/migrations/202611050001_create_notifications.sql. No unrelated pending migration is promoted. Existing optional access schemas remain detected by existing access helper.

## Backend changes after approval

- In live.js, populate popup_session_id and popup_scheduled_at on the SAME notifications rows inserted by a successfully committed reschedule. Preserve row locking, expectedStartTime conflict check and exact-retry no-op.
- GET /api/user/notifications/important, authApiMiddleware: derive user from req.user.id; return pending relevant rows in chronological order. Recheck liveSessionAccess at read time. Require future scheduled session, matching current scheduled_at and latest event for that student/session. Suppress cancelled, deleted, finished, started, superseded or unauthorized sessions. Read current session title and date, format French in Africa/Tunis. Never return Zoom host URLs.
- POST /api/user/notifications/:id/acknowledge, authApiMiddleware: ownership-constrained, idempotent COALESCE timestamp update of this popup; preserve the bell notification and its independent is_read flag. UUID validation, no body user IDs.
- Migration unavailable: leave bell notifications and rescheduling working; popup stays dormant. Use schema capability detection with no runtime DDL.

## Frontend changes after approval

- Reuse shared student user.js/user.css and existing calendar route. One native dialog at a time, safe textContent, soft navy/orange/white design, calendar icon, focus restore, focus trap, scroll containment, safe-area padding, 100dvh-constrained scrollable body, reduced-motion support.
- Fetch on initial page load, Turbo page arrival, pageshow and visible return; deduplicate in-flight requests. No timer polling and no new infrastructure. Defer while another dialog is open. On hide/navigation, close transient UI without acknowledging; recheck relevance on return. Backend suppresses stale sessions.
- Voir le calendrier, J'ai compris and X persist acknowledgment before advancing/navigating. Escape behaves like J'ai compris. Backdrop does not dismiss. Failed acknowledgment keeps popup with retry error; never claims success through localStorage. Browser close without acknowledgment leaves it pending. Cross-device subsequent fetch sees persisted acknowledgment; an already open other-device dialog may remain until refresh/refocus.
- Process relevant events chronologically, no stacking. A newer reschedule supersedes an older pending popup for the same session; bell history stays intact.
- Calendar navigation uses existing session query/deep-link behavior where supported; extend focus handling narrowly if necessary, without changing routing.

## Validation and rollout

After approval: run held migration only in disposable local PostgreSQL; test owner isolation, cross-account and repeat acknowledgment, unchanged bell read state, repeat reschedules/retries, duplicate/concurrent operations, superseded/cancelled/unauthorized sessions, missing schema, mobile 320/375/390/430/tablet/desktop, keyboard/Escape, failed requests and calendar navigation. Run relevant regressions. Backend package.json has no production build script: use syntax/template/runtime checks and report this honestly.

No environment variables are required. No production deployment/migration authorized. Rollout sequence after separate production approval: backup, additive migration, compatible app release; old build can ignore nullable columns. Rollback app only and retain columns/acknowledgments. No destructive down migration.
