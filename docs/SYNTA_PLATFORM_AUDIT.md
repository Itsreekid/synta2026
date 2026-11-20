# Synta Academy — Platform Audit (Student Experience First)

**Date:** 2026-11-20
**Type:** Read-only audit. No application code, database, or deployment setting was changed.
**Scope:** Every authenticated student route, the shared shell (header, sidebar, head), the backend APIs those pages call, authentication, visual assets, and performance.

---

## 0. Method and limits

| Done | Not done |
|---|---|
| Read project docs (`AGENTS.md`, `CURRENT_STATE.md`, `BUSINESS_RULES.md`, `ARCHITECTURE.md`), Git history, package files, `.env.example` (variable names only) | No browser session against a running server, staging, or production |
| Static review of every student view, client script, stylesheet and the backend routes they call | No real-device tests; viewport findings come from reading CSS at 360/390/768/1024/1440 px breakpoints |
| Ran the regression suite: **37 tests, 35 pass, 0 fail, 2 skipped** (opt-in PostgreSQL) | No Core Web Vitals measurement (needs a running deployment) |
| Cross-checked client API calls against server routes and response shapes | No test accounts were created and no student data was touched |

**Status labels used below**

- **Confirmed** — the code proves the behavior. Reproduced by reading the exact code path.
- **Suspected** — likely, but needs a browser, device, or environment check before it is treated as a bug.
- **Decision** — the behavior depends on a business rule that is not documented. See Section 9.

**Severity:** Critical / High / Medium / Low. **Size:** S (under half a day), M (1–2 days), L (more).

---

## 1. Executive summary

**Overall condition.** The core is solid. Server-side authorization is careful: lesson, replay, resource and progress routes check enrollment against `req.user.id`, purchases are atomic with row locks and server-side prices, and no `zoom_start_url` or `password_hash` leaks were found. Bugi is safe (no model output rendered as HTML, authenticated, rate-limited). The offers checkout and the course player have had a lot of recent care.

**Main weaknesses** are in the student's day-to-day path rather than in the money path:

1. **Sessions end silently after 1 hour.** There is no refresh endpoint and no 401 handling on the client, so lesson completion, video position and quiz answers stop saving without telling the student. Locked-looking lessons appear instead of "please log in again".
2. **Progress does not mean what it says.** A lesson is marked 100% complete as soon as the video starts playing. Dashboard "progression", course %, and the parcours stepper all inherit this.
3. **"Continue learning" is not a continue button.** It opens the course page, not the next lesson. The student must find their place by hand every time.
4. **Several student pages are visibly broken in common situations.** Calendar likely stays on "Chargement..." when opened from the sidebar; a live session disappears from the calendar and dashboard the minute it starts; catalog category chips always return nothing; saving the profile can erase class and branch, which hides all targeted offers.
5. **Mobile cost and layout.** The default offer image is a 22 MB GIF; every page loads a 303 KB favicon and a 175 KB logo; Code Pratique blocks rendering on about 3 MB of Skulpt. Catalog cards overflow on 360–375 px phones.
6. **Inconsistent shell and accessibility.** Header bell, avatar and dropdown items are `div`s (not keyboard reachable), the mobile drawer has no Escape/focus handling, Contact and Profile are missing from the navigation, and French/Arabic strings are mixed in the same French UI.

**Biggest opportunities (high impact, low effort):** fix the calendar and live-session visibility, deep-link "Continuer" to the next lesson, fix the profile save, replace heavy images with the WebP files that already exist, add a session-expired handler, and make the header/sidebar keyboard and touch friendly.

**Gamification today:** XP, level and "Badges" are computed in the browser from lesson counts (XP = lessons × 10). There is no streak, rank, leaderboard or achievement system. Profile stats are hard-coded. This needs a product decision rather than more code.

---

## 2. Platform overview

| Area | Finding |
|---|---|
| Backend | Node 18+/20, Express 4, ESM, EJS views, single `pg` pool (`backend/config/db.js`) |
| Frontend | Vanilla JS, no bundler. Turbo 8 from CDN (effectively disabled — most pages force full reload). Font Awesome 6.0 full set from CDN. Tajawal from Google Fonts; some pages also reference Inter |
| Auth | JWT in HttpOnly cookies: `synta_access` (1 h), `synta_refresh` (7 d, never redeemed). Google Sign-In. `SameSite=Strict` in production |
| Storage / media | Cloudflare R2 signed URLs (videos, PDFs, resources, thumbnails) |
| Live | Zoom S2S; students get `zoom_join_url` only |
| AI | Gemini for Bugi (Code Pratique only) and a separate learning-analysis key |
| Deployment | Docker (Node 20 Alpine) on Coolify; migrations run before app start |
| Tests | Node test runner; 4 suites; mostly mocked; no browser tests in CI |
| Roles | `user` (student) and `admin` (plus `ADMIN_EMAILS` bypass). No teacher role |
| Brand tokens | Navy `#013047`, orange `#F6851F` (UI often uses `#f97316`/`#ff7b1a`), cyan `#219EBC`, slate neutrals, white. Font Tajawal |

`.env.example` is stale: it still lists Supabase variables and omits `DATABASE_URL`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `APP_URL`, `ADMIN_EMAILS`.

---

## 3. Student route inventory

| Route | View / script | Purpose | Nav entry |
|---|---|---|---|
| `/dashboard` | `dashboard/index.ejs`, `dashboard.js` | Home: greeting, stats, continue learning, next session, replays, parcours | Sidebar |
| `/app/courses` | `courses/index.ejs`, `courses.js` | Catalog with chips + search | Sidebar |
| `/app/course-details?id=` | `courses/details.ejs`, `course-details.js` | Chapters, lesson player, quiz, replays, resources | From catalog/dashboard |
| `/app/calendar` | `calendar/index.ejs`, `calendar.js` | Week view of live sessions | Sidebar |
| `/app/paiement` | `wallet/index.ejs`, `paiement.js`, `offer-purchase-history.js` | Wallet: payment details, deposits, history | Sidebar |
| `/app/offers` | `offers/index.ejs`, `offers.js`, `offer-upgrade-checkout.js` | Offer cards and checkout | Sidebar |
| `/app/code-pratique` | `code/index.ejs` (inline JS/CSS), `pyodide-runner.*` | Python editor + Bugi tutor | Sidebar |
| `/app/profile` | `profile/index.ejs`, `profile.js` | Personal info | Header avatar dropdown only |
| `/app/contact` | `contact/index.ejs`, `contact.js` | mailto contact form | **None inside the app** |
| `/auth/complete-profile` | onboarding | Google users finish profile | Automatic |
| `/session` | placement quiz | Free session / placement | Dashboard empty state |

