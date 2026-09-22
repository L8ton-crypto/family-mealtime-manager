# Slice 5 — Service: first run, PWA, keyboard, deploy readiness

Read `docs/VISION.md`, `docs/ARCHITECTURE.md`, and the Build notes of slices 00 to 04 first.

## Goal

Make it feel finished. A brand-new household can clock in, seat the family, and fire a week in under
five minutes without reading anything. It installs to a phone home screen like a real app. Nothing
ships with a rough edge.

## Scope

### 1. First run — "Opening night"

When there are zero members, The Pass shows a three-step opening-night flow instead of the empty state,
each step a Ticket with a mono `STEP 1 OF 3` header:

1. `SEAT THE FAMILY` — an inline member form (reuse The Table's form) with a `Seat them` action; after each
   seat a small avatar joins the row; `Next` when at least one is seated.
2. `CHECK THE MENU` — shows the count of seeded dishes and how many are safe for everyone at the table
   (`38 OF 42 DISHES ARE SAFE FOR EVERYONE`); lists the unsafe ones with who they're unsafe for; `Next`.
3. `FIRE YOUR FIRST WEEK` — a `pass` Button that runs Fire the week for dinners and lands on the draft
   proposals with the sticky Fire bar. `Skip` goes to the plain Pass.

The flow is state-derived (no members → step 1), not a stored flag, so deleting everyone brings it back.

### 2. PWA

- `src/app/manifest.ts` (Next metadata route) with name `The Rice Kitchen`, short name `Rice Kitchen`,
  `display: standalone`, `background_color` = counter, `theme_color` = counter, start URL `/`.
- Icons: generate `public/icons/icon.svg` (a pass-orange ticket with a perforated top edge and `RK` in the
  display font rendered as paths or plain bold sans; no external font dependency in the SVG), and PNGs at
  192 and 512 plus `apple-touch-icon.png` at 180. Generate the PNGs with a script (`scripts/icons.mjs`, using
  `sharp` as a devDependency) and commit the outputs.
- `<meta name="apple-mobile-web-app-capable">`, status bar style `black-translucent`, and `viewport-fit=cover`
  with safe-area padding on the bottom tab bar.
- No service worker and no offline mode (private app, always online). Say so in the README.
- An `Add to home screen` hint ticket shows once on iOS Safari when not installed (detect `standalone`),
  dismissible, remembered in `localStorage`.

### 3. Keyboard (desktop)

`[` and `]` move a week on The Pass, `t` goes to today, `f` opens Fire the week, `/` focuses search on The Menu,
`Esc` closes any Sheet. A `?` key shows a small Ticket listing them. Ignore keys while typing in a field.

### 4. Settings sheet

Clock out currently sits in the top bar. Replace it with a small `Settings` Sheet (lucide `Settings` icon):
theme toggle, `Clock out`, app version (from `package.json`), and a `Household` block showing member count,
dish count, and a `Print the order` shortcut. Keep the bottom tab bar to four tabs.

### 5. Hardening pass

- Every API route returns `Cache-Control: no-store`.
- Every page renders correctly with an empty database and with the seeded database.
- Error boundaries: `src/app/(app)/error.tsx` renders a red-ruled Ticket `SOMETHING FELL OFF THE PASS` with a
  `Try again` button; `not-found.tsx` renders `NOT ON THE MENU` with a link home.
- Loading states: `loading.tsx` per route group with skeleton tickets (no spinners).
- Lighthouse on `/` (authenticated, desktop and mobile) ≥ 90 for Performance, Accessibility, Best Practices.
  Fix contrast issues, focus rings (visible pass-orange focus ring on all interactive elements), labels,
  and tap-target sizes as needed.

### 6. Deploy readiness

- `README.md` final: what it is, the concept in a paragraph, screenshots list, env vars, local dev, migrate,
  seed, deploy steps for Vercel (link the GitHub repo, set `DATABASE_URL`, `APP_PASSPHRASE`, `SESSION_SECRET`,
  build runs migrations), and a note on choosing a strong passphrase (a sentence, not a word).
- `vercel.json` only if needed; otherwise remove.
- `npm run check` script = `npm test && npm run lint && npm run build`.

## Acceptance criteria

1. Fresh database: log in, complete opening night, end with a fired week of dinners, all inside the flow.
2. Manifest validates in Chrome's Application panel; icons present; installs to home screen on Android Chrome
   and iOS Safari (verify at least the manifest and meta tags and the hint ticket).
3. Every keyboard shortcut works and none fires while typing.
4. Settings sheet works; Clock out clears the cookie and lands on `/login`.
5. Error boundary renders on a forced throw; not-found renders on `/nope`.
6. Lighthouse thresholds met and recorded in the Build notes with the numbers.
7. `npm run check` green. No emojis, no `any`.

## Build notes

**What was built.** Every item in Scope: both carry-over fixes from the Slice 4 review (below);
Opening night (`src/components/pass/OpeningNight.tsx`, three steps — Seat the family, Check the
menu, Fire your first week — mounted by `PassView.tsx` when the household is empty); the PWA
(`src/app/manifest.ts`, `public/icons/icon.svg` hand-designed and rasterized by `scripts/icons.mjs`
(`sharp` devDependency) to `icon-192.png`/`icon-512.png`/`apple-touch-icon.png`, all three committed;
`appleWebApp`/`viewport` metadata in `src/app/layout.tsx`; `src/components/shell/InstallHint.tsx`;
no service worker, documented in the README); keyboard shortcuts (`src/hooks/useKeyboardShortcuts.ts`,
bindings registered by `AppShell` (`?`), `PassView` (`[`/`]`/`t`/`f`) and `/menu` (`/`), plus
`src/components/shell/ShortcutsHelp.tsx`); the Settings sheet (`src/components/shell/SettingsSheet.tsx`,
`src/hooks/useTheme.ts`) replacing the old bare Clock out button and standalone theme toggle in the
top bar; the hardening pass (`Cache-Control: no-store` centrally in `src/proxy.ts`,
`src/app/(app)/error.tsx`, `src/app/not-found.tsx`, a `loading.tsx` per route group, a global
`:focus-visible` rule in `globals.css`, and the Lighthouse-driven accessibility fixes below); and
deploy readiness (README rewritten, `vercel.json` removed, `npm run check`).

**Carry-over fixes (Slice 4 review).**
1. **The Order receipt's "PRINTED" timestamp used a locale month abbreviation.** Added
   `formatDateTimeStamp` to `src/lib/dates.ts` (3 new unit tests in `dates.test.ts`): unlike every
   other function in that file (which deliberately avoid local `Date` getters so a calendar-day
   string can never shift across timezones), this one formats a real `timestamptz` — "printed at" —
   and so deliberately DOES read local wall-clock getters (`getDate()`/`getHours()`/`getMinutes()`),
   the same "show the viewer their own local time" rationale `todayISO()` already documents. It reuses
   the module's own `MONTH_ABBR` instead of `toLocaleString('en-GB', { month: 'short' })`, which had
   rendered "SEPT" (not "SEP") on the machine this was built on. `OrderView.tsx`'s local
   `formatPrintedAt` helper was deleted in favour of it.
2. **Audited the whole app for other locale-formatted dates.** `grep`'d `src/` for
   `toLocaleDateString|toLocaleString|toLocaleTimeString|Intl\.DateTimeFormat` outside `dates.ts` —
   the `OrderView.tsx` instance above was the only match. No other locale-dependent date formatting
   exists anywhere else in the app.

**Decisions and deviations.**
- **Opening night's entry is state-derived, but progression through its three steps is ordinary
  component state, not re-derived on every render.** `PassView` decides ONCE, the moment
  `useMembers()` first resolves, whether to mount `OpeningNight` (`members.length === 0` at that
  moment) — not on every render, which would bounce straight back to the normal Pass the instant
  step 1 seats its first member (since the household is then no longer empty). Reloading the page
  mid-flow, after seating at least one member, intentionally lands on the normal Pass rather than
  resuming step 2 — there is no persisted "onboarding in progress" flag anywhere, per the spec's "not
  a stored flag" instruction. Deleting every member still brings the whole flow back from step 1, the
  next time `PassView` mounts with zero members. Documented in `OpeningNight.tsx`'s own doc comment.
- **Step 3 ("Fire your first week") reuses `PassView`'s own `handleFireTheWeek`**, the exact function
  the header's "Fire the week" button and keyboard shortcut already call — not a re-implementation.
  It fires for `slots: ['dinner']`, every seated member as `attendees`, and `keepExisting: true`.
  Because that function's own state (`drafts`, `fireSheetOpen`) lives in `PassView` itself, calling it
  from the child `OpeningNight` component and then closing the opening-night flow (`onDone`) leaves
  `PassView` already holding whatever drafts the fill run produced — the normal Pass renders straight
  into the sticky Fire/Scrap bar with no extra plumbing.
- **Step 1's inline form remounts (`key={members.length}`) after every successful "Seat them"**, so
  seating a second person starts from an empty form rather than the previous person's leftover values
  — the spec's "after each seat a small avatar joins the row" implies seating is meant to repeat.
- **Settings consolidates BOTH the old standalone `ThemeToggle` icon and the old bare Clock out
  button into one Settings icon**, not just Clock out. The spec lists "theme toggle" as one of the
  sheet's own contents, which only makes sense as a real design decision (not two competing ways to
  change theme) if the top-bar's separate theme icon is retired at the same time — the top bar now
  has exactly one control besides the logo and nav. `ThemeToggle.tsx` was deleted; its logic moved to
  `src/hooks/useTheme.ts`, shared by `SettingsSheet` (nothing else needs it now).
