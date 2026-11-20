# Synta Academy — Student UX Implementation Roadmap

**Date:** 2026-11-20
**Source:** `docs/SYNTA_PLATFORM_AUDIT.md` (issue IDs refer to that file)
**Status:** Proposed. Nothing here has been implemented. Items marked **Approval** need an explicit owner decision before work starts; items marked **Decision** wait on a question in Audit Section 9.

**Owner decisions (2026-11-20):**
- Q1: a video lesson is complete at about 90% watched.
- Q2: XP, levels and badges are hidden.
- Q3: refresh-token renewal is approved.
- Q4: class and section are locked for students.
- Q5: students can join live sessions 10 minutes early.

**Progress:**
- Done in source on 2026-11-20; browser-verified on 2026-11-20 against an isolated local harness (synthetic data, no database). Results are in Audit Section 11:
  - CAL-01, CAL-02, CAL-03.
  - PRF-01, PRF-02 (locked class and section).
  - CAT-01, CAT-02, CAT-03, plus the « Terminé » label.
  - QZ-01.
  - OFF-01, OFF-02, OFF-05.
  - PERF-01.
  - NAV-04, plus `aria-current`.
- Not yet verified: the `GET /api/live/upcoming` duration filter against real PostgreSQL, and a manual pass on a physical phone (touch, iOS Safari).
- Found during QC (pre-existing, not caused by this batch):
  - Offer cards never show the offer name. The heading is the validity label (« Offre à durée limitée »), so cards differ only by image (OFF-08).
  - On phones, the editable profile form sits below the avatar, stats and badges (PRF-06).
- P0-3 done in source and browser-verified on 2026-11-20 (Batch 2A, 24/24 checks; Audit Section 12).
- P0-4 and P1-11 done in source and browser-verified on 2026-11-20 (Batch 2B, 12/12 renewal checks plus 2A and Batch 1 re-runs; Audit Section 13). The migration is held in `database/pending-migrations/` until the owner approves it; until then sessions last one hour.

**Launch freeze (owner instruction, 2026-11-20):** no new feature batches until real lycée students are being taught. Batch 3 (P1-1, P1-2) is paused. Launch work is limited to:
- Verifying the launch scope: registration, multi-course offers, chapters, lessons, replays and quizzes, targeted Zoom sessions on the dashboard and calendar, purchased-course access, and admin and student sync.
- The smallest blocker fixes: WAL-01, SEC-02 and admin A06 (display), all done on 2026-11-20 and browser-verified.
- An end-to-end launch flow on a disposable PostgreSQL 17 database passed 36/36, and Batch 2B SQL passed 6/6 (2026-11-20; details in `CURRENT_STATE.md`).
- Remaining before teaching:
  - The production checks in `CURRENT_STATE.md`.
  - A pass on a real phone.
- DONE 2026-11-20: synthetic XP, levels and badges are hidden on the dashboard and profile (DSH-02, PRF-03). The course counter now reads « Replays », and the hard-coded language box is removed.

Deferred, kept documented and not developed now:
- University students and new audience types.
- WhatsApp integration.
- XP, badges and ranks (already hidden).
- Major redesigns.
- Code Pratique Web mode.
- The P1–P3 items below, unless one is a launch blocker.

Prioritization weighs student impact, confidence that the problem is real, effort, and dependencies. Each work package is one reviewable change set with its own verification.

---

## P0 — Critical: blocked journeys, silent data loss, data corruption

| WP | Scope | Issues | Size | Gate |
|---|---|---|---|---|
| P0-1 | **Live sessions stay visible and joinable while in progress**; calendar renders when opened from the sidebar | CAL-01, CAL-02, CAL-03 (duration) | S | Q5 for join window only |
| P0-2 | **Profile save no longer erases class/section**; server validation reuses `validateLearnerProfile` | PRF-01, PRF-02 | S | Q4 (whether editable at all) |
| P0-3 | **Session-expired handling**: shared 401 handler in `api-client.js` and page scripts; "Session expirée" dialog; `/login?next=` return; no silent progress loss | AUTH-02, AUTH-03 | S–M | — |
| P0-4 | **Session renewal** via refresh endpoint with rotation | AUTH-01 | M | **Approval** (Q3) |
| P0-5 | **Receipt privacy**: confirm R2 bucket exposure; if public, store private keys only and stop base64 fallback | WAL-06 | M | Verify bucket first; **Approval** for storage change |