Public/auth routes: `/`, `/accueil`, `/login`, `/register`, `/password-reset` (support guidance only), `/auth/verify-email`. `/session/admin` points to a missing template (500).

---

## 4. Route-by-route UX/UI review

| Page | Functional status | UX/UI issues | Mobile issues | Recommended fix | Priority |
|---|---|---|---|---|---|
| Dashboard | Works; stats partly misleading | "Continuer" opens course, not next lesson; XP/level/badges are client-side counts; rank label replaced by course title; stats include expired/unpublished courses; no error states ("..." / "—" forever); empty states look clickable; live session vanishes at start | Long single column; parcours and quick links push key info down | Deep-link to next lesson; remove or redefine gamification; filter stats like `my-courses`; add error/empty states; include in-progress sessions | P1 |
| Catalog | Works; filters broken | Category chips never match (`Programmation` vs stored `bac-info`); misleading "no courses" when search has no hit; completed courses say "En cours"; enrolled courses can show as "Découvrir" if `my-courses` times out (3 s) | Cards fixed 340 px inside a 320 px-min grid with inline padding → clipped at ≤375 px; inline styles defeat media queries | Drive chips from real categories; separate "no results" state; fluid cards; move inline styles to CSS | P1 |
| Course details / player | Works; key flows have gaps | Completion on first play; overview not refreshed after player; bad course ID stuck on "Chargement..."; transient access error shows as "not enrolled"; low-contrast stat labels; ~25% dead code | Generated `<section>` elements inherit `height: calc(100vh-70px)` on mobile (inner scroll boxes, suspected); 34–38 px resource buttons; lesson rows not keyboard-operable | Define completion rule; refresh progress on return; real not-found state; keyboard-accessible rows; mobile section override | P1 |
| Quiz (in course) | Works for exactly 3 questions | No close/Escape; answers sent to browser; results do not affect anything; responses accepted for any lesson | Ordering ↑/↓ buttons unsized | Add close; server-side check if scores ever matter | P1 (close), P3 (rest) |
| Calendar | **Likely blank from sidebar** | No `turboReload`, script only on `DOMContentLoaded`; sessions disappear once started; 90 min hard-coded; join disabled until exact start; no error state; Arabic countdown on a French page; clickable divs | 7 compact tiles + expanded card is good; hover lift sticks on tablets | Add `turboReload`; include in-progress sessions using `duration_minutes`; join window; error state; buttons | P0 |
| Wallet | Works; history wrong | Purchases double-counted (transactions + enrollments); no type/sign; deposit button buried as last table row; method tiles look clickable but do nothing; "Paiement en ligne" advertised but absent; form data lost on error; fake pagination | Deposit action far below the fold; table on narrow screens | Single ledger source; type column and signed amounts; primary "Recharger" button at top with balance; copy buttons for RIB/D17 | P1 |
| Offers | Works | 22 MB fallback GIF; card title shows access label, never offer name; "Solde insuffisant" dead end; `fixed_price` vs `price` mismatch → 409; discount badge has no unit; broken CSS rule hides price layout; hard-coded Arabic features | Pager on phones OK; GIF cost is severe on mobile data | WebP fallback; show offer title; link to wallet; align price source; fix CSS | P1 |
| Code Pratique | Works; reliability gaps | No Stop; infinite loop freezes tab 30 s (Skulpt) or breaks Pyodide until reload; course file overwrites draft silently; drafts shared across accounts on same browser; `end=""` prints on separate lines; variables panel mislabels floats/nested lists | Keyboard may hide Run on iOS (suspected); several 32–40 px buttons; Bugi bubble may overlap output | Stop button + iframe reset; `yieldLimit`; lazy Skulpt; draft confirm + per-user key | P1 |
| Bugi | Works, safe | Attachment resent on every follow-up; fallback model only on 404; no client timeout/cancel; static "En ligne" pill | Drawer not modal on phones | Clear attachment after send; fallback on 5xx/timeout | P2 |
| Profile | Save can corrupt data | Empty select overwrites class/branch; no server validation; stats and achievements hard-coded; no password change; debug logging of personal data | Fake stats push form down on mobile | Fix save + validate; real stats or remove; password section after reset flow exists | P0 (save), P2 (rest) |
| Contact | Works (mailto) | Not reachable from app; placeholder phone and `#` social links; Arabic content in LTR page; nothing happens without a mail app | Single card OK | Add nav entry; real contact data; WhatsApp/phone fallback (decision) | P1 |
| Shell (header/sidebar) | Works | Bell/avatar/dropdown items are `div onclick`; no `aria-expanded`, Escape, focus trap; closed drawer links still focusable; no `<nav>`/`aria-current`/skip link/`<main>`; logout shows Arabic text then waits 2 s; 1-hour session | 36 px header icons; drawer focus leaks | Buttons + ARIA; drawer behavior; Profile/Contact links; consistent French copy | P1 |

---

## 5. Technical issue backlog

Format: **ID — title** · Severity · Status · Size. Location, evidence, impact, fix, verification.

### 5.1 Authentication and session

**AUTH-01 — Sessions end after 1 hour; refresh token never redeemed** · Critical · Confirmed · M
- Location: `backend/middleware/requireAuth.js:57-94`, `backend/routes/auth-api.js:33-35,146-148`. No `/api/auth/refresh`.
- Evidence: middleware checks only `synta_access`; on failure it clears both cookies, including a still-valid refresh token.
- Impact: students are logged out every hour, often mid-lesson.
- Fix: refresh endpoint with rotation, used transparently by the client (needs approval — architecture and security change).
- Verify: token-expiry test with a short TTL; lesson playback across expiry.

