# Zoom cloud recording auto-import audit — 2026-11-24

Scope: existing implementation only. No application code, schema, credentials, or production data changed. Production availability remains unverified.

## Executed verification

Command, from backend: `node --experimental-vm-modules --test tests/zoom-recordings.test.js tests/session-manager.test.js tests/live-multi-audience.test.js`.

Final run: **29 tests passed, 0 failed, 0 skipped**. PostgreSQL was disposable, loopback-only port 55481, with synthetic data; stopped after testing. Zoom downloads and R2 operations were mocked. Chrome exercised synthetic local fixtures at 360px, 390px, and 1440px. These results are not hosted staging, real Zoom, or real R2 evidence. Initial sandbox runs failed to reach local PostgreSQL; the final run used approved elevated local execution.

Coverage includes raw-body signatures, stale/invalid signatures, URL validation, duplicate deliveries, disabled webhook, time-based recurring-session matching, multiple segments, existing replay preservation, multipart transfer, size mismatch, retry, restart recovery, admin manager actions, and multi-audience authorization/compatibility. The tests do not establish durable UUID matching or stale-worker fencing.

## Implemented behavior

- `routes/zoom-webhook.js`: raw-body webhook mounted before JSON parsing in server.js; recording.completed queues work. Missing configuration/disabled import returns 503. Other signed events are acknowledged.
- `services/zoom-recordings.js`: verifyZoomSignature checks HMAC-SHA256 using timingSafeEqual and a five-minute timestamp window. Unique zoom_file_id prevents repeated imports, including discarded-file re-delivery.
- selectRecordingSegments selects one preferred MP4 view per recording_start, preserving separate start/stop segments in chronological order. It intentionally does not retain every parallel camera/screen view.
- transfer streams 16 MiB multipart uploads, checks download size and R2 HEAD ContentLength, aborts failed multipart uploads, and uses a two-minute download stall timeout. Queue claims use SKIP LOCKED, a 15-minute lease and six-attempt backoff. Original Zoom recordings are never deleted.
- settle locks the session; a matched single segment with no existing replay can publish automatically. Multiple queued segments, ambiguous matching and existing replay cases require review.
- routes/live.js admin recording endpoints use requireAdmin. Publication accepts only stored needs_review/published rows, locks rows/session and orders selected parts by recording_start/id. Pending/importing/failed rows cannot be selected for publication through this route.
- Student replay parts are attached after session authorization and only when the current replay points to a published import. Private R2 links expire; authorization is checked when issuing them, not continuously after issuance. Existing replay URL TTL is 3600 seconds.
- Manual MP4/external replacement keeps imported objects and hides inactive Zoom parts instead of deleting them. UI replacement confirmation exists. Unpublished-segment deletion is an explicit separate action.

## Findings

### High — occurrence UUID is stored but does not determine session association

queueRecordingEvent queries sessions by zoom_meeting_id and chooses by scheduled time with a one-hour margin. It stores zoom_meeting_uuid but does not bind an occurrence UUID to a session. A delayed/rescheduled recurrence can therefore match incorrectly or remain unassigned. The admin publish query likewise checks meeting ID/session assignment, not a common occurrence UUID; unassigned rows from different occurrences can be combined manually.

Fix direction: persist a unique occurrence-to-session binding, reuse it for subsequent segments, and require explicit admin resolution for ambiguous/unbound occurrences. Permit intentional reassignment only through a validated admin action. Propose any additive migration before executing it; preserve existing rows and replay pointers.

### High — expired worker leases are not fenced

heartbeat, transfer metadata writes and settle do not carry a unique claim token. If a slow worker resumes after another process reclaims its lease, both can update the same job/object and settle it. SKIP LOCKED prevents simultaneous initial claims, not stale-owner writes. Existing restart tests cover an abandoned worker, not two simultaneously running owners.

Fix direction: use claim identity/version checks for every state transition and final settlement, with lease renewal covering storage operations. Add two-worker regression tests before scaling replicas. Do not remove existing recording objects during recovery.

### Medium — event queue insertion is not atomic

Each segment is inserted independently. Another worker can observe only the first inserted row and auto-publish it before the rest of that event are inserted. Separately delivered later segments pose the same completeness issue. Existing tests queue the whole event before running the worker.

Fix direction: insert each event's selected segments in one transaction, serialize occurrence intake and settlement, and require review when occurrence completeness is uncertain. Test polling concurrent with event intake and late-arriving segments.