- **`useKeyboardShortcuts` is one small hook, called once per page/shell with only the keys that page
  owns** (`AppShell`: `?`; `PassView`: `[`/`]`/`t`/`f`; `/menu`: `/`), rather than one global keymap —
  each call independently ignores typing targets and open dialogs, so there's never a collision to
  arbitrate between pages, and a page that doesn't register a key simply doesn't respond to it. `Esc`
  is deliberately never bound here — `Sheet.tsx` already closes on Escape (Slice 2), and re-handling
  it in this hook too would be redundant, not additive.
- **The shortcuts help ticket (`ShortcutsHelp.tsx`) is its own small centered overlay, not built on
  the shared `Sheet` component.** `Sheet`'s desktop popover needs a real `anchorRef` to position
  itself sensibly (see docs/slices/04-order.md's carry-over fix 4, where `FireTheWeekSheet` collapsed
  to the viewport's top-left corner without one) — `?` has no single triggering element to anchor to,
  so a plain centered overlay suits a short, read-only list better than fighting `Sheet`'s anchoring
  for a currentless case.
- **`useKeyboardShortcuts`'s dialog-open guard checks for `[role="dialog"][aria-modal="true"]`
  generically**, which happens to also cover `ShortcutsHelp`'s own markup (it renders the same
  attributes) — pressing `?` again while the help ticket is already open is a no-op rather than a
  toggle, and every other shortcut is correctly suppressed while it's up, satisfying "ignore keys...
  while a Sheet is open" for this ticket too even though it isn't literally a `Sheet`.