**AUTH-02 — No client handling of 401; progress silently lost** · High · Confirmed · S–M
- Location: `backend/public/js/api-client.js:10-22`; `course-details.js:155-167,1772,1888-1916`.
- Evidence: `apiFetch` throws a generic error; position saves only `console.warn`; quiz responses use `void fetch`; "Terminer & Suivante" falls back to "locked" when the access check returns 401.
- Impact: after expiry the student sees locks or nothing, and completion is not saved.
- Fix: one shared 401 handler: try refresh once, otherwise show a "Session expirée — reconnecte-toi" dialog and redirect to `/login?next=<current URL>`.
- Verify: delete the cookie mid-lesson and click "Terminer & Suivante".

**AUTH-03 — Login does not return to the original page** · Medium · Confirmed · S
- Location: `requireAuth.js:60-67` redirects to `/login` with no `next`.
- Impact: links from notifications or WhatsApp land on the dashboard after login, not the intended course.
- Fix: `next` parameter, validated as same-origin path.

**AUTH-04 — `SameSite=Strict` breaks deep links from other sites** · Medium · Suspected · S
- Location: `requireAuth.js:13`; Google redirect login uses `Lax` (`google-auth.js:41-58`).
- Impact: opening a Synta link from email/WhatsApp shows the login page even when logged in.
- Fix: `Lax` for the session cookie (CSRF risk stays low for JSON POST APIs; review state-changing GETs first).
- Verify: open `/dashboard` from an external link in production.

**AUTH-05 — No self-service password reset** · High · Confirmed · M
- Location: `views/pages/auth/password-reset.ejs` (mailto only); `public/js/authentication.js:144-147` stub. BUG-006.
- Impact: students who forget passwords depend on a manual email.
- Fix: token-based reset via Resend (needs schema review in `DATABASE_SCHEMA.md` and approval).

**AUTH-06 — Rate limiting partial and in-memory** · Medium · Confirmed · S
- Location: `middleware/authRateLimit.js`. Not applied to `/api/auth/google`, `/api/auth/magic-login`, `POST /api/user/transactions`, public thumbnail signing.
- Fix: extend to those routes; confirm `TRUST_PROXY_HOPS=1` in Coolify.

**AUTH-07 — Minor auth hardening** · Low · Confirmed · S
- `pages.js:126-137` `redirectIfLoggedIn` verifies without `algorithms` or `isAccessPayload`; magic-login token reusable within 5 min; resend-verification and register reveal whether an email exists; logout does not revoke tokens (stateless JWT).

### 5.2 Learning progress, course player and quiz

**LRN-01 — Lesson marked complete when the video starts** · High · Confirmed · S (after decision)
- Location: `backend/public/js/course-details.js:940` (`playing` → `markLessonComplete(id, 100)`).
- Impact: every progress number on the platform means "started", not "finished".
- Fix: depends on Decision Q1 (watch threshold, `ended`, or explicit button).

**LRN-02 — Server trusts completion and progress values** · Medium · Confirmed · S
- Location: `routes/tracking.js:64-82` forces `completed = true` and stores any `progress`; `routes/content.js:237-264` duplicate route can un-complete a lesson and updates fewer columns. Values > 999.99 cause a 500 (`NUMERIC(5,2)`).
- Fix: clamp 0–100; keep one write path (`tracking.js`); retire or align `content.js` progress route.

**LRN-03 — "Continuer" does not resume the next lesson** · High · Confirmed · M
- Location: `public/js/dashboard.js:175`; `course-details.js:19-44` reads only `id` and `replay`.
- Fix: `?lesson=` support in course details; dashboard links to first incomplete lesson (or last watched with resume position).

**LRN-04 — Overview not refreshed after leaving the player** · Medium · Confirmed · S
- Location: `course-details.js:976-990,904-909` restores cached DOM.
- Fix: re-fetch course progress on return.

**LRN-05 — Invalid/unpublished course stays on "Chargement..."** · Medium · Confirmed · S
- Location: `course-details.js:180-184,232-236`; `api-client.js:16-20` throws on 404 so the not-found branch never runs.
- Fix: catch 404/403 and render a "Cours introuvable" state with a link back to the catalog.

**LRN-06 — Transient access-check errors look like "not enrolled"** · Medium · Suspected · S
- Location: `course-details.js:300-307`; `api-client.js:136-143` returns `false` on any error.
- Fix: distinguish error from "not enrolled"; show retry.

**LRN-07 — Playback position lost on tab close** · Low · Confirmed · S
- Location: saves every 10 s and on pause only. Fix: `pagehide` + `navigator.sendBeacon`.

**LRN-08 — Double-click on "Terminer & Suivante" sends two requests** · Low · Confirmed · S

**QZ-01 — Quiz cannot be closed** · Medium · Confirmed · S
- Location: `course-details.js:1634-1670`. Fix: close button + Escape, matching replay modal.

**QZ-02 — Quiz answers and scoring are client-side; responses accepted for any lesson** · Medium · Confirmed · M
- Location: `routes/content.js:130-178` returns answers; `routes/tracking.js:14-36` accepts any `lessonId`, `isCorrect`, `pointsEarned` without access check.
- Impact: low today (scores unused), but blocks any trustworthy XP/leaderboard.
- Fix: access check now (S); server-side grading only if scores will matter (Decision Q2).

**QZ-03 — Exactly 3 questions required; results unused** · Low · Confirmed (incomplete). `course-details.js:1615,1807-1813`. Product decision.

### 5.3 Dashboard

**DSH-01 — Stats include expired and unpublished enrollments** · Medium · Confirmed · S
- Location: `routes/user-api.js:163-222` vs `routes/courses.js:171-175`. Fix: reuse `enrollmentAccess()` and `is_published` filter.

