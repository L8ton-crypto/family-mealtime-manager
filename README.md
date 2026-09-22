# The Rice Kitchen

A private, single-household meal-planning app. Not a SaaS, not a template — the family runs a
restaurant, and this is the kitchen pass.

## The concept

Every good restaurant kitchen has a pass: a steel rail where order tickets hang, the head chef
calls service, and plates go out. This app *is* the Rice family's pass. The weekly plan is **The
Pass** — a rail of tickets, one per service (breakfast, lunch, dinner, snack). The recipe library
is **The Menu**. The family — who's eating, their allergies, their likes and dislikes — is **The
Table**. The shopping list is **The Order**, printed as a supplier receipt. An engine can fire a
whole week of dinners for you, scored against everyone's allergies, restrictions, likes, dislikes
and recent history, and a plate check afterwards feeds that history back in. A brand-new household
clocks in, seats the family and fires its first week in under five minutes, in an opening-night
flow that appears automatically whenever the table is empty.

See `docs/VISION.md` for the full concept and design system, and `docs/ARCHITECTURE.md` for the
stack and conventions. Each slice's spec (and its Build notes, recording what was actually built
and any decisions made along the way) lives in `docs/slices/`.

## Screenshots

- The Pass — the weekly ticket rail, desktop 7-column week and mobile day-strip views, dark and
  light.
- The Menu — the recipe grid with allergen/tag chips, and a single dish's detail page.
- The Table — member cards with likes/dislikes/restrictions/allergies and "next service".
- The Order — the printed supplier receipt, aisle-grouped with the perforated/torn paper edges.
- Opening night — the three-step first-run flow (seat the family, check the menu, fire the week).

## Stack

- Next.js 16 (App Router, React 19, TypeScript strict)
- Tailwind CSS v4 (tokens as CSS variables in `src/app/globals.css`, no `tailwind.config`)
- Neon serverless Postgres (`@neondatabase/serverless`), tables prefixed `fm_`
- Vitest for unit tests, ESLint for linting
- Installable as a PWA (manifest + icons, no service worker — see "PWA" below)
- Deployed on Vercel

## Environment

Copy `.env.example` to `.env.local` and fill in:

- `DATABASE_URL` — Neon Postgres connection string. The database is shared with unrelated
  projects; this app only ever touches `fm_`-prefixed tables.
- `APP_PASSPHRASE` — the shared household passphrase used to "clock in" at `/login`. Pick a short
  sentence the whole household can remember and say out loud, not a single word — "the dog ate my
  homework" beats "spaghetti" for the same reason a passphrase beats a password: length matters far
  more than cleverness, and a sentence is both longer and easier to recall under pressure at the
  kitchen counter.
- `SESSION_SECRET` — 32+ random bytes, hex. Generate with:
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

`.env.local` is gitignored and never committed.

## Commands

- `npm run dev` — start the dev server.
- `npm run migrate` — apply any new files in `db/migrations/` against `DATABASE_URL`. Idempotent:
  already-applied migrations (tracked in `fm_migrations`) are skipped.
- `npm run seed` — seed `db/seed/recipes.json` into `fm_recipes`/`fm_recipe_ingredients`. Idempotent
  by recipe name.
- `npm run icons` — regenerate `public/icons/*.png` from `public/icons/icon.svg` (only needed if
  you change the source SVG; the PNGs are committed, not generated at build time).
- `npm test` — run the Vitest suite once (not watch mode).
- `npm run lint` — ESLint.
- `npm run build` — runs `migrate` then `next build`, so a Vercel deploy always migrates first.
- `npm run check` — `npm test && npm run lint && npm run build`, the full gate a slice must pass.

## Auth

There's one shared household session, not per-user accounts. `POST /api/auth/login` with the
passphrase sets an httpOnly `rk_session` cookie (180 day expiry, signed with `SESSION_SECRET` via
Web Crypto). `src/proxy.ts` gates every route except `/login`, `/api/auth/login`, and static
assets — unauthenticated page requests redirect to `/login?next=<path>`, API requests get `401`.
Login is rate-limited to 10 failed attempts per IP per 15 minutes (`fm_login_attempts`), with a
fixed 300ms delay added on every failed attempt. Every API response carries `Cache-Control:
no-store` (set centrally in `src/proxy.ts`) — nothing this app returns is ever cached by a browser
or CDN.

## PWA

`src/app/manifest.ts` and the meta tags in `src/app/layout.tsx` make this installable to a phone's
home screen (Android Chrome and iOS Safari), launching full-screen (`display: standalone`) with no
browser chrome. Icons live in `public/icons/` — `icon.svg` is the hand-designed source (a
pass-orange ticket with a perforated top edge and an "RK" monogram); `scripts/icons.mjs` rasterizes
it to the committed PNGs (`npm run icons` to regenerate after changing the SVG).

There is **no service worker and no offline mode**. This is deliberately a private, always-online
household app — there's nothing to cache offline that would still be correct (the plan, the order
and everyone's allergies all live on the server), so a service worker would only add complexity and
a stale-cache failure mode for no real benefit.

## Deploying to Vercel

1. Push this repo to GitHub and import it into a new Vercel project (link the GitHub repo).
2. Set the three environment variables above (`DATABASE_URL`, `APP_PASSPHRASE`, `SESSION_SECRET`)
   in the Vercel project's settings. Use a real, unique `SESSION_SECRET` — don't reuse a local dev
   value.
3. Deploy. The build command is `npm run build`, which runs `node scripts/migrate.mjs` before
   `next build` — every deploy applies any new, not-yet-applied migrations to the shared Neon
   database first, automatically.
4. Open the deployed URL, clock in with the passphrase, and either seat the family through the
   opening-night flow (if the table is empty) or pick up where a previous environment left off.