**Verification for P0:** route-level tests (in-progress session returned; empty class rejected/ignored; 401 → refresh/redirect), plus browser check at 390 px and 1440 px for calendar and session-expired dialog.

---

## P1 — High: learning flow, serious mobile friction

| WP | Scope | Issues | Size | Gate |
|---|---|---|---|---|
| P1-1 | **True "Continue learning"**: `?lesson=` support in course details; dashboard links to the next lesson with saved position; primary CTA "Reprendre : <leçon>" | LRN-03, DSH-04 | M | — |
| P1-2 | **Lesson completion rule** implemented consistently; clamp progress; single write path; refresh overview on return | LRN-01, LRN-02, LRN-04, LRN-07, LRN-08 | S–M | **Decision** Q1 |
| P1-3 | **Course details resilience**: not-found state, access-error vs not-enrolled, quiz close button + Escape | LRN-05, LRN-06, QZ-01 | S | — |
| P1-4 | **Catalog**: working category chips, real "no results" state, fluid cards at 360 px, completed status label | CAT-01, CAT-02, CAT-03, CAT-04 | S | — |
| P1-5 | **Heavy images**: WebP for offer fallback and slogans, 6 KB favicon and logo, `width/height/loading` on student images | OFF-01, PERF-01, image table | S | No brand asset replaced — only existing WebP versions used |
| P1-6 | **Wallet clarity**: ledger-only history with type and signed amounts, "Recharger" primary button with balance at top, copy buttons, keep input on error, remove inert tiles/"Paiement en ligne" copy | WAL-01..05, W pagination | M | Q7 for online payment copy |
| P1-7 | **Offers**: show offer title, "Recharger" link on insufficient balance, align `fixed_price` vs `price`, fix CSS rule | OFF-02..05 | S | Price alignment touches checkout display only; no payment logic change |
| P1-8 | **Code Pratique reliability**: Stop button, Pyodide iframe reset on timeout, Skulpt `yieldLimit`, timer excludes download/`input()` | CODE-01, CODE-02, CODE-03, CODE-09 | M | Preserve course `.py` handoff, console, variables, `input()` |
| P1-9 | **Code Pratique loading**: lazy-load and pin Skulpt; defer CodeMirror; don't instantiate deferred Web editors (source kept) | CODE-04 | S–M | Respect Web-mode deferral in AGENTS.md |
| P1-10 | **Shell navigation and accessibility**: header controls as `<button>`, drawer `aria-expanded`/Escape/focus trap/inert when closed, `<nav>` + `aria-current`, `<main>` + skip link, Profile and Contact entries, 44 px targets, French logout without delay | NAV-01..05, NAV-07, CON-01 | M | — |
| P1-11 | **Deep links from WhatsApp/email**: `SameSite=Lax` session cookie after reviewing state-changing GET routes | AUTH-04 | S | **Approval** (security setting) |

**Verification for P1:** manual journey test (Login → Dashboard → Reprendre → finish lesson → next lesson → progress updated) at 360, 390, 768, 1024, 1440 px; keyboard-only pass over header, drawer, course rows, quiz; existing regression suite plus new route tests for progress clamping and catalog categories.

---

## P2 — Medium: consistency, performance, accessibility polish