**DSH-02 — XP, level and badges are synthetic** · Medium · Confirmed (Decision Q2) · S–L · **Hidden 2026-11-20 (dashboard and profile); a real design is deferred**
- Location: `dashboard.js:61-86,250-266`; `user-api.js:211-216` (`achievements: completedCourses`); markup hard-codes "Niveau 1 / 0 / 100 XP".

**DSH-03 — Missing error states** · Low · Confirmed · S — `dashboard.js:37,62`.

**DSH-04 — Session items link to the calendar week, not the session** · Low · Confirmed · S

**DSH-05 — Redundant `/api/user/me` request; 8 API calls on load** · Low · Performance · S

### 5.4 Catalog

**CAT-01 — Category chips never match** · High · Confirmed · S
- Location: `views/pages/courses/index.ejs:34-37` (`Programmation`, `Bases de données`, `Web`) vs admin values `bac-info`, `bac-math`, `web-dev`, `general` (`public/admin/pages/courses.html:523-526`); exact match at `routes/courses.js:122`.
- Fix: chips from the stored values with French labels, or derived from returned courses.

**CAT-02 — "No courses" shown when a search has no hits** · Medium · Confirmed · S — `courses.js:66-69` returns before the "Effacer les filtres" branch.

**CAT-03 — Cards clipped on 360–375 px phones** · Medium · Confirmed (CSS) · S — `courses.css:68-70,338-340`; inline grid/padding in `courses/index.ejs:14,76`.

**CAT-04 — Enrolled courses may show as "Découvrir"** · Medium · Suspected · S — 3 s timeout on `my-courses` fails silently (`courses.js:74-83`).

**CAT-05 — External placeholder image with no fallback** · Low · Suspected · S — `via.placeholder.com` (`courses.js:173-174`).

**CAT-06 — `AbortSignal.timeout` needs Safari 16+** · Medium · Suspected · S — `dashboard.js:9`, `courses.js:50,75`. Older iPhones would see errors. Verify student device mix.

### 5.5 Calendar and live sessions

**CAL-01 — Calendar likely blank when opened from the sidebar** · High · Confirmed in code, verify in browser · S
- Location: `views/pages/calendar/index.ejs:4` (no `turboReload`); `public/js/calendar.js:7` starts only on `DOMContentLoaded`.
- Fix: pass `turboReload: true` (consistent with other pages).

**CAL-02 — Live sessions disappear the minute they start** · High · Confirmed · S
- Location: `routes/live.js:154` (`scheduled_at >= NOW()`), used by dashboard and calendar.
- Impact: a student arriving 1 minute late cannot find the join link.
- Fix: include sessions where `scheduled_at + duration_minutes > NOW()`.

**CAL-03 — Duration hard-coded; join disabled until exact start** · Medium · Confirmed · S — `calendar.js:391,644`. Use `duration_minutes`; join window (Decision Q5).

**CAL-04 — Time zone not explicit** · Medium · Suspected · S — browser TZ, no "(heure de Tunis)"; `?date=` parsed as UTC. `/api/events` uses server TZ (no `TZ` in Dockerfile), though that endpoint is unused.

**CAL-05 — No error state; fetch failure shows "Aucun événement"** · Medium · Confirmed · S

**CAL-06 — Selected-day logic never matches** · Low · Confirmed · S — `calendar.js:129,143-151`.

**CAL-07 — Status never moves from `scheduled`** · Medium · Confirmed (BUG-010). "Session live" tag never shows.

### 5.6 Wallet and offers

**WAL-01 — Purchases double-counted in history** · High · Confirmed · S–M
- Location: `public/js/paiement.js:94-125` merges `/api/user/transactions` with `/api/enrollment/my-enrollments`; purchases write both (`routes/purchase.js:80-90`).
- Fix: show the ledger only (`transactions`), with offer purchase history separately.

**WAL-02 — Debits and deposits indistinguishable** · Medium · Confirmed · S — no type column or sign; "N/A" method.

**WAL-03 — Deposit action buried; balance not shown on page; no copy buttons** · Medium · UX · S

**WAL-04 — Method tiles inert; "Paiement en ligne" advertised but not available** · Medium · Confirmed · S

**WAL-05 — Deposit form loses input on error; retries duplicate pending deposits** · Low · Confirmed · S

**WAL-06 — Receipts stored on a public R2 domain; base64 fallback in DB** · High · Suspected (depends on bucket) · M
- Location: `routes/user-api.js:318-333`; `SELECT *` at `user-api.js:274` returns blobs to the wallet page.
- Fix: private keys only, served through the existing admin proxy; fail the request instead of storing base64. Verify bucket public access first.

**WAL-07 — Weak amount validation; runtime `ALTER TABLE`** · Medium · Confirmed · S — `user-api.js:19-39,302,336` (BUG-004).

**OFF-01 — 22 MB fallback GIF for offers** · High · Confirmed · S — `public/js/offers.js:70` (`algo2.gif`, 22.5 MB; `algo2.webp` 481 KB and a 2 KB poster exist). `offers-config.js:18` uses a 1.6 MB PNG (32 KB WebP exists).

**OFF-02 — "Solde insuffisant" is a dead end** · Medium · Confirmed · S — `offers.js:126-129`. Add "Recharger mon portefeuille" link.

**OFF-03 — Price shown vs price charged mismatch** · Medium · Confirmed · S — UI uses `fixed_price || price`; purchase requires `fixed_price` (`purchase.js:155-158`). Offer shows "Acheter" then always fails.

**OFF-04 — Card shows access label, never offer title** · Medium · UX · S — `offers.js:61-66,98`.

**OFF-05 — Broken CSS rule** · Low · Confirmed · S — stray `}` at `offers.css:105-108` discards `.price-comparison`.

**OFF-06 — Hard-coded Arabic marketing features and placeholder UUID** · Medium · Mock data · S — `offers-config.js:8-40`.

**OFF-07 — Public offer endpoints return full rows** · Low–Medium · Confirmed · S — `routes/offers.js:84-111`, `routes/enrollment.js:139-159` (unauthenticated, `o.*` and `json_agg(c.*)`, including inactive/unpublished). Both unused by the client.

### 5.7 Profile and contact

