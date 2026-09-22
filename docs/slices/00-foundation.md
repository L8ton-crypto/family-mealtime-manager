# Slice 0 — Foundation: lock-down, single tenant, design system, The Table

Read `docs/VISION.md` and `docs/ARCHITECTURE.md` first. They are the contract.

## Goal

Turn the current multi-family prototype into a locked-down, single-household app with the full
design system in place and one real screen (The Table) built in that design. After this slice,
every later slice only adds screens and tables.

## Scope

### 1. Remove multi-tenancy

- Delete `src/lib/familyCode.ts`, the family-code UI on the dashboard, and every `family_code` /
  `familyCode` reference in code and SQL.
- Delete the old `suggest` and `meals` pages and API routes and `src/lib/suggestions.ts`. They will be
  rebuilt properly in later slices. Keep the 32 meal ideas by copying them verbatim into
  `docs/seed/meal-ideas.json` (name, tags, allergens, description) so Slice 1 can seed real recipes from them.

### 2. Migrations

- `scripts/migrate.mjs` and `db/migrations/001_foundation.sql` as described in ARCHITECTURE.
- `001_foundation.sql`: `DROP TABLE IF EXISTS fm_meals; DROP TABLE IF EXISTS fm_members;` then create
  `fm_members` (new shape), `fm_login_attempts`. (`fm_migrations` is created by the script itself.)
- `package.json` scripts: `migrate`, `test`, and `build` = `node scripts/migrate.mjs && next build`.
- Add `.env.example` with `DATABASE_URL`, `APP_PASSPHRASE`, `SESSION_SECRET` and a comment on generating the secret.
- Add `APP_PASSPHRASE` and `SESSION_SECRET` to the existing `.env.local` (it already holds `DATABASE_URL`;
  do not print or commit it). Generate a real random secret. Pick any dev passphrase you like (it lives only in `.env.local`).

### 3. Auth

- `src/lib/session.ts`: `createSessionToken()`, `verifySessionToken(token)`, `SESSION_COOKIE` name,
  cookie options helper. Web Crypto only. Unit tests: round trip, tampered signature fails, expired fails,
  malformed fails.
- `src/lib/passphrase.ts`: constant-time compare against `APP_PASSPHRASE`.
- `src/app/api/auth/login/route.ts` and `logout/route.ts` per ARCHITECTURE, including the
  `fm_login_attempts` rate limit and 300ms failure delay.
- `src/proxy.ts` gating as specified, with the `X-Robots-Tag` header on every response.
- `src/app/login/page.tsx`: **the Staff Entrance.** Full-screen dark counter. A single paper Ticket
  centred, mono header `STAFF ENTRANCE · RICE KITCHEN`, display heading `CLOCK IN`, one passphrase field
  (type password, autofocus, autocomplete="current-password"), one `pass` Button "Clock in".
  Wrong passphrase: the ticket shakes (respecting reduced motion) and a red `REJECTED` Stamp appears on it.
  Rate limited: stamp reads `TAKE FIVE` and copy says to wait 15 minutes. On success, hard-navigate to `next` or `/`.

### 4. Design system

Implement every token, font and component listed in VISION.md under `src/components/ui/`:
`Ticket`, `Stamp`, `Chip`, `Button`, `Field` (text, select, textarea), `PageHeader`, `EmptyState`,
plus `src/components/shell/AppShell.tsx`, `Nav.tsx`, `ThemeToggle.tsx`.

- Fonts via `next/font/google` in the root layout, exposed as CSS variables.
- Theme: `data-theme="dark|light"` on `<html>`, default dark, persisted in `localStorage`, applied before
  first paint with a tiny inline script to avoid flash. Tokens switch via `[data-theme="light"]` overrides.
- Paper grain and counter noise via CSS/inline SVG only.
- The perforated ticket edge, hard shadows, stamp rotation and the spring-in motion are all required.
  Reduced motion must be honoured.
