# Student UI migration — Tailwind CSS + Preline (checklist)

Visual modernization of the **student** pages only. Same markup structure, sections, order, French wording, IDs,
data attributes, form names and API calls. Admin (`backend/public/admin/`), login/registration, public landing
pages, the free-session funnel (`views/pages/session/`) and `onboarding/` are out of scope and untouched.

## Stack and build

| Item | Choice | Why |
|------|--------|-----|
| Tailwind CSS | **3.4.19** (devDependency, exact pin) | Tailwind 4 needs Safari 16.4+ / Chrome 111+ (native `@layer`, `@property`, `color-mix`). On iOS 15 phones the whole stylesheet would be dropped. 3.4 compiles to plain CSS. |
| Preline | **2.7.0** (devDependency, exact pin) | Last Preline line for Tailwind 3 (3.x+ require Tailwind 4). Used through `preline/plugin` (adds the `hs-*` state variants). |
| Preline JS | **not shipped** | Header dropdowns, mobile menu, tabs, modals already have vanilla handlers (`user.js`, page scripts). Loading Preline's JS on the same elements would double-initialize them. Add a single plugin only when a new interaction needs it. |
| Build | `npm run build:css` → `tailwindcss -c tailwind.config.cjs -i styles/student-ui.css -o public/css/student-ui.css --minify` | No Vite, no CDN, no bundler. |
| Content scan | `views/**/*.ejs`, `public/js/**/*.js` (+ safelist for runtime tone classes `sa-badge--*`, `sa-alert--*`) | Classes written by client scripts are found too. Unused primitives are tree-shaken until a page uses them. |
| Docker | new `assets` stage (`npm ci` + build) → only `public/css/student-ui.css` copied into the runtime image; runtime still `npm ci --omit=dev` | Simulated locally (`npm ci` + build, then `npm ci --omit=dev`: no tailwind/preline in runtime deps). Real `docker build` not run: Docker is not installed on this machine. |
| Built file | `public/css/student-ui.css` is kept in the tree so `npm start` works without a build; Docker always rebuilds it | Rebuild after editing `styles/student-ui.css` or adding classes, then bump `?v=` in `views/partials/head.ejs`. |
| Cache busting | `/css/student-ui.css?v=20261127-ui1` | Same `?v=` convention as the other assets. |

## Isolation rules (in force)

- `prefix: 'tw-'` on every utility → no collision with legacy `.btn`, `.card`, `.modal`, `.chip`…
- `corePlugins.preflight: false` → no global reset; `@tailwind base` only emits the `--tw-*` variable defaults.
  Borders need an explicit style (`tw-border-solid`) because there is no Preflight.
- Shared primitives are plain component classes named `sa-*` (Synta Academy), defined in `@layer components`.
- `student-ui.css` is linked **last** in `head.ejs`, so equal-specificity rules win without `!important`. No native
  cascade layers are emitted (old Safari safe). Shell overrides are scoped to `#app-header-top` / `#app-sidebar`.
- `user.css` and `popups.css` are **not** edited: admin pages, the landing page and tests load them too.
- Focus ring rule excludes `.video-js` and `.CodeMirror` descendants; Video.js, CodeMirror, markdown and iframes keep
  their own styles. Reduced motion respected; no `transition: all` in new code (removed one in `offers.css`).

## Design tokens (`styles/student-ui.css` `:root` + `tailwind.config.cjs`)

Navy `#013047` (scale `navy-50…950`), orange `#F6851F` (`brand-50…900`, hover `#e06a0c`), turquoise `#219EBC`
(`teal-50…900`), ink `#0f2b3d`, text `#334e60`, muted `#64798a`, line `#e3e9ef`, canvas `#f5f8fb`. Font Tajawal.
Radii 8 / 10 (controls) / 16 (cards). Shadows: card (subtle), raised (hover), pop (menus/modals). Focus: 2px orange
outline or 3px orange ring on inputs. Motion 120–300 ms on color/opacity/transform only.

## Primitives (`sa-*`)

Buttons `sa-btn` + `--primary|--secondary|--ghost|--sm|--block`; `sa-icon-btn`; cards `sa-card`, `--pad`,
`--interactive`, `sa-card__title`; `sa-page-title` / `sa-page-subtitle`; badges `sa-badge--navy|orange|teal|success|
warning|danger|neutral`; form `sa-field`, `sa-label`, `sa-input`, `sa-select`, `sa-hint`, `sa-search`; tabs
`sa-tabs` / `sa-tab` (`aria-selected` or `.is-active`); progress `sa-progress` / `sa-progress__bar`; alerts
`sa-alert--*`; `sa-empty` (+ `__icon`, `__title`); `sa-skeleton`; `sa-popover`; `sa-modal-backdrop` / `sa-modal`;
`sa-pagination`. They are CSS classes (no new EJS partials yet): the existing render helpers in page scripts can use
them directly, which keeps markup in one place.