**PRF-01 — Saving can erase class and branch** · High · Confirmed · S
- Location: `public/js/profile.js:196-213` sends `''`; `routes/user-api.js:110-118` `COALESCE` only skips `null`.
- Impact: targeted offers and courses disappear for the student.
- Fix: validate with `validateLearnerProfile`; treat empty as "no change" (or forbid edits — Decision Q4).

**PRF-02 — No server validation on profile update** · Medium · Confirmed · S — any class/branch/phone/name accepted.

**PRF-03 — Hard-coded stats and achievements** · Medium · Confirmed · S — `profile.js:159-186`; `profile/index.ejs:93-133`.

**PRF-04 — Debug logging of personal data and retry loop** · Medium · Confirmed · S — ~20 `console.log` with phone/user object; infinite 500 ms retry.

**PRF-05 — Read-only email looks editable; no `<form>`; no password section** · Low · UX · S

**CON-01 — Contact not reachable inside the app** · Medium · Confirmed · S — `views/partials/sidebar.ejs`.

**CON-02 — Placeholder phone and `#` social links; mailto only** · Medium · Confirmed · S — `contact/index.ejs:36-41`; `contact.js:13-15`.

**CON-03 — Arabic content in an LTR French page** · Low · Confirmed · S

### 5.8 Code Pratique and Bugi

**CODE-01 — No Stop button** · High · Missing feature · M
**CODE-02 — Pyodide timeout leaves the iframe stuck; later runs fail until reload** · High · Confirmed · S — `code/index.ejs:2165-2168,2224-2242`.
**CODE-03 — Skulpt infinite loop freezes the tab for 30 s** · High · Confirmed · S — `execLimit` without `yieldLimit` (`code/index.ejs:1981`).
**CODE-04 — Skulpt, CodeMirror loaded synchronously in `<head>`; Skulpt unpinned from skulpt.org** · High · Performance · S–M — `code/index.ejs:6-16`. Conflicts with the lazy-loading requirement in `AGENTS.md`.
**CODE-05 — Course file silently overwrites the draft** · Medium · Confirmed · S — `code/index.ejs:2898-2900`.
**CODE-06 — Drafts shared across accounts on the same browser** · Medium · Confirmed · S — key has no user id; not cleared on logout.
**CODE-07 — `print(..., end="")` renders on separate lines (Skulpt)** · Medium · Confirmed · S — flex column console.
**CODE-08 — Variables panel mislabels floats, nested lists (and likely dict/bool/None)** · Medium · Partly confirmed · S — `code/index.ejs:2245-2301`.
**CODE-09 — Pyodide timeout counts download and `input()` time** · Medium · Suspected · S
**CODE-10 — Console `innerHTML +=` per print; no output cap** · Medium · Performance · S
**CODE-11 — `input()` modal has no cancel/dialog semantics** · Medium · A11y · S
**CODE-12 — Keyboard may hide Run on iOS** · Medium · Suspected (device test) · S
**CODE-13 — Large monolith: 126 KB template, ~48 KB inline CSS (half overridden), dead examples/hints/Web editors still created** · Low · Maintainability · M
**BUGI-01 — Attachment resent with every follow-up** · Medium · Confirmed · S — `code/index.ejs:2498-2506`.
**BUGI-02 — Fallback model only on 404; no client timeout/cancel** · Medium · Confirmed · S
**BUGI-03 — Rate limit per process; history endpoints unlimited** · Low · Confirmed · S

### 5.9 Shared shell, accessibility and consistency

**NAV-01 — Header bell, avatar, dropdown items are `div onclick`** · Medium · Confirmed · S — `views/partials/header.ejs:11,26,41,45,49`. Not keyboard reachable; English "Toggle menu" label.
**NAV-02 — Mobile drawer lacks `aria-expanded`, Escape, focus trap, scroll lock; closed links stay focusable** · Medium · Confirmed · S — `public/js/user.js:153-161`, `user.css:644-671`.
**NAV-03 — No `<nav>`, `aria-current`, skip link, or `<main>` on most pages** · Medium · Confirmed · S
**NAV-04 — Profile and Contact missing from navigation** · Medium · Confirmed · S
**NAV-05 — Logout shows Arabic message, then waits 2 s (message never visible)** · Low · Confirmed · S — `user.js:242-263`.
**NAV-06 — Mixed French/Arabic UI strings** · Medium · Confirmed · M — e.g. `api-client.js`/`course-details.js` legacy strings, calendar countdown, contact page, `complete-profile` server error, offers features. Course *content* may legitimately be Arabic; UI chrome should be one language.
**NAV-07 — 36 px header icons; many 32–38 px buttons** · Low · Confirmed · S
**NAV-08 — Low-contrast stat labels in course details** · Medium · Confirmed · S — `details.ejs:749-764` (~1.5:1 to 2.5:1 at 0.6 rem).
**NAV-09 — Inter referenced on pages that don't load it; Tajawal elsewhere** · Low · Confirmed · S
**NAV-10 — Turbo loaded on every page but almost every page forces full reload** · Medium · Performance · S — remove Turbo or make page scripts idempotent (`head.ejs:4-9`).

### 5.10 Performance and assets

**PERF-01 — Favicon 303 KB and sidebar logo 175 KB on every page** · Medium · Confirmed · S — `head.ejs:31`, `sidebar.ejs:5`. `favicon-64.png` (6 KB) and `logosynta.webp` (6 KB) exist.
**PERF-02 — No compression for EJS pages and most assets** · Medium · Confirmed in app; verify proxy · S — only homepage files compressed.
**PERF-03 — Weak static caching (`max-age=0` for `?v=2`-style URLs and images)** · Medium · Confirmed · S
**PERF-04 — Font Awesome full CSS from CDN on every page** · Low · Performance · M (subset)
**PERF-05 — N+1 lesson query in course details** · Low · Confirmed · S — `routes/courses.js:263-273`.
**PERF-06 — Unbounded transaction list; no pagination** · Low · Confirmed · S
**PERF-07 — 50 MB JSON body limit on all routes** · Medium · Confirmed · S — `server.js:114`.
**PERF-08 — CSP disabled while loading unpinned third-party scripts** · Medium · Confirmed · M — `server.js:104-109`; `sortablejs@latest` on `/session`.