| WP | Scope | Issues | Size | Gate |
|---|---|---|---|---|
| P2-1 | **Design tokens and shared components** in `user.css` (buttons, icon buttons, cards, pills, toast, `<dialog>` modal); replace `alert()/confirm()` | Design direction 1–5 | M | Visual review of a sample page before rollout |
| P2-2 | **Single UI language**: French chrome everywhere; Arabic only for content and Bugi | NAV-06, CON-03, OFF-06 | M | — |
| P2-3 | **Dashboard honesty**: filter stats like `my-courses`; error states; hide or replace XP/level/badges | DSH-01..03, DSH-05 | S | **Decision** Q2 |
| P2-4 | **Profile**: real stats or remove; remove debug logging; read-only email styling; `<form>` submit | PRF-03..05 | S | Q2 |
| P2-5 | **Calendar polish**: Tunis time label, error state, selected-day fix, keyboard-accessible events, `<dialog>` modal | CAL-04..06, CAL-07 | S–M | — |
| P2-6 | **Code Pratique UX**: draft confirmation before course file load, per-user draft key cleared on logout, `end=""` rendering, variables formatting, console append + cap, `input()` dialog semantics, iOS keyboard check | CODE-05..08, CODE-10..12 | M | — |
| P2-7 | **Bugi**: clear attachment after send, fallback on 5xx/timeout, client timeout/cancel, honest status pill | BUGI-01..03 | S | — |
| P2-8 | **Delivery performance**: compression for pages/assets, versioned long-cache static URLs, remove or properly use Turbo, Font Awesome subset | PERF-02..04, NAV-10 | M | Check Coolify proxy first |
| P2-9 | **Contrast and type**: course stat labels, Inter vs Tajawal consolidation | NAV-08, NAV-09 | S | — |
| P2-10 | **Contact**: real data, WhatsApp/phone fallback, prefill from profile | CON-02 | S | **Decision** Q6 |
| P2-11 | **Backend hygiene**: move runtime `ALTER TABLE` into migrations, scope 50 MB body limit, extend rate limits, N+1 lesson query, transaction pagination, restrict public offer endpoints, quiz response access check | SEC-01, PERF-05..07, AUTH-06, OFF-07, QZ-02 (access) | M | Migrations created, not run, without **Approval** |
| P2-12 | **Remove publicly served stray files**: `paiement.js.backup`, `update_offers.cjs`, `data/events.js`, empty `offers_new.css` | SEC-02 | S | — |

---

## P3 — Low: optional polish

- Remove dead code listed in Audit 5.12 (after P1 changes land, so diffs stay reviewable).
- Root-level duplicate folders/scripts cleanup; `.dockerignore` for debug scripts (SEC-04).
- Password reset flow (AUTH-05) — high value but needs schema approval; can be promoted to P1 once approved.
- Admin static HTML server-side guard (SEC-03).
- CSP with pinned CDN versions (PERF-08).
- Live session status updates (CAL-07 backend side), "mark all notifications read".
- Mobile bottom navigation bar (needs **Approval**, Q8).
- Quiz: variable question count, server grading (only if Q2 says scores matter).
- Update stale docs (`CURRENT_STATE.md` bug table, `ARCHITECTURE.md` chatbot line, `.env.example`).

---

## Quick wins (each under half a day, low risk, visible to students)

1. Calendar `turboReload: true` (CAL-01).
2. Include in-progress sessions in `/api/live/upcoming` (CAL-02).
3. Profile: stop overwriting class/section with empty values; validate (PRF-01/02).
4. Offer fallback image and favicon/logo switched to existing WebP/PNG-64 files (OFF-01, PERF-01).
5. Catalog chips use the stored category values (CAT-01) and correct empty state (CAT-02).
6. Quiz close button + Escape (QZ-01).
7. "Recharger mon portefeuille" link on insufficient balance (OFF-02).
8. Profile and Contact links in navigation; header controls as real buttons (NAV-01, NAV-04).
9. Fix the `offers.css` stray brace (OFF-05).
10. French logout without the 2 s delay (NAV-05).
11. Course details "Cours introuvable" state (LRN-05).
12. Remove publicly served backup files (SEC-02).

---

## Recommended sequence

1. **Batch A (quick wins, no decisions needed):** P0-1 (except join window), P0-2 server fix, P1-4, P1-5, P1-7, QZ-01, NAV-04/05, SEC-02.
2. **Batch B:** P0-3 session-expired handling, then P0-4 refresh tokens once approved.
3. **Batch C:** P1-1 Continue learning + P1-2 completion rule (after Q1).
4. **Batch D:** P1-10 shell accessibility + P1-6 wallet.
5. **Batch E:** P1-8/P1-9 Code Pratique.
6. **Then P2** in the listed order, starting with design tokens so later UI fixes reuse them.

Each batch: implement, add or update tests, run the regression suite, check 360/390/768/1024/1440 px and keyboard navigation, update `CURRENT_STATE.md` and `CHANGELOG.md`. No production deployment without explicit authorization.

---

## Success measures

- Returning student reaches the right lesson in **1 click** from the dashboard.
- No student page shows "Chargement..." indefinitely; every data region has an error state with retry.
- No progress or quiz save fails silently.
- Student pages transfer under ~1 MB on first load on mobile (excluding video/Pyodide).
- All interactive shell controls reachable by keyboard; touch targets ≥ 44 px.
- One UI language and one button/modal/toast system across student pages.
