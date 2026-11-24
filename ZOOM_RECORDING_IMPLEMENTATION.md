# Zoom recording reliability implementation — 2026-11-24

Local implementation only. Production migration, deployment and activation are NOT authorized or performed. The original audit is a historical baseline; this document describes its fixes.

## Changes

- Persistent `zoom_recording_occurrences` binding uses the exact occurrence UUID. Scheduled time is only a first-association candidate; subsequent segments use the binding even if schedules change. Ambiguous/unmatched occurrences require administrator resolution. Existing non-null associations cannot be silently moved; conflicting legacy associations are preserved and blocked for manual investigation.
- Event intake commits all selected segments in one transaction. Intake, resolution, settlement and publication serialize on an occurrence advisory transaction lock. File-ID uniqueness deduplicates webhook delivery and historical recovery, including discarded files.
- Every new imported recording waits in `needs_review`, including single segments. No worker updates `live_sessions.replay_url`. Existing published records and replay pointers stay unchanged. Publication checks one occurrence, its bound session, stored status, deletion state and R2 object presence, then preserves chronological part ordering.
- Each worker claim has a random token. Heartbeats, import metadata writes, failure transitions and settlement require that token and an unexpired lease. A 30-second heartbeat runs during slow storage/download operations. Reclaimed claims use a distinct hashed-file-ID + claim-token object key; an old worker cannot overwrite the current claim's object.
- Each transfer is recorded durably. Expected size is saved before multipart completion. On retry/restart, a matching HEAD result reconciles an already completed object without another download. Abandoned multipart uploads are aborted by their specific key/upload ID. Unknown or superseded completed objects are retained, never swept automatically.
- Deletion first commits intent. Pending deletion blocks preview, publication, manual attachment and retry. A recoverable worker operation removes only explicitly requested unpublished objects; published/referenced keys are rejected. An R2 success followed by DB failure leaves the intent pending, so the next pass safely retries. Original Zoom cloud recordings are never deleted.
- Expired/unauthorized download responses refresh metadata by exact occurrence UUID and original file ID before retrying. Downloads validate every HTTPS redirect, reject credentials/nonstandard ports/private DNS answers, pin the validated address, limit redirects and never forward OAuth to redirected storage.
- `/api/live/admin/features` retains the original fields and adds `recordingDiagnostics`: `missing_migration`, `invalid_schema`, `disabled`, `missing_configuration`, `worker_not_running`, or `ready`. Unavailable database detection returns 503. The admin distinguishes API/network failures from missing migration. Readiness checks required columns, critical types and valid single-column unique indexes.
- Structured JSON logs record readiness, webhook receipt, occurrence association, queued import IDs, completed/reconciled uploads, retry, review, publication and deletion. Logs contain internal IDs/counters, not credentials, signed URLs, raw webhook bodies, meeting titles or student content.

## Admin/API workflow

Existing popup, preview, checkboxes, resources, manual MP4 and external-link actions remain.

| Endpoint (all under `/api/live`, all requireAdmin) | Contract |
|---|---|
| `POST /admin/recordings/discover` | `{sessionId, occurrenceUuid}` → safe completed MP4 metadata and existing import status. Read-only Zoom lookup. |
| `POST /admin/recordings/recover` | `{sessionId, occurrenceUuid, fileIds}` → validates fresh Zoom metadata and session meeting ID, explicitly binds occurrence and queues only selected files. Duplicate files are not reimported. |
| `POST /admin/recordings/resolve` | `{sessionId, occurrenceUuid}` → resolves unassigned occurrence; does not publish or alter previous non-null associations. |
| `POST /admin/recordings/publish` | Existing `{sessionId, importIds}`. Mixed occurrences, pending transfers and pending deletion are rejected. |
| `POST /admin/recordings/:id/retry` | Existing contract; rejects disabled feature and pending deletion. |
| `DELETE /admin/recordings/:id` | Returns 202 `{success:true,pendingDeletion:true}` after durable intent; eventual deletion, not immediate synchronous completion. |

The existing manager adds “Rechercher une occurrence Zoom”. Enter the exact UUID, inspect timestamps/sizes, select files, then import. Preview and publish after upload. Unassigned rows now offer association separately from publication. Recovery/discovery have a per-admin, per-process limit of ten requests per minute. No bulk history scan exists or runs automatically.

## Held migration for review

`database/pending-migrations/202611240001_zoom_recording_reliability.sql`:

1. Create occurrence bindings, seeding unanimous legacy associations; retain conflicts explicitly.
2. Add `claim_token` and `delete_requested_at` to the existing imports table.
3. Create transfer-attempt ledger with unique object keys.
4. Create durable deletion-intent queue.

Dependency: existing `live_sessions`, `users`, `gen_random_uuid`, then `202611200003_create_zoom_recording_imports.sql`, then this migration. No direct dependency on 002/004 or refresh-token migration. The separate multi-audience feature still requires 002 before 004 if not already approved/applied. Do not promote unrelated pending files. No migration renames/deletes existing records or R2 keys. Pending files remain outside Docker's applied migrations.

## Exact Coolify activation procedure — only after separate approval

1. First reproduce with synthetic data in designated staging. Verify the reviewed build and database target; obtain database backup and record migration checksums/current replay pointers/import counts. Do not paste secrets into logs/chat.
2. Set `ZOOM_RECORDING_IMPORT_ENABLED=false`. Stop every old recording-capable application replica before migration/cutover; do not overlap the unfenced old worker and this worker.
3. After owner approval, promote **only** missing approved 003 and 202611240001 files into `database/migrations`. If 003 was applied manually, verify actual schema and reconcile migration-runner history/checksum before rollout; do not invent an applied record without evidence.
4. The existing Docker startup runs `npm run migrate && npm start`. Confirm that 003 precedes 202611240001 and both complete. Do not run unrelated held migrations. Keep application startup blocked on migration failure.
5. Preserve the existing values of `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_WEBHOOK_SECRET_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET` and the existing PostgreSQL configuration. No new credential names are introduced; Gemini is untouched. Private R2 credentials need multipart PUT/complete/abort, HEAD/GET and deletion permissions for explicit unpublished deletion. Do not make the bucket public.
6. Start this compatible build with imports disabled. Authenticated `GET /api/live/admin/features` must show `schema:ready,status:disabled`. An invalid/missing schema must be corrected before activation. Existing student replays should still work.
7. Configure/validate Zoom webhook as below. Set `ZOOM_RECORDING_IMPORT_ENABLED=true` and restart the backend. Confirm startup `event:readiness,status:ready,workerRunning:true` and `[Recordings] Zoom recording import worker started`. The features response must also report ready. Ready confirms local configuration/schema/worker checks, NOT successful Zoom credentials or an actual R2 transfer.
8. Complete the real staging checklist below; obtain separate production rollout approval. Existing recordings are not bulk imported when enabled. Recover a specific old occurrence explicitly through the manager.

## Required Zoom configuration