- Nav: bottom tab bar on `< md`, top bar on `>= md`. Tabs: The Pass `/`, The Menu `/menu`, The Table `/table`,
  The Order `/order`. Menu and Order can be placeholder pages this slice, each an `EmptyState` ticket with
  a `SOON` stamp and honest copy ("The menu is being written." / "No orders yet."). Do not reference slices.
- Top bar holds the wordmark `THE RICE KITCHEN` (display font), `ThemeToggle`, and a "Clock out" action.

### 5. The Pass (home) — minimal for now

`/` shows: mono kicker with today's date (`MON 22 SEP 2026`), display heading `TONIGHT'S SERVICE`, a row of
member avatars (initial on a coloured disc, colour from the member) titled "At the table", and an
`EmptyState` ticket: stamp `NO TICKETS`, copy "The pass is empty. Put something on the menu first.",
action linking to `/menu`. If there are no members, the empty state instead points to `/table` with
"Seat the family first."

### 6. The Table — full CRUD in the new design

`/table` and `src/app/api/members/route.ts` + `src/app/api/members/[id]/route.ts` (GET list, POST,
PATCH, DELETE) with zod validation. Single tenant.

- Each member is a Ticket: mono header `SEAT 01 · ADULT`, name in display font, coloured avatar disc,
  chips for likes (plain), dislikes (ink-soft), restrictions (outlined), allergies (red outlined, with a
  small alert icon). Edit and Remove actions.
- Add/edit form on a Ticket (inline, not a modal): name, age group (segmented control, not a native select on
  desktop; native select is acceptable on mobile), colour (eight swatches), and four tag editors with preset
  chips + custom entry. Restrictions and allergies presets as in ARCHITECTURE.
- Remove asks for confirmation inline (button turns into "Really 86 them?" with confirm/cancel).
- Reorder: up/down buttons on each ticket, persisted via `sort_order`. Drag-and-drop not required.
- `src/hooks/useMembers.ts` for data access.

### 7. Housekeeping

- Update `README.md`: what it is, env vars, `npm run migrate`, `npm run dev`, `npm test`.
- Remove Vercel Analytics and Speed Insights (this is private; no telemetry).
- Remove `vercel.json` only if it is empty/irrelevant; otherwise leave it.
- Add `vitest` and `zod` and `lucide-react` as dependencies. Keep everything else as is.

## Acceptance criteria

1. Visiting any page or API route without the cookie redirects to `/login` (pages) or returns 401 (API).
2. Correct passphrase sets an httpOnly cookie and lands on the requested page; wrong shows `REJECTED`;
   11th failure in 15 minutes returns 429 and the UI shows `TAKE FIVE`.
3. `npm run migrate` against the real Neon database succeeds and is idempotent on a second run.
4. No `family_code`, `familyCode`, analytics or emoji anywhere in `src/`.
5. Members can be created, edited, reordered and removed on `/table`, on a 390px viewport and on desktop,
   in dark and light, and the data survives a reload.
6. `npm test`, `npm run lint`, `npm run build` are green.
7. The UI matches VISION.md: paper tickets with perforated edges on a dark counter, Bebas Neue display,
   mono ticket headers, pass-orange primary, red reserved for allergens/destructive, stamps, spring-in motion.

## Build notes

**What was built.** Every item in Scope: multi-tenancy removed (`familyCode.ts`, `suggest`/`meals`
pages and API routes, `useFamily.ts`, old `Nav.tsx` all deleted; the 32 meal ideas copied verbatim
into `docs/seed/meal-ideas.json`); `scripts/migrate.mjs` + `db/migrations/001_foundation.sql`
(idempotent, tracked in `fm_migrations`, applied for real against the Neon database — see
Acceptance criteria below); `src/lib/session.ts` (Web Crypto HMAC-SHA256 session tokens, 14 unit
tests covering round trip / tampered signature / tampered payload / expired / malformed) and
`src/lib/passphrase.ts` (constant-time compare via SHA-256 digest comparison, since the two
strings being compared aren't naturally equal-length); `/api/auth/login` and `/logout`; `src/proxy.ts`
gating every route except `/login`, `/api/auth/login`, and static assets, with `X-Robots-Tag` set
on every response; the full design system under `src/components/ui/` (`Ticket`, `Stamp`, `Chip`,
`Button`, `Field`/`FieldSelect`/`FieldTextarea`, `PageHeader`, `EmptyState`) and
`src/components/shell/` (`AppShell`, `Nav`, `ThemeToggle`); the Staff Entrance login page with
shake + `REJECTED`/`TAKE FIVE` stamps; The Pass (`/`), The Table (`/table`, full CRUD + inline
edit + reorder + inline remove-confirm), and placeholder EmptyState pages for The Menu and The
Order; `src/hooks/useMembers.ts`.

**Decisions made.**
- `src/lib/db.ts`'s `sql` export is a `Proxy` around a lazily-created Neon client, so it stays lazy
  (no `DATABASE_URL` read at import time, matching "no schema creation at runtime") while still
  correctly forwarding both `sql\`...\`` tagged-template calls and `sql.query(...)`/`sql.unsafe(...)`.
