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

## Known/pre-existing (not changed)

- On phones the open sidebar covers the hamburger (header `backdrop-filter` + `z-index:150` traps the fixed
  toggle); closing works through the overlay and after navigation. Pre-existing in `user.css`.
- Mobile sidebar hides the "Synta Academy" logo text (pre-existing ≤1024px rule).
