# Architecture & Conventions

Read this before writing any code. It is the contract between slices.

## Stack (fixed)

- **Next.js 16.2** (App Router, React 19, TypeScript strict). Note: Next 16 uses `src/proxy.ts`
  exporting `proxy()` instead of `middleware.ts`. Do not create a `middleware.ts`.
- **Tailwind CSS v4** with design tokens as CSS variables in `src/app/globals.css` (`@theme inline`).
- **Neon serverless Postgres** via `@neondatabase/serverless` tagged templates. One shared Neon
  database backs several unrelated projects, so **every table is prefixed `fm_`**. Never touch a
  table without that prefix.
- **Vitest** for unit tests (`npm test`). **ESLint** (`npm run lint`). Both must pass before a slice is done.
- **lucide-react** for icons. **zod** for input validation on every API route.
- Deployed on **Vercel**. Env vars are set there, never committed.

## Single tenant

There is exactly one household. There is no family code, no tenant column, no multi-tenancy anywhere.
Every table is global. Authorization is "is this request authenticated" and nothing else.

## Auth model

- `APP_PASSPHRASE` (env): the shared household passphrase. Compared with a constant-time comparison.
- `SESSION_SECRET` (env): 32+ random bytes, hex. Signs session cookies.
- Session cookie `rk_session`: value is `base64url(payload).base64url(hmac_sha256(payload, SESSION_SECRET))`
  where payload is JSON `{ "iat": <unix>, "exp": <unix> }`. Expiry 180 days. `httpOnly`, `secure` in
  production, `sameSite=lax`, `path=/`.
- Signing and verification use **Web Crypto** (`crypto.subtle`) so the same code runs in `proxy.ts`
  (edge) and route handlers (node). Lives in `src/lib/session.ts`.
- `src/proxy.ts` gates **every** route except: `/login`, `/api/auth/login`, `/_next/*`, `/favicon.ico`,
  `/icons/*`, `/manifest.webmanifest`. Unauthenticated page requests redirect to `/login?next=<path>`.
  Unauthenticated API requests get `401 { error: "unauthenticated" }`.
- `POST /api/auth/login` `{ passphrase }` → sets cookie, `204`. Wrong passphrase → `401`.
- `POST /api/auth/logout` → clears cookie, `204`.
- Rate limiting on login: table `fm_login_attempts(ip text, attempted_at timestamptz)`. If an IP has
  10+ failed attempts in the last 15 minutes, return `429` before checking the passphrase. Successful
  login clears that IP's rows. Also add a fixed 300ms delay on failure.
- Every response sets `X-Robots-Tag: noindex, nofollow`.

## Database

- Migrations live in `db/migrations/NNN_description.sql`, applied in order by `scripts/migrate.mjs`,
  tracked in `fm_migrations(name text primary key, applied_at timestamptz)`. Idempotent per file:
  a file that is recorded is skipped. Never edit an applied migration; add a new one.
- `npm run migrate` runs it locally (reads `.env.local` via `dotenv` or manual parse).
  `npm run build` is `node scripts/migrate.mjs && next build` so Vercel migrates on deploy.
- `src/lib/db.ts` exports `sql` (a lazily-created neon client). No schema creation at runtime.
- JSON columns are `jsonb`. Arrays of strings are `jsonb` arrays, not Postgres arrays.
- Timestamps are `timestamptz`. Dates (calendar days) are `date`.
- IDs are `serial` integers.

### Schema roadmap (each slice adds its own migration)

- **Slice 0:** `fm_migrations`, `fm_login_attempts`, `fm_members` (drop the old `family_code` version and
  the old `fm_meals`; both are empty).
- **Slice 1:** `fm_recipes`, `fm_recipe_ingredients`.
- **Slice 2:** `fm_plan_entries`, `fm_plan_entry_attendees`.
- **Slice 3:** `fm_ratings`.
- **Slice 4:** `fm_shopping_items`.

`fm_members` (Slice 0):

```sql
id serial primary key,
name text not null,
age_group text not null default 'adult',   -- baby | toddler | child | teen | adult
colour text not null default '#FF4F0F',
likes jsonb not null default '[]',
dislikes jsonb not null default '[]',
restrictions jsonb not null default '[]',  -- vegetarian | vegan | gluten-free | dairy-free | halal | kosher | pescatarian | custom
allergies jsonb not null default '[]',     -- nuts | peanuts | dairy | eggs | gluten | soy | fish | shellfish | sesame | custom
sort_order integer not null default 0,
created_at timestamptz not null default now()
```

## Code layout

```
src/
  app/                      routes (App Router)
    (app)/                  authenticated pages, wrapped in AppShell via layout.tsx
      page.tsx              The Pass (home)
      menu/                 The Menu (recipes)
      table/                The Table (family)
      order/                The Order (shopping)
    login/page.tsx
    api/                    route handlers
  components/
    ui/                     design-system primitives (Ticket, Stamp, Chip, Button, Field, ...)
    shell/                  AppShell, Nav, ThemeToggle
    <feature>/              feature components
  lib/                      pure logic and server helpers (no React)
  hooks/                    client hooks
db/migrations/
scripts/
docs/
```

## API conventions

- Route handlers under `src/app/api/<resource>/route.ts` and `.../[id]/route.ts`.
- Validate request bodies with zod. On failure return `400 { error: "validation", issues }`.
- Return the created/updated row on `POST`/`PATCH`. `DELETE` returns `204`.
- Never trust an id from the client without confirming the row exists (`404` otherwise).
- Server code reads `sql` from `src/lib/db.ts` and never constructs SQL strings by concatenation.

## Client conventions

- Data fetching in hooks under `src/hooks/`, one per resource, returning `{ data, loading, error, mutate* }`.
- Optimistic updates for check/uncheck style actions; pessimistic for creates and deletes.
- Client components are marked `'use client'` and kept as leaf-like as possible; pages are server
  components where they can be.
- No `any`. No `console.log` left behind. No emojis.

## Testing

- `src/lib/**` must have unit tests for any non-trivial logic (session signing, validation, engine, unit maths).
- Tests live next to the code as `*.test.ts`.
- `npm test`, `npm run lint`, `npm run build` all pass before a slice is handed to QA.

## Definition of done for a slice

1. The slice spec's acceptance criteria are all met.
2. Migrations applied cleanly against the real Neon database (`npm run migrate`).
3. Tests, lint and build are green.
4. Works at 390px and 1200px, in dark and light.
5. A `docs/slices/NN-<name>.md` spec exists and a `## Build notes` section at its end records what was
   built, decisions made, and anything deferred.