**Lighthouse (production build, `npm run build && npm run start -- --port 3111`, `npx lighthouse`
headless with the real session cookie via `--extra-headers`, against `/` authenticated).**

| | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| Desktop | 98 | 100 | 100 | 54 |
| Mobile | 95 | 100 | 100 | 54 |

All three required categories are comfortably ≥90 on both form factors. SEO is deliberately low (54)
and out of scope — this is a private, `noindex, nofollow` household app (`src/proxy.ts` sets
`X-Robots-Tag` on every response), so an SEO audit penalizing exactly that is expected, not a defect.

The first run surfaced three real accessibility findings (mobile accessibility was 88, desktop 94,
both below the 90 gate), all fixed and re-verified with a second run (both 100):
1. **`button-name` (mobile only) — the header's "Fire the week" button had no accessible name once
   its text label (`<span className="hidden sm:inline">`) was actually hidden below the `sm`
   breakpoint**, leaving only an `aria-hidden` icon. Added an explicit `aria-label="Fire the week"` to
   the button (and marked the now-redundant span `aria-hidden` too, since an explicit `aria-label`
   fully overrides content-based name computation). Audited the same header for the identical pattern:
   the "Order" link relied on the same hidden span plus a conditionally-rendered, `aria-hidden` count
   badge and an `sr-only` span that was **empty whenever the order had zero unticked lines** — a
   latent "genuinely nameless link" bug this specific test run didn't happen to catch (the fixture
   order had 38 unticked lines), fixed the same way with an explicit, count-aware `aria-label`. The
   "Past services" link already had its own explicit `aria-label` from an earlier slice and needed no
   change.