## Stages

- [x] 1. Foundation: deps, config, build, Docker stage, tokens, primitives, head link.
- [x] 1b. Pilot — **Profile**: markup uses `sa-card`, `sa-field`, `sa-input`, `sa-select`, `sa-btn`; emoji headings
      → Font Awesome icons (same words). `profile.css` deleted (all rules superseded or unused; verified by grep in
      views/js/tests). IDs, `.save-btn`, `.profile-form`, `#email-verification-*` hooks kept.
- [x] 2. Shared shell: header balance pill, bell, avatar, dropdowns, sidebar nav (flat orange active state, no jump
      on hover), mobile overlay, focus rings. Markup unchanged.
- [x] 3. Dashboard: tokens aligned to the brand palette (orange, navy, turquoise tiles), borders, shadows, radii,
      focus color. Grid, sections and positions unchanged. (`dashboard.css` is shared with Code Pratique.)
- [x] 4. Courses catalog: banner moved from generic blue to brand navy→turquoise, chips/search/cards hover/focus,
      brand orange. Structure unchanged.
- [x] 5. Calendar: **no CSS change** (recent premium design, covered by `calendar-design.test.js`); gets the shell only.
- [x] 6. Wallet: tokens aligned (no layout change). Offers: tokens aligned, radius 24→18, `transition: all` removed,
      empty state uses `sa-empty` (same text).
- [x] 7. Protected pages — course details / learning player, Code Pratique, quizzes, checkout, live joining:
      **no page-CSS or markup change**. Only the shared shell and the keyboard focus ring apply.
- [ ] Next candidates: move wallet/offers/courses render helpers to `sa-badge`/`sa-btn`; replace `.loading`
      text states with `sa-skeleton`; restyle calendar only if the owner asks; consider deleting dead legacy rules in
      `dashboard.css` (`.continue-course-card`, `.event-item`) after confirming the Code Pratique page does not use them.

## Verification (2026-11-27)

- Tests: baseline 58/58 (13 files); after migration 100/100 (16 files: + timed offers, deposit/Bugi, Bugi learning),
  0 failed, 0 skipped.
- Widths 320/375/390/430/768/1024/1440/1920 on dashboard, courses, profile, wallet, offers, calendar, lesson page:
  no horizontal overflow (`scrollWidth == clientWidth`).
- No console errors on any student page; dashboard API calls 9 → 9, 0 duplicates; Python run in Code Pratique OK;
  header dropdowns and mobile sidebar open/close OK.
- Size: +1 request (`student-ui.css` 16.6 KB, 3.6 KB gzip) on every student page; profile page −1 request
  (`profile.css` 9.9 KB removed).

## Phase 2 — professional refinement (2026-11-27)

All in `styles/student-ui.css` (scoped per page container) plus small, visual/a11y-only markup and script changes.
`dashboard.css`, `user.css`, `popups.css`, `calendar.css`, `course-details.css` untouched in this phase.

- **Mobile fixes**: the drawer now opens *under* the 60px header bar, so the menu button stays on top and turns
  into a close (✕) button (`aria-expanded`, label « Fermer le menu »); overlay starts under the header. Drawer shows
  the full logo with « Synta Academy ». Escape closes the drawer and returns focus to the button.
- **Header**: bell and avatar are real `<button>`s (`aria-haspopup/controls/expanded`, keyboard reachable);
  profile menu items are a link + a button (were clickable divs). Escape closes either menu and restores focus.
  Notifications panel: proper loading skeleton (`sa-skeleton`), empty and error states with icons (same French text).
- **Sidebar**: tablet icon rail keeps link names for screen readers (were `display:none`); press feedback.
- **Popups** (live/calendar dialogs): radius 22→18, softer navy shadow and backdrop, hover/press states that did not
  exist, orange focus ring.
- **Dashboard**: stat tiles white with hairline border, navy headings/numbers (tabular), view-all/arrow/quick-link
  hover + press feedback, progress bars animate in 300 ms (was 800 ms), dashed empty states.
- **Courses**: count badge, search icon turns orange on focus, empty/error states with icon tile, « Effacer les
  filtres » uses `sa-btn sa-btn--secondary`.
- **Wallet**: dashed key/value separators, uppercase table header band, row hover, styled « Aucun achat » state,
  add button uses `sa-btn sa-btn--primary`, count uses `sa-badge`, modal fades/pops in (bottom sheet slides up on
  phones), inputs 1px + orange ring, unified orange focus ring.
