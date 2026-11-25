# Calendar UI refinement — 2026-11-25

Implemented locally; no push, deployment or production data changes.

## Modified components for this task

- backend/public/css/calendar.css: scoped calendar visual refinement, desktop header/grid/cards, mobile chips/agenda, compact-event variants and one desktop scroll region.
- backend/public/js/calendar.js: presentation-only lifecycle labels, safe card metadata, keyboard date controls, overlap/short-card annotations and data-revision refresh handling.
- backend/views/pages/calendar/index.ejs: self-contained SVG header/navigation icons and asset version.
- backend/views/partials/head.ejs: version the calendar stylesheet only.
- backend/public/js/live-session-popup.js: publish the already-fetched authorized sessions as a browser CustomEvent; reminder timing/dismissal unchanged.
- backend/tests/calendar-design.test.js and backend/package.json: calendar unit/browser coverage and default test registration.
- CURRENT_STATE.md, ARCHITECTURE.md, CHANGELOG.md: handoff documentation.

No new library, API route, backend query, database field, migration or environment variable.

## Desktop

Retained seven columns and 90px/hour positioning scale at 1200px and wider, with existing overlap lane calculations. Softer white grid, muted hour rail, sticky day headings, orange today circle, compact grouped controls and lighter tinted cards. Session title, time, state, course and duration use clear hierarchy. Short or densely overlapping cards compact optional visible details; full title/course/state/duration remain in accessible labels/tooltips and the same event popup. Desktop calendar now has one vertical scroll area instead of a nested outer scrollbar.

## Mobile and tablets

Preserved title/count → week controls → seven-day selector → selected day → stacked session cards. Dates have distinct today/selected/event-dot states. Date headers support Tab, Enter and Space; selection updates aria-pressed. Date chips have minimum 44px tracks; only the strip scrolls horizontally on narrow phones. Softer selected-day frame and readable cards. Tablets retain the existing weekly rows rather than squeezing seven tiny columns.

## Behavior preserved

Week navigation, Aujourd'hui, date selection, enrolled event filtering, exact start/duration/overlap positioning, unmodified stored titles and timezone mapping. Reuses the shared event modal, authorized resource/replay actions, countdown, five-minute backend join gate and add-to-calendar download.

State uses explicit completion/cancellation and timestamps, never the presence of LIVE in a title. Reportée is supported if a structured rescheduled status is provided; current standard API does not expose a reschedule flag, so no fabricated badge is shown. Updated dates still move the existing card correctly.

Calendar listens to the existing reminder controller's successful authorized refresh; no new polling or extra request loop. Revision comparison avoids unchanged rerenders; scroll position/keyboard focus are preserved when actual data changes. New lists remove no-longer-available sessions and update rescheduled positions.

## Executed checks

62 affected tests passed, zero failed/skipped, using disposable PostgreSQL, mocked providers and Chrome. Calendar-specific checks cover all eight requested widths: 320,375,390,430,768,1024,1280,1440. Tested navigation, Aujourd'hui, mobile keyboard date selection/daily cards, overlapping start offsets/lanes, long synthetic HTML-like titles as text, upcoming/live/completed presentation, refreshed schedule/ended removal, empty weeks, shared popup, no page overflow and single desktop scroller. Existing access, replay/resource, reschedule-acknowledgment and automatic-reminder tests also passed.

390px and 1440px screenshots visually reviewed. Test data were synthetic representative sessions, including an explicitly completed row to exercise presentation; the real upcoming endpoint intentionally excludes completed sessions. No production records read or changed.

Backend is vanilla JS/EJS with no production bundler build script. Syntax/runtime browser checks passed; Docker is unavailable, so no production image build was claimed. Full repository suite and physical iOS/Android testing are not claimed.

## Remaining checks and rollout

Use an approved staging deployment to check real-font rendering, touch scrolling, long Arabic/French titles and background/resume on physical devices. Existing authorized refresh determines update latency (normally <=15 seconds while joinable); there is no push channel. Do not infer a rescheduled badge until the API actually supplies such status metadata.

Deploy matching versioned assets/application only after owner approval. No new database steps. Rollback calendar CSS/JS/template and the matching asset references; no data rollback required. Unrelated working-tree changes were not altered.