### Medium — activation diagnostics are incomplete/misleading

GET /api/live/admin/features reports table detection, not whether imports are enabled or the worker is running. sessions.html loadFeatures silently leaves recordings=false on HTTP/network errors, resulting in the migration message even when the table may exist. Detection checks table existence only, not the required schema/index shape. Admin retry calls worker.kick even when ZOOM_RECORDING_IMPORT_ENABLED is false.

Fix direction: expose non-secret schema/flag/worker readiness separately, display request errors accurately, and define/enforce disabled-mode behavior for retry. Add correlation IDs and safe queue/import/publish success logs; current logs primarily show worker startup and failures.

### Medium — R2 deletion cannot roll back with PostgreSQL

DELETE /admin/recordings/:importId checks references and forbids published/in-flight deletion, but deletes the R2 object before committing its database tombstone. A subsequent DB failure can leave a needs_review row pointing to a missing object. A crash after multipart completion can also leave a stored object without a successfully settled row.

Fix direction: durable deletion intent/retry and reconciliation, with publication disabled for pending deletion. Preserve referenced/published objects and Zoom originals. Do not perform blanket bucket cleanup.

### Operational gaps

- No automatic historical Zoom discovery/backfill exists. Enabling imports does not fetch old recordings. Re-delivery or an explicitly approved occurrence-UUID recovery action is required.
- Retry reuses the stored download_url; it does not refresh recording metadata. Deleted/unavailable files can require manual investigation.
- Admin import listing excludes rows created more than 120 days ago, even if still relevant; records/objects are not deleted by that filter.
- Recording object keys sanitize/truncate the file ID without a collision-resistant suffix or unique object-key constraint. This is a theoretical collision risk for unusual IDs, not a reproduced Zoom failure.
- Initial download URLs are restricted to HTTPS zoom.us hosts. Redirects drop the bearer token and require HTTPS initially; subsequent redirects use fetch follow behavior. No explicit private-network/redirect-target restriction is implemented.

## Migration and activation evidence

`database/pending-migrations/202611200003_create_zoom_recording_imports.sql` defines the queue table, unique file ID, session FK ON DELETE SET NULL, statuses and queue/session/UUID indexes. It is still held in the repository. Docker copies only database/migrations; the normal migration runner does not apply pending files.

003 requires the existing live_sessions table and gen_random_uuid support. It does not directly require 002. For the separate multi-audience feature, apply 002 before 004; do not promote unrelated pending migrations. Existing tests exercise 002+003 and 002+003+004 with previous baseline migrations.

Neither repository placement nor the screenshot proves the production schema. Obtain authenticated /api/live/admin/features, sanitized Coolify startup logs and read-only schema/index evidence before deciding what is missing. Detection happens at startup, so activation requires restart.

Required names (no values): ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_WEBHOOK_SECRET_TOKEN, ZOOM_RECORDING_IMPORT_ENABLED, CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET, and existing PostgreSQL connection configuration. LIVE_MULTI_AUDIENCE_ENABLED controls the separate audience feature. Zoom must deliver signed recording.completed events to /api/zoom/webhook, permit cloud recording and grant recording-read scopes to the configured app. Working meeting creation alone proves none of these recording prerequisites.

## Safe next steps and verdict

1. Collect read-only production feature response, schema/index state, flags and sanitized startup/webhook delivery logs. Never disclose credential values, raw download URLs, OAuth tokens or webhook bodies.
2. Approve targeted occurrence association, fencing, intake and diagnostics changes; validate regressions using disposable PostgreSQL first. Review any additive migration separately.
3. In designated staging, verify one genuine signed Zoom occurrence with two recording segments, both private R2 objects, preview, selected publication, retry and student authorization. Confirm expected UUID, session ID, import IDs, ordering, sizes and no overwrite.
4. Reconcile existing pending/failed/unassigned rows and old recordings by explicit occurrence UUID; do not reimport indiscriminately or delete objects.
5. Obtain separate owner approval before production migration/deployment/activation. Keep backups and a compatible build; disable intake/worker and stop active workers for rollback, retaining queue rows and stored objects. Existing signed links remain usable until their expiry.

**Verdict: BLOCKED for declaring production auto-import verified/ready.** Local regression passes; live activation evidence and the concurrency/occurrence safeguards above remain outstanding. Existing preview/selection/publishing implementation should be retained.