**Images over 300 KB referenced by student pages (WebP exists for most):**

| File | Size | Lighter version |
|---|---|---|
| `source/algo2.gif` (offers fallback) | 22.5 MB | `algo2.webp` 481 KB, `algo2-poster.webp` 2 KB |
| `offres/slogan2.png` | 1.6 MB | WebP 32 KB |
| `back4.png` | 1.0 MB | WebP 8 KB |
| `hero1.png` | 826 KB | WebP 89 KB |
| `rocket.svg` | 744 KB | — |
| `soon.jpg` | 738 KB | WebP 11 KB |
| `offres/slogan1.png` | 732 KB | WebP 74 KB |
| `icons.jpg` (Bugi avatar) | 709 KB | none — needs a small export |
| `logoweb.png` (favicon) | 303 KB | `favicon-64.png` 6 KB |

Also: 17 student `<img>` tags without `loading`, 11 without `height` (layout shift); wallet references `QR code.jpg` (space in file name). All referenced images exist on disk.

### 5.11 Security and data hygiene (non-student-facing but relevant)

**SEC-01 — Runtime `ALTER TABLE` in route files** · High · Confirmed · M — `user-api.js:24-31`, `admin-api.js:90-95,234` (BUG-004, AGENTS rule 5).
**SEC-02 — Backup/scratch files publicly served** · Medium · Confirmed · S — `public/js/paiement.js.backup`, `public/js/update_offers.cjs` (contains a local path), `public/data/events.js` (past Zoom links with passwords), empty `offers_new.css`.
**SEC-03 — Admin HTML/JS served without server-side auth** · Medium · Confirmed (BUG-008) · M — APIs are protected; client guard rejects `ADMIN_EMAILS` admins whose DB role is `user`.
**SEC-04 — Debug scripts copied into the Docker image** · Low · Confirmed · S — root `.dockerignore` does not exclude `backend/test-*`, `diagnose-*`, `scratch-*`, `fix-db.js`.
**SEC-05 — Preview lessons bypass course publication/targeting; raw storage keys in lesson response** · Low · Confirmed · S
**SEC-06 — Placement quiz `explanation` exposed publicly; unlimited resubmission** · Low · Confirmed · S

**Verified safe:** parameterized SQL throughout; no `zoom_start_url` or `password_hash` in student responses; user identity always from `req.user.id`; purchases atomic with `FOR UPDATE` and server prices; `.env` not tracked; Bugi renders replies as text.

### 5.12 Dead code and duplication (cleanup candidates)

