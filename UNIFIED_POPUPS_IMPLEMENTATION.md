# Unified student popups and LIVE reminders — 2026-11-25

## Implemented scope

Reused the existing #event-modal / showEventDetails calendar workflow, moved its modal renderer into public/js/live-session-popup.js, and made that one modal lazily available throughout authenticated student pages and both public homepage variants after a successful cookie-authenticated user check. Calendar pages do not contain a second modal. Manual replay playback, resources, add-to-calendar download and close actions remain available. Native dialog semantics replace the calendar-only overlay; #event-modal.is-open and existing action/resource selectors remain supported.

Both the reschedule card and LIVE card now load scoped public/css/popups.css. Shared navy/orange/white styling includes 22px corners, translucent backdrop, calendar icon, typography, 48px action targets and 44px close targets, mobile safe-area/viewport constraints, internal scrolling and reduced-motion support. Existing reschedule event rows, database fields, list/ack routes, bell read status and cross-device acknowledgment remain unchanged.

## One five-minute rule

Owner explicitly approved replacing ten minutes with five. The single JOIN_EARLY_MS constant in routes/live.js is now five minutes. sessionTiming derives join_opens_at, ends_at, server_now and has_join_link, and withholds join_url until the eligible window. Those fields are returned by authorized session/course/upcoming APIs. Frontend countdown and reminder scheduling consume these timestamps rather than maintaining another minute constant. Raw Zoom join/host URLs remain withheld; the existing JWT-protected join redirect independently enforces access, status, opening boundary and end time.

The session detail query now selects status, so manual completion cannot be missed by that response. Completed/cancelled sessions cannot rejoin; natural end time is exclusive. Replay authorization is unchanged.

## Reminder lifecycle

- An authorized upcoming event schedules a local wake at its server-provided opening timestamp. A fresh authorized API response confirms eligibility before automatic display. First opening and actual LIVE start are separate phases.
- Server time in API data offsets the device clock. All displayed session dates use Africa/Tunis. Arrival during LIVE shows a status/message rather than negative countdown.
- Upcoming dismissal/display and LIVE dismissal/display are remembered per student ID, session UUID, scheduled timestamp and phase in localStorage. Display counts as shown, so navigation/reload does not interrupt again. A reschedule changes the occurrence key. LIVE permits one additional reminder after upcoming was shown.
- This LIVE reminder state is browser-local, not cross-device. The separate reschedule acknowledgment remains persistent in PostgreSQL. Clearing browser storage resets LIVE reminder history.
- Web Locks serialize popup ownership across same-origin tabs. A short localStorage lease is the fallback. If neither storage nor locking is available, automatic reminders fail quiet rather than risking duplicates; manual calendar access remains. Same-origin peer-frame coordination was browser tested; a physical multi-device/tab matrix was not claimed.
- Lightweight upcoming API checks run once per minute outside the join window and every 15 seconds while any authorized session is joinable, plus exact boundary wakes and pageshow/focus/online/Turbo events. Hidden pages stop polling and close transient LIVE UI; return revalidates. Timer/listener controller initializes once per window and releases tab locks/timers on navigation/background. No Zoom polling, new worker or notification infrastructure.
- Server authorization blocks joining immediately on admin completion. An already displayed reminder updates/closes when status is next detected (normally within 15 seconds while joinable, subject to network/background throttling). This is not server push and does not claim instantaneous remote UI updates.

## Priority and critical interactions

Started LIVE phase precedes joinable upcoming phase, then pending reschedule notices. Only one dialog is presented. Reschedule notifications paused for LIVE priority remain unacknowledged and are fetched again after dismissal. An acknowledgment already being submitted is allowed to finish first.

Existing open dialogs, visible legacy modal overlays, quizzes/video dialogs, active forms/inputs and the disabled Python run control defer automatic interruption. Once clear, pending eligibility is reconsidered; API status is periodically refreshed. No payment, exercise or progress business logic changes.

## Files and integration

- backend/routes/live.js: shared server timing metadata and five-minute gate.
- backend/public/js/live-session-popup.js: extracted/reused event modal plus reminder orchestration and browser dismissal.
- backend/public/js/calendar.js and views/pages/calendar/index.ejs: use the shared existing modal instead of retaining a private duplicate.
- backend/public/js/user.js: small priority/pause hook in existing reschedule controller; acknowledgment flow unchanged.
- backend/public/css/popups.css and user.css: extract and share scoped popup styling.
- views/partials/head.ejs, student asset references, public/index.html and Accueil.html: load/version shared assets.
- tests/live-reminder.test.js, important-popup.test.js, live-multi-audience.test.js and package.json: automated coverage and default test registration.

No database or migration changes. No environment variables or deployment pipeline changes. Existing approved automatic migrations stay as previously documented.

## Executed verification

Affected suite passed 60 tests, zero failures/skips using disposable PostgreSQL and mocked Zoom/R2. Includes exact five-minute boundary, one second too early, no early join link, unauthorized joins, manual completion, existing replay/resource playback, notification acknowledgment, homepage delivery and security regressions.

Synthetic Chrome checks at 320/375/390/430/768/1440: twenty minutes before is quiet; timer boundary opens without refresh; active phase permits one more reminder; dismissal/reload persists; admin end closes and releases a pending important notice; rescheduling follows a new timestamp; critical dialogs defer; same-origin peer state prevents duplicate cards; manual calendar action remains. Existing replay-browser checks preserved.

Settled mobile 390px and desktop 1440px screenshots were visually inspected. Physical Android/iOS, background OS suspension and actual concurrent tabs on those devices still need staging verification. Network loss may delay UI updates; backend joining remains authoritative.

The project has no production build command or frontend bundler. Syntax checks, runtime EJS/browser tests and diff checks are used. Docker is unavailable in this environment; no production image build or full repository suite is claimed. No deployment, push, production database access or live Zoom/R2 calls occurred.

## Safe rollout and rollback

After owner approval, deploy the compatible backend and versioned shared assets together using existing Docker/Coolify startup. There is no new migration. Smoke-test a synthetic session more than five minutes away, at opening, during LIVE, after dismiss/reload, after admin finish and after rescheduling. Verify a student without access never sees or joins it. Verify both popup styles and calendar replay/resource actions on a phone.

Rollback the matching application/assets together; retain existing notification schema and acknowledgment rows. Browser-local LIVE reminder keys are harmless. A rollback to the old build restores its previous ten-minute window, so do not mix old/new timing APIs and clients during validation.