- **Profile**: save toast uses the wallet toast palette/radius, `role=status|alert`, 250 ms entry, honours
  reduced motion.
- **Motion**: only transform/opacity/colour; 120–300 ms; every new animation listed in the reduced-motion block.
  Not changed: 8 `transition: all` inside the Code Pratique template and 2 in unused `chatbot.css`/`game.css`.
- **Learning page / Code Pratique**: no change (already consistent; protected).
- **Primitives actually used now**: `sa-card`, `sa-card__title`, `sa-page-title/subtitle`, `sa-field`, `sa-label`,
  `sa-input`, `sa-select`, `sa-hint`, `sa-btn` (+ primary/secondary/sm), `sa-badge--neutral`, `sa-empty`,
  `sa-skeleton`, `tw-sr-only` and `tw-` layout utilities. Unused ones are tree-shaken from the build.

### Dependency review

- `tailwindcss@3.4.19` is the official `v3-lts` dist-tag (published 2025-12-10). Tailwind 4 docs require Chrome 111,
  Safari 16.4, Firefox 128 (relies on `color-mix()` etc.); v3 docs give no numeric floor, so the built file was scanned:
  no `@layer`, `@property`, `color-mix`, `:has`, `!important`. Uses `:is()`/`:where()` (Safari 14 / Chrome 88) for
  polish rules only — older engines drop those rules and keep the base look. → practical floor iOS 14 / Chrome 88.
- `preline@2.7.0` (2025-01-02) is the last Tailwind-3 line (Preline 3.0 moved to Tailwind 4; 5.x targets 4.3). Only its
  build-time Tailwind plugin is used; no Preline JS reaches the browser.
- `npm audit`: Tailwind/Preline add no new advisory. `picomatch@2.3.1` (high, ReDoS) was already present via nodemon;
  build-time only, globs are ours. Production tree (`--omit=dev`) has 7 **pre-existing** advisories in
  express/qs/proxy-addr/path-to-regexp/fast-xml-parser — out of this task's scope, worth a separate `npm audit fix`.

### Phase 2 verification

- All 26 test files: 181/182 pass, 0 skipped, 0 cancelled. The 1 failure (`live-multi-audience.test.js`, module
  loader assertion `../services/lesson-thumbnails.js`) comes from another session's concurrent, uncommitted
  thumbnail work in `routes/content.js`, not from UI files.
- No overflow at 320–1920 px on all 8 student pages; no console errors; keyboard: header buttons focusable,
  Escape closes menus/drawer with focus return; wallet modal opens/cancels.
- Size: `student-ui.css` 27.3 KB (5.5 KB gzip), up from 16.6 KB (3.6 KB gzip). Requests per page unchanged since
  Phase 1 (+1 vs the original baseline; profile −1).
- Screenshots (original → phase 1 → phase 2, desktop + mobile): `side-session-notes/…/student-ui-screenshots/`.
- **Release gate open**: Docker is not installed here; the real `docker build` has not been run.
- Note for reviewers: the in-app browser pane was in the background, so CSS transitions did not tick in screenshots
  taken right after a click; end states were verified with `document.getAnimations().forEach(a => a.finish())`.

## Mobile fixes from real-phone testing (2026-11-27, owner-authorised layout adjustments)

- **Code Pratique header**: under 700px `.cp-toolbar-group { grid-column: 1 / -1 }` pushed erase/copy to a second row,
  and an inline `font-size:18px` blocked the responsive title. Now one 56px row (60px at 320px): icon · title (ellipsis)
  · green dot … erase + copy (40×40). Same IDs/handlers/tooltips. Copy feedback is icon-only (✓ for 1.5 s, label
  « Code copié ») — it used to inject « Copié ! » / « Copier » text that would overflow the icon button.
- **Offers carousel (≤600px)**: root cause — cards were a vertical stack and the arrows called
  `scrollIntoView({block:'start'})`, so « next » scrolled the page down to the card below. Also `.offers-container`
  (`margin:auto` in the column-flex main section) sized itself to its content and centred itself vertically.
  Now: horizontal scroll-snap track (native swipe), arrows animate the same scroll in 300 ms ease-out (instant with
  reduced motion; timeout fallback when frames are throttled), state-first index so rapid clicks are exact, track
  height = active card (ResizeObserver), switching from deep in a long offer smoothly returns to the carousel top,
  arrows on the sides in gutters, sticky at ~45% of the screen, dimmed at first/last; counter + dots under the card.
  Desktop unchanged (wrap grid; nav/pagination hidden above 600px). IDs `mobile-offer-nav`, `nav-prev-btn`,
  `nav-next-btn`, `offer-indicator` kept; cards, prices, texts, buttons and purchase handlers untouched.