- `course-details.js`: ~470 lines unused (`enrollInCourse` with `undefined/api/purchase/course`, `renderCourseContent`, `openLesson`, `openVideoPlayer`, legacy Arabic strings, `../auth/login.html` redirects that would 404).
- `courses.js`: `enrollCourse`, `showPurchaseConfirmation` (unescaped title), `completePurchase`, `viewCourse`, hidden `#resume-learning-section`.
- `dashboard.js`: `navigateTo`, `navigateToCalendar`, `showContact` (points to a 404 path).
- `user.js`: iframe navigation (`loadPage`, `setupIframeResize`).
- `code/index.ejs`: examples, hints (`PYTHON_HINTS` undefined), Web editors created while deferred (keep source per AGENTS.md, but don't instantiate).
- `chatbot.js`, `chatbot.css`, root-level duplicates (`js/`, `admin/`, `source/`, `main.js`, `authentication.js`, `user.css`, `scratch.js`, `fix_progress.js`).
- Unused endpoints: `/api/events`, `/api/offers/:offerId`, `/api/enrollment/offers`, `/api/user/activity`, `/api/content/lesson/:id/progress`.

---

## 6. Real student journey

**Login → Dashboard → Find course → Open lesson → Learn → Complete → Progress → Continue**

| Step | Implemented | Friction found | Recovery | Fix |
|---|---|---|---|---|
| Login | Yes (email + Google) | No return to intended page; deep links from other sites may require re-login (AUTH-03/04) | Password reset is mailto only | `next` param; Lax cookie; reset flow |
| Dashboard | Yes | "Continuer" opens course page; stats inflated or deflated; session vanishes at start | "..." forever on API error | Deep link; error states |
| Find course | Yes | Chips return nothing; misleading empty state; cards clipped on small phones | Retry exists for catalog load | CAT-01..03 |
| Open lesson | Yes | Must scan chapters to find place; lesson rows not keyboard operable | Bad ID stuck on "Chargement..." | LRN-03, LRN-05 |
| Learn | Yes (video, files, Drive, replays) | Resume works; position not saved on close | Video retry with fresh URL exists | LRN-07 |
| Complete activity | Partly | Complete at play start; quiz can't be closed; after 1 h, saves fail silently | None for session expiry | LRN-01, QZ-01, AUTH-02 |
| View progress | Yes | Overview stale until reload; numbers mean "started" | — | LRN-04 |
| Continue | Partly | Back to course page, not next lesson | — | LRN-03 |

**Clicks today (returning student, mid-course):** Dashboard → Continuer → course page → open chapter accordion → find lesson → play ≈ **4–5 actions plus searching**. Target: **1 action** (Continuer → player at saved position).

---

## 7. Unfinished features

| Feature | State | Needs |
|---|---|---|
| Session renewal (refresh tokens) | Issued, never used | Approval (AUTH-01) |
| Password reset | Page with mailto only | Approval + schema review |
| XP / levels / badges / streaks / leaderboard | Synthetic counters only | Product decision (Q2) |
| Weak topics / quiz analytics | Tables exist, never written (BUG-007) | Product decision |
| Live session status (`live`/`completed`) | Never updated (BUG-010) | Small backend change |
| Online payment | Advertised in wallet tiles, not implemented | Remove copy or plan provider |
| Contact form | mailto only, placeholder data | Real contact data; channel decision |
| Profile avatar, password change, real stats | CSS exists, no feature | Decide scope |
| Notifications | Work (DB-backed); no "mark all read" | Optional |
| Code Pratique Web mode | Deferred by product decision | Do not resume until asked |
| Pyodide in a Web Worker | Known limitation | Future hardening |

---

## 8. Recommended design direction

Keep the existing identity; consolidate rather than redesign.

1. **Tokens in one place (`user.css :root`).** Navy `#013047` for text/headers and secondary buttons; one orange (`#F6851F`, with a darker `#D9700F` for text-on-white contrast) for the single primary action per screen; cyan `#219EBC` for links/info; slate neutrals; semantic green/amber/red for status only.
2. **Typography.** Tajawal for all UI (it covers French and Arabic). Drop the Inter references or load it once everywhere; don't mix per page. Minimum 14 px body on mobile, 16 px inputs.
3. **One component set.** Primary button, secondary button, icon button (44 × 44 px minimum, real `<button>`, `aria-label`), card, status pill, toast, and `<dialog>`-based modal with Escape/focus return. Replace `alert()`/`confirm()` and the three different toast implementations.
4. **One primary action per screen.** Dashboard: "Reprendre: <lesson>". Course: "Reprendre"/"Commencer". Wallet: "Recharger". Offers: "Choisir".
5. **Consistent states.** Every data region gets loading (skeleton with fixed height), empty (with a next step), and error (with Réessayer) states.
6. **Language.** French for all UI chrome using the informal "tu" already used in recent copy. Arabic only for authored course content and Bugi.
7. **Mobile.** Keep the drawer but fix its behavior. Optional (needs approval): a 4-item bottom bar (Accueil, Cours, Calendrier, Code) on phones, with Wallet/Offers/Profile/Contact in the drawer.
8. **Icons.** Font Awesome only, solid style, `aria-hidden="true"`, 16/20/24 px sizes; replace emoji used as UI icons in the shell.
9. **Gamification restraint.** Show progress (percent, next lesson, completed chapters). Hide XP/levels/badges until a real rule exists.

---

## 9. Decisions needed from the owner

| # | Question | Why it matters |
|---|---|---|
| Q1 | What counts as a completed lesson (video watched to X%, reached the end, or explicit "Terminer" button)? Do PDFs/files count? | Drives every progress number and LRN-01 |
| Q2 | Keep, hide, or properly design XP / levels / badges? Are quiz scores meant to count? | DSH-02, PRF-03, QZ-02 |
| Q3 | May we implement refresh-token session renewal (e.g., 7-day sliding session)? | AUTH-01/02 — architecture and security change |
| Q4 | Can students change their class and section after signup? If yes, any restrictions? | PRF-01/02; class/section controls offer visibility |
| Q5 | How early can students join a live session, and should duration come from `duration_minutes`? | CAL-02/03 |
| Q6 | Real contact channels (phone, WhatsApp, social links) and whether a server-side contact form is wanted | CON-02 |
| Q7 | Is "Paiement en ligne" planned? If not, remove it from the wallet | WAL-04 |
| Q8 | Approve a mobile bottom navigation bar? | Design direction item 7 |

---

## 10. Documentation drift observed

- `CURRENT_STATE.md` "Known Bugs" table is older than its dated entries: BUG-005 appears fixed (`session.js:263-266`), BUG-009 is partially addressed (auth rate limits exist), "Lesson feedback submission" is listed as working but was removed.
- `ARCHITECTURE.md:218` describes `chatbot.js` as Bugi; it is an unused mock.
- `.env.example` is missing several required variables and still lists Supabase.

---

## 11. Verification of the first quick-win batch (2026-11-20)

**Environment.** Everything ran on a local QA harness kept outside the repository, with no production data involved:
- The real `routes/pages.js`, `routes/user-api.js` and `routes/live.js`, plus the real EJS views and static assets.
- An in-memory stand-in for `config/db.js`, with `pg` and `dotenv` blocked. `backend/.env` was never loaded and no database was contacted.
- One synthetic student and a test-only JWT secret.
- The catalog, course, quiz, offers, enrollment and purchase-history APIs returned synthetic JSON.
- Headless Chrome driven over the DevTools protocol.

No real student, enrollment or progress data was read or written. Nothing was committed or deployed.

| Area | Check | Result |
|---|---|---|
| Diff review | Only the approved quick-win files changed; no enrollment, payment or progress logic touched | PASS |
| Unit tests | `node --experimental-vm-modules --test` (4 files): 37 pass, 0 fail, 2 skipped (they need disposable PostgreSQL) | PASS |
| Responsive | 8 pages (dashboard, calendar, catalog, course details, offers, wallet, profile, contact) × 360/390/768/1024/1440 px: no horizontal overflow, broken images, JS errors or failed local requests | PASS (40/40) |
| Calendar | Sessions already ended, or past their `duration_minutes`, are hidden. A session in progress, one starting in 5 min and one in 2 days are listed | PASS (simulated SQL) |
| Calendar | Join enabled for the in-progress session (« En direct maintenant ») and the 5-min session; disabled for the 2-day session; French countdown | PASS |
| Calendar | Dashboard → Calendar via the sidebar (Turbo) renders events, on mobile drawer and desktop | PASS |
| Profile | Class/branch selects disabled with hint; invalid phone → 400 with server message, no UPDATE; valid save sends only `full_name` + `phone`; forged `user_class`/`user_branch` in the body are ignored | PASS |
| Catalog | « Terminé » at 100%; Bac Mathématiques chip filters and sets `aria-pressed`; empty chip and empty search show « Aucun cours ne correspond… » and the reset button restores all courses | PASS |
| Quiz | Close button (44×44, in view) and Escape both close the quiz and remove `inert`; a full 3/3 run shows results and posts 3 responses; no JS errors | PASS |
| Offers | « Recharger mon portefeuille » appears only on the unaffordable offer and opens the wallet; fallback image is `algo2.webp` (no GIF); `.price-comparison` is visible | PASS |
| Wallet | History renders; amount 0 is blocked by the client; a valid amount creates a pending deposit (in the stand-in DB) and appears in the history | PASS |
| Sidebar | Profile and Contact links; WebP logo loads; `aria-current="page"`; sidebar scrolls; mobile drawer opens | PASS |
| Live SQL | `make_interval` duration filter against real PostgreSQL | NOT TESTED |
| Real devices | Touch, iOS Safari, slow network | NOT TESTED |

**Limits.** The harness answers SQL by pattern, so it proves client behavior and route validation, not the SQL itself. Catalog, quiz and offers were rendered from synthetic API responses, so the real `courses`, `content`, `offers` and `tracking` routes were not exercised in the browser.

**New findings (pre-existing, not regressions):**
- **OFF-08** (P2): offer cards never render `offer.title`. The `h2` is the validity label (« Offre à durée limitée »), so students and screen readers cannot tell offers apart except by image. Location: `public/js/offers.js:61-98`.
- **PRF-06** (P2): on narrow screens, the editable profile form starts below the avatar, stats and badges (about 980 px down), so students must scroll past gamification to edit their details. Location: `views/pages/profile/index.ejs`, `public/css/profile.css`.

---

## 12. Batch 2A verification: session expiry and recovery (2026-11-20)

**Scope.** AUTH-02 (no client handling of 401) and AUTH-03 (no return to the original page) are fixed in source. AUTH-01 (renewal) is still open, pending approval of P0-4.

**Environment.** Same isolated harness as Section 11, now also running the real `routes/auth-api.js` login and logout. The stand-in DB holds one synthetic student with a bcrypt hash of a local-only password. The stubbed course, tracking, content and offer APIs are guarded by the real `authApiMiddleware`. No production data or `.env` was used.

| Check (390 and 1440 px) | Result |
|---|---|
| No session: course page → `/login?next=…` with « Connecte-toi pour accéder à cette page. » → back to the course after login | PASS |
| Expired token plus refresh cookie: `reason=expired`, « Ta session a expiré… » notice, back to the course after login, no JS errors | PASS |
| Unsafe `next` values (`//evil`, absolute URL, `/login`, `/api/...`, `/app/../admin`) land on `/dashboard` | PASS |
| Already signed in: `/login?next=/app/offers` goes to offers; `/login?next=/login` goes to `/dashboard` with no loop | PASS |
| Dashboard mid-session expiry: three failing requests open exactly one dialog, focused on « Se reconnecter », inside the viewport, with no navigation; Escape leaves a banner; no second dialog | PASS |
| Quiz mid-session expiry: the unsent answer is queued, the dialog shows above the quiz, re-login returns to the course, and the answer is replayed once (401 then 200) with the queue cleared | PASS |
| Lesson completion save during expiry is replayed once after re-login | PASS |
| Banner « Ta session expire dans 4 min… » with 4 minutes left; the dialog opens on its own at expiry | PASS |
| Early « Se reconnecter » logs out, then returns to the same page after login | PASS |
| Explicit logout shows no expiry dialog and no expiry notice | PASS |
| Code Pratique draft survives expiry and re-login | PASS |
| No JS errors and no false dialog or banner on 7 app pages with a valid session | PASS |
| Batch 1 regression suite (Section 11) | PASS (94/94) |
| Unit tests: return-path validation, `requireAuth` redirects, iPhone Google callback destination (40 pass, 2 PostgreSQL skipped) | PASS |
| Real Google sign-in (popup and iPhone redirect) | NOT TESTED |
| Physical phones | NOT TESTED |

**Limits.**
- A quiz in progress restarts after re-login; answers already submitted are replayed.
- Typed but unsaved profile and wallet form values are not kept across re-login.
- Login allows 30 attempts per 15 minutes per IP; repeated test runs hit it, as designed.

## 13. Batch 2B verification: automatic session renewal (2026-11-20)

**Scope.** AUTH-01 (renewal) and AUTH-04 (`SameSite=Strict` breaking deep links) are fixed in source. The 2A warning banner now appears only for sessions that cannot renew, such as admin "log in as student".

**Environment.** The Section 12 harness, with the real `sessionRenewal` middleware and `services/sessions.js`. The stand-in DB implements `refresh_tokens` and serializes transactions like PostgreSQL row locks. No production data, database or `.env` was used. The migration was not run anywhere.

| Check | Result |
|---|---|
| Login sets an opaque 43-character, HttpOnly, `SameSite=Lax` refresh cookie lasting 7 days; the DB holds only a 64-character hash (390 and 1440 px) | PASS |
| Expired access + valid refresh: the course page opens directly, the cookie rotates, no dialog, banner or expiry meta, no JS errors (390 and 1440 px) | PASS |
| Five parallel API calls after expiry all return 200 and create exactly one new token | PASS |
| Old refresh token replayed after rotation: the attacker and the victim are both sent to login (« Ta session a expiré ») | PASS |
| Logout revokes server-side: a copied refresh cookie no longer renews | PASS |
| A pre-2B refresh JWT converts once into the new format; its replay is refused | PASS |
| Database outage: login page with the expiry notice, refresh cookie kept, session resumes after recovery | PASS |
| Link opened from another site keeps the student signed in | PASS |
| A session without a refresh cookie still shows « Ta session expire dans 4 min » | PASS |
| Batch 2A suite (Section 12) after the change | PASS (24/24) |
| Batch 1 regression suite (Section 11) after the change | PASS (94/94) |
| Unit tests: rotation, 20-second grace, reuse revocation, 7-day idle and 30-day cap, revocation, legacy acceptance and forgery rejection, logout, magic login, storage-failure fallback, middleware fail-safe and throttle (46 pass, 2 PostgreSQL skipped) | PASS |
| Migration and SQL on real PostgreSQL | NOT TESTED |
| Real Google sign-in and physical phones | NOT TESTED |

**Limits.**
- The renewal failure throttle is in memory per process, like `authRateLimit`.
- A cross-site POST to `/api/auth/logout` can still clear the cookies (a nuisance, not an account takeover); the server-side token is not revoked in that case. This existed before 2B.
- Magic-login sessions end after one hour by design.