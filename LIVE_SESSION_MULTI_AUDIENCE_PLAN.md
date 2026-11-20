# Live session multiple audiences

Status — owner approved local implementation and disposable database validation. Completed on 2026-11-21. Production rollout remains held.

## Confirmed behavior

One session and Zoom meeting serves the union of active selected-offer holders, active selected-course enrollees and individually invited students. At least one offer or course is required. Invitations grant only session joining, replay and session resource access. Course lesson access remains governed by the existing course entitlement checks.

## Database proposal

Run held migration `202611200002_extend_live_session_access.sql` first, then proposed `202611200004_live_session_multi_audience.sql`, initially on disposable PostgreSQL.

The second migration adds a default legacy policy and two indexed association tables. Existing rows and course links remain untouched. New OR sessions keep the old primary course/offer fields empty and store selections in the association tables. The primary course column becomes nullable for this purpose. Deferred constraints require a course or offer, and link writes lock the session row before checking final selections. Deleting the session cascades its links. Selected courses and offers cannot be deleted until explicitly unlinked. Revoking a student's enrollment does not delete a session or change other students' access.

No changes to purchases, grants, enrollments, progress or resource ownership are proposed.

## Backend implementation

- Extend startup feature detection and retain the existing legacy authorization branch. Add an OR branch in the shared `liveSessionAccess` fragment. Enforce active enrollment, active offer entitlement and invitation matching server-side.
- Extend the existing admin-only schedule endpoint with `courseIds`, `offerIds`, and `grantedStudentIds`. Keep the legacy payload available. Validate, deduplicate and verify every ID, require at least one course or offer, and create one session and its associations in a transaction. Compensate Zoom creation if database persistence fails using the existing cleanup path.
- Use `EXISTS` for audience checks so matching multiple selections produces one dashboard/calendar result. Replace course inner joins on session lists with nullable metadata lookups where necessary. Include a session on each selected course's replay list without granting access to that course's lessons.
- Apply the same authorization to upcoming sessions, calendar events, join, replays, signed resource downloads and Python resource handoff. Review recording import queries so offer-only sessions remain supported. Preserve a single session ID, replay reference and resource collection.
- Reject OR creation until the required migration is detected. Gate new creation behind `LIVE_MULTI_AUDIENCE_ENABLED=false` by default. Existing OR rows must remain readable if the creation flag is turned off.

## Admin editor

Use searchable checkbox lists with selected chips for Offres, Cours associés and Étudiants invités. Include courses with no offers. Remove the primary/additional offer distinction and participant restriction selector for new OR sessions. Explain that any selected offer, course or invitation permits access. Keep recurrence, scheduling, duration and description controls.

## Validation

Test legacy rows unchanged; offer-only and course-only sessions; mixed selections; independent courses; invited students without enrollment; duplicate IDs; invalid IDs; invitation-only rejection; expired and revoked entitlements; unauthorized access to lessons; overlapping matches yielding one calendar entry; consistent join/replay/resource authorization; concurrent removal of the final audience; Zoom/database rollback; recurring sessions; replay imports; desktop/mobile form interactions.

## Rollout and rollback

Approval is required before running the pending SQL. Validate both migrations on disposable PostgreSQL, then run regression and browser checks before requesting production rollout approval. An old application build with inner course joins is not a compatible rollback after OR sessions exist. Use a compatible build with the creation flag disabled and OR reads retained. Keep additive schema and existing rows during rollback.

## Executed validation — 2026-11-21

PostgreSQL 17.6 bound to loopback, disposable databases created and dropped by the tests, Node 24 and headless Chrome. Applied the base production-shaped schema and all active migrations, then pending 002, 003 and 004. Verified that applying 004 without 002 fails and rolls back completely. Existing legacy session rows were created before the new migrations and checked afterward.

Full command from backend, with the local QA port and Chrome executable set in the environment

```powershell
node --experimental-vm-modules --test tests/security.test.js tests/homepage.test.js tests/bugi-learning.test.js tests/timed-offers.test.js tests/zoom-recordings.test.js tests/live-multi-audience.test.js
```

82 tests passed, 0 failed, 0 skipped. The new multi-audience file accounts for 10 tests including its parent suite.

Verified offer-only, independent-course-only and mixed selections; invitations; duplicate IDs; invalid and missing audiences; real JWT administrator/student checks; Dashboard and Calendar deduplication; active, expired, refunded and revoked entitlements; cancelled sessions; early/end join restrictions; signed replay/resource delivery and Python resource access; paid-lesson denial for an invitee; creation disabled while existing OR reads remain enabled; concurrent deletion of the final eligible audience; database rollback and compensating Zoom deletion; recurring dates sharing one meeting; desktop/mobile form creation; invited-student replay playback controls, resource links and files before replay publication. Browser sizes were 1440px and 390px. Existing recording import tests also passed with 002 and 003.

A nullable description caused Calendar details to throw during the new replay browser test. Fixed and rerun successfully. Two earlier offer browser selectors relied on offer names in image alt text, removed in a prior UI change; changed them to stable data-offer-id selectors. Feature detection assertions were updated for the new multiAudience field.

Zoom creation/deletion, R2 signing and object reads used synthetic service doubles. Tests verify actual routes, JWT guards and SQL authorization, but do not establish that real Zoom or R2 credentials, network delivery or a real Google Drive video work. Hosted staging and physical-device checks remain pending. Previously issued signed URLs retain their existing expiry behavior.

## Safest future rollout sequence

1. Obtain separate hosted staging and production approvals. Preserve a database backup and the current build identifier.
2. In designated staging, deploy this compatible application with LIVE_MULTI_AUDIENCE_ENABLED=false. Verify legacy behavior with the schema unchanged.
3. After approval for the destination, promote only approved pending SQL files into the active migration directory and use the existing runner so filenames, checksums and execution order are recorded. 002 must precede 004. 003 is optional for this feature and is required only for Zoom recording imports. Refresh-token migration 001 is independent and is not a dependency.
4. Apply the approved migrations using the normal runner and restart the compatible application so startup detection refreshes. Verify migration status and legacy access while creation remains disabled.
5. Enable LIVE_MULTI_AUDIENCE_ENABLED=true in staging. Create synthetic course-only, offer-only and invited-student sessions. Verify an actual test Zoom join, a private R2 replay and session files, and paid-lesson denial for invitees. Check desktop and a physical phone.
6. Request production rollout approval with staging evidence. Repeat backup, compatible-build deployment, approved migration execution, restart and disabled-flag checks in production. Enable new creation only after the approved smoke test succeeds.
7. If creation fails, set LIVE_MULTI_AUDIENCE_ENABLED=false and retain this compatible reader build. Keep the association tables and policy column. Do not roll back to an older build that assumes all sessions have a primary course after OR rows have been created. Course/offer deletion now requires unlinking selected associations, and the final source cannot be removed without replacing it or deleting the session through its normal workflow.