- jsonb columns (`likes`/`dislikes`/`restrictions`/`allergies`) are written as
  `${JSON.stringify(value)}::jsonb` rather than passing the JS array directly — the Neon HTTP
  driver doesn't serialize JS arrays as JSON for a jsonb column on its own.
- Reorder has no dedicated endpoint; the up/down buttons swap `sort_order` between the two
  affected members via two `PATCH` calls (no unique constraint on `sort_order`, so a transient
  duplicate is harmless — `ORDER BY sort_order, id` keeps it deterministic).
- `(app)/page.tsx` (The Pass) is a Server Component that queries `fm_members` directly and is
  marked `export const dynamic = 'force-dynamic'` — without that, Next statically prerendered it
  at build time and baked in whatever members existed in the database *during the build*, which
  would go stale immediately.
- The `ghost` Button variant is styled ink-toned (`text-ink-soft` on paper), not chalk-toned. Every
  actual usage in this slice (Edit/Remove/Cancel) sits on a Ticket's paper surface, which stays
  light in both themes — chalk-on-paper was invisible in dark mode (caught during browser QA, see
  below).
- `.rk-ticket` sets `align-self: start`. The ticket's hard-shadow layer is an absolutely
  positioned `inset: 0` div sized to match the paper's own content height; a flex/grid parent's
  default `align-items: stretch` (e.g. the two-column grid on `/table`) would stretch the whole
  ticket to a taller sibling's height and leave the shadow floating below the visible paper.
  Fixed at the component level so it can't recur wherever `Ticket` is dropped in later slices.
- `<html>` carries `suppressHydrationWarning`, but *not* a `data-theme` prop — see "QA fixes" below;
  the original approach (rendering `data-theme="dark"` from React and relying on
  `suppressHydrationWarning` alone) turned out not to actually suppress the warning.
- Two `react-hooks/set-state-in-effect` lint errors (new in `eslint-plugin-react-hooks` v7) are
  suppressed with a one-line justification each, in `ThemeToggle` (one-time read of the
  `data-theme` attribute the inline script already set) and `useMembers` (the hook's whole job is
  fetch-on-mount; there's no server-rendered data to seed initial state with here).
- `next.config.mjs`'s `typescript.ignoreBuildErrors` / `eslint.ignoreDuringBuilds` (inherited from
  the prototype) were removed so `npm run build` actually catches real errors, and
  `turbopack.root` was pinned to this project directory — an unrelated sibling
  `clawd/package-lock.json` outside this repo was otherwise making Next guess the wrong workspace
  root.