- **Courses banner (≤599px)**: same Bugi asset, ~300px wide, anchored bottom-right with a left-edge mask fade and a
  soft turquoise glow; text in front with a light text-shadow; face stays sharp; no blur needed.
- **Course cards**: vertical at every width — phones get one full-width card: 16:9 artwork, status badge, title,
  description (≤3 lines, no fixed blank box on phones), progress, stats, full-width action. Artwork within ±0.12 of 16:9
  fills the frame; other shapes are shown whole (`contain`) over a blurred copy of themselves. Tablet/desktop grid
  unchanged.
- Verified: no overflow 320–1920 on courses/offers/Code Pratique; offers arrows, rapid clicks, swipe, height follow,
  active purchase button mapping; desktop offers/courses screenshots unchanged. Screenshots `3-mobilefix_*`.

## Offers on phones: purchase button always visible (2026-11-27, mandatory conversion rule)

- `offers.js` measures the space actually visible for the card: the bottom of the main scroll area, clamped by
  `innerHeight` and `visualViewport` (browser bars, keyboard), minus the space above the carousel, the counter and the
  bottom padding (which carries `env(safe-area-inset-bottom)`). It sets `--offer-max-h` and re-measures on resize,
  orientation change and `visualViewport` resize.
- CSS caps the active card at that height as a flex column. The banner, image (≈25% of the space, 56–172px), terms,
  price line (discount · old price · price on one row) and purchase footer keep their size. Only the benefits list
  shrinks and scrolls, with a fade hint while more remains. The footer has a full-width orange button (≥46px, 44px on
  very short screens) and keeps the green "already owned" and grey "unavailable" states plus the top-up link.
- Compaction steps at `max-height: 700px` and `600px`. Benefit icons are 16px with hairline separators; arrows (36px)
  are centred on the card's sides in 20px gutters; the counter and dots sit under the card.
- Offer names stay hidden as before (existing rule covered by the test); the terms box remains the headline.
- Verified programmatically in same-origin frames with 8 realistic offers (1–16 benefits, Arabic and French,
  discounts, owned, unavailable, renewal, upgrade, instalments). The button and the whole card were inside the
  viewport, with no page scroll and the correct active card, at first render and after every next/previous step:
  320×568, 360×640, 375×667, 390×844, 393×852, 412×915, 430×932, plus short heights 390×664, 375×553, 320×480.
  That is 150/150 checks passed.
- `tests/timed-offers.test.js`: on phones (≤600px) the 16-benefit list may now scroll inside the card (it used to
  require no scroll). The test also checks that every offer's button and card are inside the viewport after each arrow
  step. Desktop assertions are unchanged.

## Phase 3 — learning page header + real-render proof (2026-11-27, owner-authorised)

- **Lesson header** (`public/css/course-details.css`, appended block; `?v=20261127-header1`):
  - Lessons no longer show the chapter line above the title, on desktop or mobile. The text stays in the DOM for screen readers; chapter data, outline and navigation are unchanged. Replays keep « Replay de la séance · date ».
  - Desktop ≥1280: one row « back · title · counter · tools ». 1024–1279: back/counter/tools, with the title underneath.
  - Below 1024: back button on the left and lesson-list button on the right of one row, then a compact title (clamp 1–1.2rem, 800) with « Leçon x / y » inline right after its last word.
  - Video top at 390×844: ≈280px → 165px.
- **Proof in a real rendering browser**: the in-app pane was hidden and paused `requestAnimationFrame`. A headless Chrome run with mobile emulation (scratch `mobile-proof.mjs`, local preview, synthetic data only) recorded every animation frame of one arrow slide. At 390×844 scrollLeft goes 0 → 331 px over ≈280 ms (ease-out, ~60 fps); at 360×640, 0 → 301 px. A real touch swipe, a triple tap on « previous » and the after-next state were all checked: active offer correct, button in view, card in view, no page scroll, no page errors. Screenshots `5-phase3_*` (390×844 and 360×640, including a mid-slide frame).
- **Failing regression test explained** (`live-multi-audience.test.js`, « OR session migration… »): its sandbox loader stubs every import of `routes/content.js`. The concurrent, uncommitted lesson-thumbnail work added `import … from "../services/lesson-thumbnails.js"` to `routes/content.js` (with new untracked `services/lesson-thumbnails.js`). That specifier is missing from the test's stub map, so `assert.ok(exports, specifier)` fails with exactly that path. It is unrelated to the UI changes, which never touch `routes/` or that test. The fix belongs to the thumbnail work: add a `'../services/lesson-thumbnails.js'` stub to the test's dependency map. It was not hidden or skipped.