- The configured account must support cloud recording; meeting creation retains `auto_recording:cloud`.
- Enable event subscription `recording.completed` to `https://<backend-public-domain>/api/zoom/webhook`. Use the existing `ZOOM_WEBHOOK_SECRET_TOKEN` for that subscription and complete endpoint URL validation. Preserve the raw request body through the proxy; do not add browser/JWT authentication to this endpoint.
- S2S OAuth app needs cloud recording read permissions, including `cloud_recording:read:list_recording_files:admin` (or applicable legacy `recording:read:admin`), plus its existing meeting scopes. Confirm actual app/account permissions in Zoom; meeting creation alone does not establish recording access.
- Recovery uses `GET /v2/meetings/{occurrenceUUID}/recordings`, never a reusable numeric meeting ID. UUIDs starting `/` or containing `//` are double encoded as required by [Zoom's official API documentation](https://developers.zoom.us/docs/api/meetings/).

## Real Zoom/R2 staging checklist — still required

1. Use a synthetic course, admin and authorized/unauthorized synthetic students, and private staging bucket. Confirm no production student information is involved.
2. Create a platform session, host it, start/stop recording twice, then end it. Wait for Zoom processing. Record the exact occurrence UUID, distinct file IDs and webhook delivery status in the Zoom console.
3. Verify signed webhook accepted; logs connect `jobs_queued.importIds` to `upload_completed` and `review_required`. Confirm two separate private R2 objects and HEAD sizes. No replay should appear to students before publication.
4. Preview both segments, publish one, then publish both after replacement confirmation. Check Partie 1/2 order, course/session linkage, Dashboard/Calendar deduplication and existing offer/course/invitation permissions.
5. Repeat with the same recurring meeting ID and a different UUID. Cross-occurrence selection must fail. Reschedule the original session and confirm late segments remain with its UUID binding.
6. Resend the same webhook; confirm no duplicate rows/objects. Import one selected historical occurrence twice; second queue count must be zero. No unrelated history may be imported.
7. Interrupt an upload; restart the worker and verify completion/reconciliation. Exercise expired download metadata and actual CDN redirects. Check that pending/failed imports never generate student playback URLs.
8. Publish a manual MP4/external replay, then receive another Zoom segment. Verify current replay is retained. Restore reviewed Zoom parts explicitly; files must remain intact.
9. Request deletion only for an unpublished synthetic import. Simulate R2/DB failure and verify durable recovery. Published or referenced keys must be rejected. Confirm original Zoom cloud files remain.
10. Check mobile 360/390 and desktop 1440, keyboard focus/Escape, upload file picker, diagnostics/error states, resources and signed playback expiry. Signed replay/preview URLs retain the existing one-hour TTL and remain bearer links until expiry; issuance rechecks authorization.

## Rollback

- Disable `ZOOM_RECORDING_IMPORT_ENABLED`, stop all recording workers/replicas, then restart a compatible build with imports disabled. Preserve the queue, occurrence bindings, transfer ledger, deletion intents, existing replay pointers and R2 files.
- Do not drop the additive tables/columns or remove objects as a rollback. Completed deletion is irreversible for that R2 object; originals remain in Zoom. Pending intents should be resumed only with this compatible worker after investigation.
- Do not re-enable an older unfenced worker or its automatic single-segment publisher. If an older application must serve student pages, block its admin recording mutation endpoints and webhook intake; it does not understand deletion intents/occurrence fencing. Prefer a known compatible build instead.
- Preserve schema migration files/checksums already applied. Repair forward; restore backups only through an independently approved recovery plan.

## Limitations

No production schema, Coolify logs, real webhook, OAuth permissions or actual R2 transfer has been verified here. A completed stale-attempt object may remain unreferenced; its ledger is preserved, and there is intentionally no destructive bucket sweep. Conflicting legacy associations are not automatically rewritten. DNS policy may reject a provider CDN using unsupported/private address ranges; investigate actual staging redirects rather than weakening the policy. Recovery rate limiting is process-local. Rollout must stop old workers before activating fencing.

## Previous-phase regression evidence (before on-demand/Corbeille extension)

- Final focused command: `node --experimental-vm-modules --test --test-concurrency=1 tests/zoom-recordings.test.js tests/recording-reliability.test.js tests/session-manager.test.js tests/live-multi-audience.test.js tests/security.test.js`, with disposable loopback PostgreSQL and synthetic Chrome fixtures. **81 passed, 0 failed, 0 skipped.**
- New cases cover durable UUID association after rescheduling, distinct recurring occurrences, ambiguous resolution, atomic intake rollback, concurrent intake/worker claims, duplicate/late segments, stale claim settlement/failure, lease renewal during a slow R2 part, completed-upload reconciliation, expired metadata, private redirects/DNS pinning/token stripping, durable deletion after DB failure, deletion retry backoff/isolation, feature disablement and invalid schema, exact UUID recovery, mixed-occurrence publication rejection, legacy records and student authorization.
- Existing and new browser cases ran at **360px, 390px and 1440px**, including discovery/selected recovery, mixed-occurrence checkbox protection, network failure versus migration diagnostics, disabled state, popup size/focus/Escape, resources, manual upload and external replacement. Upload handlers use synthetic File/DataTransfer events; native OS file dialogs and real cloud media were not exercised.
- Full package test list was also executed serially: **115 tests, 112 passed, 3 failed, 0 skipped** (112.3 seconds). Three failure entries are one existing offer-card text/badge assertion at timed-offers.test.js:406 plus its two failed parent tests: `terms` and `monthlyTerms` expected old text. No offer/student-card implementation was changed. This unrelated full-suite failure remains unresolved and is not hidden by the focused result.
- The first parallel full run was interrupted by local PostgreSQL backend termination/recovery, and a new browser test exposed an initial-refresh race. The popup now disables stale panel actions during refresh, and the serial browser cases pass. The complete full run was rerun after database recovery; new recording tests were rerun after final fencing/deletion changes.
- npm was unavailable on PATH; the package.json test command was executed directly with Node and serial test scheduling. No live Zoom/R2/Gemini requests were made. Production readiness is **not confirmed**: migration review, real Zoom/R2 staging evidence and the unrelated full-suite failure remain outstanding.

## Files changed

| Area | Files |
|---|---|
| Existing queue/worker and helpers | `backend/services/zoom-recordings.js`, `backend/services/recording-worker.js`; new `backend/services/recording-jobs.js` |
| Readiness and startup | `backend/services/live-features.js`, `backend/server.js` |
| Existing APIs | `backend/routes/live.js`, `backend/routes/zoom-webhook.js` |
| Zoom/R2 safety | `backend/utils/zoomClient.js`, `backend/utils/r2Utils.js` (safe error-name logging); new `backend/utils/recording-download.js` |
| Existing admin interface | `backend/public/admin/pages/sessions.html`, `backend/public/admin/js/session-manager.js` (cache version 3) |
| Held migration | `database/pending-migrations/202611240001_zoom_recording_reliability.sql` |
| Tests | `backend/tests/zoom-recordings.test.js`, `backend/tests/live-multi-audience.test.js`, `backend/tests/session-manager.test.js`, `backend/tests/security.test.js`, `backend/tests/fixtures/session-manager-fixture.js`; new `backend/tests/recording-reliability.test.js`; `backend/package.json` test list |
| Documentation | `DATABASE_SCHEMA.md`, `ARCHITECTURE.md`, `BUSINESS_RULES.md`, `IMPLEMENTATION_PLAN.md`, `CURRENT_STATE.md`, `CHANGELOG.md`, this report. The accepted `ZOOM_RECORDING_AUDIT.md` is retained unchanged as historical evidence. |

## Current extension: event-driven search and 48-hour Corbeille

This section supersedes the earlier exact-UUID-only discovery UI and immediate deletion workflow. The upload pipeline remains unchanged.

- **Rechercher sur Zoom**: selected session → known bound UUID; if unknown, one on-demand `GET /past_meetings/{meetingId}/instances`. Multiple candidates require an explicit choice. Then fetch exact occurrence recordings. A collapsed optional UUID field remains available for manual historical lookup.
- **Actualiser**: local statuses/features/session/resource APIs only. It never invokes Zoom discovery.
- **Importer**: explicitly selected, completed, missing MP4 files only, using the existing queue. Duplicate file IDs remain deduplicated. Published replay pointers remain unchanged until explicit publication.
- **Réessayer**: existing specific failed import retry, with six bounded attempts and feature-flag enforcement.
- **Corbeille**: local soft-deleted segment list and explicit restore. Discovery reports deleted status and cannot restore or reimport these IDs. Restoration preserves the object key/status, returns to review and never publishes automatically.

New helper `backend/services/recording-discovery.js` is called only by the admin search endpoint. It coalesces concurrent identical requests and caches results for 15 seconds; no timers/scans/Zoom polling are introduced. `zoomClient.js` honors provider Retry-After across metadata/instance requests, and existing per-admin search limits remain. The worker still wakes to process local queues, with at most six retries per upload/deletion job.

Discovery returns states/messages: available (“2 segments disponibles.”), processing (“L’enregistrement est encore en cours de traitement.”), empty (“Aucun enregistrement disponible sur Zoom.”), imported (“Tous les segments sont déjà importés.”), choose_occurrence (“Plusieurs occurrences trouvées. Veuillez sélectionner la séance correspondante.”), and trash. Network errors say “Impossible de contacter Zoom. Veuillez réessayer.” UI search/import states use “Recherche des enregistrements…” and “Import en cours…”.

**Additional held migration:** `database/pending-migrations/202611240002_recording_trash_retention.sql`, after 003 → 202611240001. Adds purge_after/restored_at/restored_by, a database minimum-48-hour constraint and append-only `zoom_recording_deletion_events`. Existing unfinished deletion intents receive at least 48 hours from migration execution. Published pointers/objects are not altered. No pending migrations were promoted or run in production.

Physical deletion cannot start before purge_after. Restore and purge serialize under row locks; once physical deletion commits, restoration is refused. At six purge failures, retained files require administrator intervention (restore/re-request if appropriate). This is a minimum retention, not a promise of deletion exactly at hour 48. Files deleted physically by older code before this migration cannot be restored locally.

**Additional API contracts:** discover accepts `{sessionId}` with optional `occurrenceUuid`, and may return `occurrences` for confirmation. `GET /api/live/admin/recordings/trash?sessionId=…` and `POST /api/live/admin/recordings/:id/restore` requireAdmin. No storage URLs or credentials appear in discovery/trash responses. Restore is local and remains available with imports disabled when schema is ready.

**Activation changes:** review/promote 202611240002 separately, stop old workers, apply after 202611240001 and restart. Keep imports disabled until schema readiness checks pass. Add/confirm Zoom `meeting:read:list_past_instances:admin` (or applicable `meeting:read:admin`) alongside the recording-read scope. No new environment variables or credential changes are required. [Zoom documents the past-instances endpoint, required scopes and 15-month history limit](https://developers.zoom.us/docs/api/meetings/). Older recordings require a known exact UUID and availability in Zoom; standalone sessions without an associated Zoom meeting ID cannot be searched by title.

**Immediate post-deployment staging test using existing recordings:** open an older platform session with its Zoom meeting ID → Rechercher sur Zoom → choose the correct dated occurrence if prompted → verify segment dates/durations/sizes/statuses → select missing segments → Importer → Actualiser until À vérifier → preview → publish explicitly. Repeat search/import to verify deduplication. Soft-delete an unpublished synthetic segment, verify discovery directs to Corbeille, restore it and verify the original object key returns without upload/publication. No new live meeting is required. Verify ordinary Actualiser calls never reach Zoom. Production approval remains separate.

Rollback keeps both additive migrations and all retained objects. Disable imports and stop workers; use only a build that understands the 48-hour retention and deletion intents. Never roll back to the immediate-purge worker with imports enabled. Original Zoom cloud recordings remain untouched.

### Current extension validation

Final focused suite: **84 passed, 0 failed, 0 skipped**, in 18.7 seconds, using disposable PostgreSQL and mocked Zoom/R2. Chrome passed at 360px, 390px and 1440px, including on-demand search, duration/status metadata, Corbeille restore, no horizontal scrolling and Actualiser making no discovery calls. Tests additionally verify pre-webhook instance lookup, ambiguous confirmation, concurrent-search coalescing, Retry-After, deleted-ID rejection, database 48-hour constraint, idempotent restore/audit and preserved object keys/review status. New retention migration was applied/reapplied only in generated disposable databases. No live provider requests were made. The full project suite was not rerun for this extension; the previous-phase unrelated offer-card failure remains documented above.

Current additional/changed files include new services/recording-discovery.js and pending migration 202611240002, existing routes/live.js, utils/zoomClient.js, services/recording-jobs.js, services/live-features.js, existing admin session JS/HTML, recording/API/browser/security tests and project documentation. No new import pipeline, public bucket URL, production activation or credential modification.

## Deployment packaging approval — 2026-11-24

The owner has now approved promoting ONLY 202611200003, 202611240001 and 202611240002 to database/migrations. Earlier held/pending references in this report describe the implementation phase and are superseded by this packaging decision. SQL is unchanged. Migration order is 003 → 202611240001 → 202611240002. The original SQL header comments are retained to preserve the reviewed checksums. Refresh-token and live-audience migrations remain pending. No production migration, push, deployment or feature activation is authorized by this commit preparation. Docker startup will automatically run the promoted migrations even with imports disabled; stop old workers and take a backup before any later deployment.

Post-promotion verification: 84 focused tests passed, zero failures/skips (20.1s), including the startup migration runner against disposable PostgreSQL. Exactly three recording migrations are promoted and their reviewed normalized SHA-256 checksums are unchanged. The refresh-token and two live-audience migrations remain pending. No production commands, push or deployment occurred.

## Admin recording presentation refinement — 2026-11-24

Occurrence cards replace the UUID dropdown and are newest-first. Known topic/session name and date/time are displayed; duration/count/size appear only when supplied or explicitly labeled as local metadata. UUIDs remain in closed technical details. Shared recording-ui.js renders chronologically numbered parts, HH:MM:SS duration, Mo/Go size, start/end, MP4/view metadata, statuses, safe preview/action controls and partial/unknown totals. Import/publication buttons show selected counts. Progress uses existing bytes_transferred/file_size or an indeterminate element, updated by local refresh only. Corbeille is a compact native details section with its count from the existing local endpoint; restore/48-hour retention are unchanged.

Only additive API metadata projection was changed (session title, available discovery details and MP4 format); no extra Zoom calls, database migration, worker, queue or access change. Manager JS v5, CSS v3, new recording-ui.js v1 must ship together. Final affected tests: 86 passed, zero failed/skipped, with synthetic Chrome 360/390/1440 and disposable PostgreSQL/mocked Zoom/R2; screenshots visually inspected. No live provider or production UI verification, push or deployment.