- `@vercel/analytics` and `@vercel/speed-insights` were uninstalled (not just deleted from
  `layout.tsx`) per "remove... no telemetry." `vercel.json` was left as-is (`{"framework":
  "nextjs"}` isn't empty or irrelevant).
- Age group is one segmented control on both breakpoints (not a native `<select>` swapped in on
  mobile) — the spec allows a native select on mobile but doesn't require it, and one code path is
  simpler and already meets the "not a native select on desktop" requirement.
- Likes/dislikes have no preset chips (only custom entry) since ARCHITECTURE only lists presets
  for restrictions and allergies; the `TagEditor` component still supports presets generically for
  when Slice 1+ wants them elsewhere.

**Browser QA.** Ran the app live (dev server) through dark/light and 1280px/390px, driving the
Staff Entrance (wrong passphrase → shake + `REJECTED`; correct → hard navigate), The Pass in both
empty states, and full Table CRUD (create with tags, reorder persisted across reload, remove
confirm/cancel). Two of the three decisions above (ghost-button contrast, ticket shadow stretch)
were bugs this QA pass caught and fixed, not pre-existing design choices.

**Deferred / out of scope for this slice** (per spec, not gaps): The Menu and The Order are
`EmptyState` placeholders only — no recipes, no shopping list. Drag-and-drop reordering (explicitly
not required; up/down buttons only). Per-member GET on `/api/members/[id]` (not needed by any
current screen; PATCH/DELETE are implemented). No rate-limit cleanup job for old
`fm_login_attempts` rows — they're only ever queried within a 15-minute window, so stale rows are
inert, not incorrect, but a later slice may want to prune them.

## QA fixes

A QA pass came back "fix first" with seven findings. All seven are addressed; here's what changed
and how each was verified (test/lint/build were re-run green after all of them together, then each
fix was separately re-verified live against a dev server as below).

1. **BLOCKER — rate limit key was attacker-controlled.** `getClientIp()` used to trust the *first*
   entry of `x-forwarded-for`, which a client can freely prepend to — QA proved 15 spoofed attempts
   never hit 429. Moved the IP derivation into `src/lib/clientIp.ts`: (a) `x-vercel-forwarded-for`
   if present (Vercel sets this itself; not client-controlled), else (b) `x-real-ip`, else (c) the
   **last** entry of `x-forwarded-for` (the one a trusted proxy actually appends — each hop adds to
   the end, never the front), else `'unknown'`. 7 unit tests in `clientIp.test.ts` cover all four
   branches plus "spoofed prepended hops don't change the result". Also added a global backstop in
   `src/app/api/auth/login/route.ts`, independent of IP: 100+ failed attempts across *all* IPs in
   the last 15 minutes returns 429 for every request, correct passphrase or not.
   **Verified live:** 10 requests with a constant real (last) IP but a different spoofed first
   entry each time all got `401`; an 11th (also with a fresh spoofed first entry) got `429` —
   proving the old bypass no longer works. A request from a genuinely different real IP in between
   still got a normal `401`, proving we're not just blocking everyone. For the global backstop:
   spread exactly 100 failures across 18 distinct IPs (5 each, none individually near the 10-limit)
   and confirmed a 19th, never-before-seen IP's very first attempt got `429` purely from the global
   count — then confirmed even the *correct* passphrase got `429` while the backstop was active, and
   that after clearing `fm_login_attempts`, both the correct passphrase and fresh wrong attempts
   behaved normally again.

2. **SECURITY — open redirect via `next`.** `src/app/login/page.tsx` hard-navigated to the `next`
   query param after login with only a `startsWith('/')` check, so `//evil.com` (protocol-relative)
   sailed through. Added `src/lib/safeNext.ts`'s `safeNextPath()`: rejects (falls back to `/`)
   anything that doesn't start with `/`, starts with `//`, contains a backslash, or contains a colon
   (rules out any protocol) — also normalizes away tab/newline/CR first, since browsers strip those
   from URLs before navigating, which is a known trick to turn `/\t/evil.com` into `//evil.com`
   after stripping. 15 unit tests in `safeNext.test.ts` cover the accept cases (`/table`,
   `/menu?x=1`) and all four reject cases from the QA report plus extras (`data:`, tab-smuggling,
   no-leading-slash, empty/null/undefined).
   **Verified live:** navigated to `/login?next=https://evil.com`, submitted the correct passphrase
   via the real form, and confirmed `window.location.href` ended up as `http://localhost:3001/` —
   not `evil.com`.

3. **MAJOR — hydration mismatch on `<html data-theme>`.** `suppressHydrationWarning` alone didn't
   suppress it, because React was still rendering `data-theme="dark"` itself and then hitting a real
   mismatch against whatever the pre-hydration script had already set on the live DOM. Fix: `<html>`
   in `src/app/layout.tsx` no longer takes a `data-theme` prop at all — only the inline script sets
   it (falling back to `dark`), so React has no expectation for that attribute and nothing to
   compare. `suppressHydrationWarning` is kept as extra insurance. `globals.css`'s bare `:root`
   selector (already true before this fix) is the dark palette, so the attribute's absence during
   the brief pre-script window still renders dark — no flash either way.
   **Verified live:** set `localStorage['rk-theme'] = 'light'`, then did a full (non-client-routed)
   navigation to `/table` in a fresh tab. Confirmed via `read_console_messages` (pattern `hydrat`)
   that zero hydration-related messages appeared, and the page rendered correctly in light mode.
   Also checked the no-stored-preference case (fresh tab, `localStorage` cleared) renders dark
   immediately with an empty console.

4. **MAJOR — migration atomicity.** `scripts/migrate.mjs` ran each statement of a file with a bare
   `sql.query()`, no transaction, so a failing statement left every earlier statement in that file
   committed and permanently blocked later runs (the file would never be re-attempted once any
   part of it "succeeded"). Fixed by wrapping every statement of a file *and* its `fm_migrations`
   bookkeeping insert in one `sql.transaction([...])` call, so the whole file commits or rolls back
   together.
   **Verified live:** wrote a throwaway `db/migrations/002_test_atomicity.sql` with two statements —
   `CREATE TABLE fm_test_atomicity_check (...)` then an `INSERT` into a misspelled, nonexistent
   table (guaranteed failure). `npm run migrate` reported the failure and exited non-zero; a direct
   query afterwards confirmed `to_regclass('public.fm_test_atomicity_check')` was `null` (table
   never persisted) and `fm_migrations` had zero rows for the file. Deleted the throwaway file and
   re-ran `npm run migrate` clean.

5. **MINOR — reorder wasn't atomic.** The two-`PATCH` swap could interleave with another writer.
   Added `PUT /api/members/order` (`src/app/api/members/order/route.ts`): takes `{ ids: number[] }`,
   400s if `ids` has duplicates or doesn't exactly match the current set of member ids, otherwise
   sets `sort_order` for every member in one `sql.transaction`. `useMembers.moveMember` now sends
   the full reordered id list to this endpoint instead of two independent `PATCH` calls.
   **Verified live:** created 3 members, `PUT` a valid full permutation (200, order persisted on a
   follow-up `GET`), then confirmed 400s for: an incomplete id list, an id list with an unknown
   extra id, and a list with a duplicate.

6. **MINOR — tag hygiene.** `src/lib/members-schema.ts`'s `tagArray` now `.transform()`s every tag
   to lowercase + trimmed and drops case-insensitive duplicates (first-seen order kept), for
   `likes`/`dislikes`/`restrictions`/`allergies` alike. Custom values are still freely allowed —
   only their casing/whitespace/duplication is normalized.
   **Verified live:** `POST /api/members` with
   `likes: ["  Pizza","PIZZA","pizza ","Tacos"]` and `allergies: ["Nuts","NUTS","nuts"]` came back
   as `likes: ["pizza","tacos"]` and `allergies: ["nuts"]`.

7. **MINOR — font preload console noise.** `JetBrains_Mono` in `src/app/layout.tsx` now sets
   `preload: false` — ticket-data text is never the first thing painted on any page, so it doesn't
   need to compete for the browser's preload budget, and preloading it was producing an "unused
   preload" warning on pages that render slowly enough. It still loads and swaps in normally once
   actually used.
   **Verified live:** fresh tab, cleared console, full navigation to `/login` — `read_console_messages`
   (pattern `preload`) returned no matches.

All test data created during this verification pass (login-attempt rows, test members) was deleted
from the real Neon database afterwards; `fm_members` and `fm_login_attempts` were both confirmed
empty again before finishing.