2. **`color-contrast` (both) — "past day" styling dimmed entire subtrees with `opacity-50`/`opacity-60`
   against the near-black counter background**, which (independent of any individual token's own
   contrast) roughly halves the rendered luminance difference and dropped every bit of text inside —
   weekday labels, slot labels, "+ Fire something" — below the required 4.5:1 ratio (measured as low
   as 2.55–3.16). Removed the opacity treatment entirely from both the desktop `DayColumn` and the
   mobile day-strip button in `PassView.tsx` (kept the `isPast` prop/value, now only exposed via a
   harmless `data-past` attribute, as a hook for a future contrast-safe treatment) — past days are now
   distinguished only by the border/colour differences every non-today day already had, never by
   dimming text.
3. **`heading-order` (both) — `PassTicket`/`DraftTicket` used `<h3>` for a dish name directly under
   the page's own `<h1>` (`PageHeader`), with no `<h2>` anywhere on the page**, an invalid level skip.
   Changed both to `<h2>` — the only sub-heading level The Pass actually has.

**Browser QA (production build on port 3111, unless noted; dark and light, 390px and 1200px).**
- **Opening night, end to end against the real household**, using the sanctioned technique from this
  brief: recorded Ada's exact record (id 12: child, colour `#5C9DF6`, likes `[pasta]`, dislikes
  `[mushrooms]`, allergies `[fish]`) and the 6 real dinner plan entries (ids 65/67/68/69/70/71, Tue–Sun,
  each `attendees: [12]`), then `DELETE /api/members/12`. The Pass immediately showed step 1 ("STEP 1
  OF 3 · SEAT THE FAMILY"). Recreated Ada through the real inline form (new id 19; a `TagEditor`
  index-based DOM-automation slip put "mushrooms" in Likes instead of Dislikes on the very first
  attempt — caught immediately by reading the created member back from the API, corrected with one
  `PATCH`, not a code bug) — the avatar row updated live and "Next" enabled once seated. Step 2 showed
  "29 of 34 dishes are safe for everyone" with the correct 5 fish-containing dishes listed as `NOT FOR
  ADA` (`refreshRecipes()` on the step 1→2 transition correctly picked up Ada's freshly-restored
  allergy before computing this). Step 3, fired against a genuinely empty future week (`?week=2026-10-05`,
  chosen specifically so this run wouldn't collide with the real Tue–Sun fixture data or the "no
  proposals for a past day" rule) landed the normal Pass showing 7 real draft dinner tickets with the
  sticky `FIRE 7 TICKETS` / `Scrap` bar — confirmed `Scrap` writes nothing (`GET /api/plan` for that
  week returned `[]` afterward). Restored Ada as attendee on all 6 original entries via 6 `PATCH`
  calls, then confirmed the exact required baseline via the real API: 1 member (Ada, id 19, same
  name/age_group/colour/likes/dislikes/allergies as the original id 12), 34 recipes, 6 planned entries
  each with `attendees: [19]` on the original dates/recipes, 0 ratings (`/api/ratings/clean-plates`
  returned `{}`), 38 order lines, 0 checked. Also visually re-confirmed live: `/table` showed Ada with
  `NEXT SERVICE: TUE DINNER · CHICKEN FAJITAS` and the exact likes/dislikes/allergy chips; `/` showed
  all 6 real dinners; `/order` showed the real 38-line receipt with `PRINTED 22 SEP 21:19`.
- **PWA.** `curl`'d `/manifest.webmanifest` unauthenticated (public path) — correct name/short_name/
  `display: standalone`/background+theme colour (`#0C0C0D`)/both icon entries, `200`, `cache-control:
  public, max-age=0, must-revalidate` (Next's own static-manifest caching, unrelated to and unaffected
  by the API `no-store` rule). Both PNG icons and the apple-touch-icon served `200 image/png` from
  `/icons/*` (already public in `src/proxy.ts` from Slice 0). Visually inspected the rasterized
  `icon-512.png`: pass-orange fill, 9 perforation dots along the top edge, a legible dark "RK"
  monogram — matches the source SVG design.
- **Keyboard shortcuts**, all live against the real running app: `?` opened `ShortcutsHelp` listing
  all seven bindings; `]`/`[` moved The Pass a week forward/back (`location.href` confirmed
  `?week=2026-09-28` then back to `?week=2026-09-21`); `t` returned to today's week after navigating
  away; `f` opened `FireTheWeekSheet`; while that sheet was open, `]` was confirmed **inert**
  (`location.href` unchanged) — "ignore keys while a Sheet is open"; opened the real `DishPicker`
  ("Fire something"), focused its "Or type your own" field, and typed `ft[` — all three characters
  landed in the field verbatim, the sheet stayed open and the URL never changed, confirming shortcuts
  are ignored while typing. On `/menu`, `/` focused the Search field (verified `document.activeElement`
  was the actual search `<input>`) — this needed a `requestAnimationFrame` fix mid-build: the handler
  originally called `setFiltersOpen(true)` and `.focus()` in the same tick, but at the mobile
  breakpoint the search field lives inside a `hidden`-by-default panel, and calling `.focus()` on a
  still-`display: none` element in the same tick as the state update that reveals it is a silent
  no-op in every browser — deferring the focus call to the next paint (`requestAnimationFrame`) fixed
  it, re-verified live afterward.
- **Settings sheet**, live: opened via the header's Settings (gear) icon; theme toggle flipped the
  whole app to light and back (confirmed via `data-theme`), Household showed the live `1 member at the
  table` / `34 dishes on the menu`, `Print the order` linked to `/order`, footer showed `The Rice
  Kitchen · v0.1.0` (from `package.json`), and `Clock out` — tested separately by inspecting the
  button's wiring (identical `fetch('/api/auth/logout')` + redirect the old top-bar button used) rather
  than actually ending the authenticated session mid-verification pass.
- **Error boundary / not-found.** Temporarily added `throw new Error('QA forced error')` as the first
  line of `TablePage` and navigated to `/table` in production: rendered `86'D` / `SOMETHING FELL OFF
  THE PASS` with a red left-ruled Ticket and a working `Try again` button, correctly nested INSIDE
  `AppShell` (nav bar visible above it, confirming `(app)/layout.tsx` stays mounted around a child
  segment's error) — removed immediately after confirming, not left in the codebase.
  `GET /nope` rendered `NOT ON THE MENU` with a link home, confirmed via `get_page_text`.
- **Cache-Control.** `curl -I` against `/api/members` (unauthenticated, `401`) and `/api/recipes`
  (unauthenticated, `401`) both returned `cache-control: no-store` — set unconditionally for every
  `/api/*` path in `src/proxy.ts` regardless of the auth branch taken, so it applies identically to
  every 200/400/401/404/429 response any route handler can produce, with zero per-route code.
- **Focus rings.** Visually confirmed a visible pass-orange outline on the Settings icon (after
  `Escape`-closing the sheet, which restores focus to the trigger) and on `ShortcutsHelp`'s Close
  button, from the new global `:focus-visible { outline: 2px solid var(--pass); }` rule in
  `globals.css` — a single catch-all rather than auditing every button/link individually, since
  `Field`'s own inputs already carried their own explicit focus ring from Slice 0.
- **390px / 1200px, dark / light.** The Pass, The Menu, The Table and The Order were all screenshotted
  at both breakpoints in both themes (light-mode screenshots taken against the production build, after
  the Lighthouse pass); tickets, chips, the receipt's perforated/torn edges and the opening-night
  tickets all read correctly in every combination, no emojis anywhere, no `any` in any file this slice
  added or touched (`tsc`'s own `strict` build already enforces this, but checked by eye too in the
  new files).

**Verification.** `npm run check` (`npm test` — 346 tests, 3 new; `npm run lint`; `npm run build`) all
green. No new migration — this slice needed no schema change, per the brief's "unless you find a real
reason." `npm run migrate` confirmed idempotent (all 6 existing migration files skipped, "Database is
up to date").

**Deferred / out of scope for this slice** (per spec, not gaps): no service worker / offline mode
(explicitly out of scope, documented in the README's own "PWA" section as a deliberate choice, not an
omission). No Android Chrome install-prompt hint (`beforeinstallprompt`) — the spec's hint ticket is
iOS-Safari-specific (Android's own native install UI needs no in-app nudge). SEO score not pursued
past its current 54 — deliberately not gated by this slice's acceptance criteria, and actively
undesirable to "fix" for a `noindex` private app.
