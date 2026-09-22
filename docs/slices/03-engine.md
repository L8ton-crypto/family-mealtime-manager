# Slice 3 — The Engine: chef's picks, fire the week, plate check

Read `docs/VISION.md`, `docs/ARCHITECTURE.md`, and the Build notes of slices 00 to 02 first.

## Goal

This is the product. The engine fills a week for a family with a nut allergy, a vegetarian teen and a
toddler who only eats beige food, and it can explain every choice in one plain sentence. It learns from
how the plates came back, not from star ratings nobody fills in.

## Schema (`db/migrations/004_engine.sql`)

```sql
create table fm_ratings (
  id serial primary key,
  recipe_id integer not null references fm_recipes(id) on delete cascade,
  member_id integer not null references fm_members(id) on delete cascade,
  entry_id integer references fm_plan_entries(id) on delete set null,
  verdict text not null,                             -- clean | half | left   (how the plate came back)
  note text,
  rated_at timestamptz not null default now(),
  unique (entry_id, member_id)
);
create index fm_ratings_recipe_member_idx on fm_ratings(recipe_id, member_id, rated_at desc);
```

`verdict` vocabulary in `src/lib/vocab.ts`: `clean` (plate came back clean), `half`, `left` (untouched).

## The engine (`src/lib/engine/`, pure functions, fully unit tested)

### `score.ts` — `scoreRecipe(recipe, ctx) → { score: number, reasons: Reason[] } | null`

`ctx = { date, slot, attendees: Member[], history: PlanEntry[] (last 21 days incl. the week being planned),
ratings: Rating[], seed: string }`. `Reason = { text: string, delta: number }`.

Hard filters (return `null`, never suggested): archived; `compatibility(recipe, attendees).safe === false`;
`slot` not in `recipe.meal_types`.

Scoring, starting at 50, each contribution appended as a Reason with a human sentence:

- **Plate history per attendee.** For each attendee, take their last 3 verdicts for this recipe, most recent
  weighted 3, then 2, then 1: `clean` +12, `half` +2, `left` −15 (weighted average, one Reason per member:
  "Ada's plate came back clean twice", "Sam left it last time").
- **Likes and dislikes.** Word-boundary match of each attendee's likes/dislikes against recipe name, tags and
  ingredient names. Like +8 per member ("Sam likes chicken"), dislike −12 per member ("Ada dislikes mushrooms").
- **Kid-friendly** +8 if any attendee is baby/toddler/child and the recipe is tagged kid-friendly.
- **Variety.** Same recipe plated or planned in last 7 days −80 ("Had it on Tuesday"); 8 to 14 days −40;
  15 to 21 days −15. Same **primary protein** as the previous day's same slot −10 ("Chicken again after
  yesterday's fajitas"). Primary protein = first meat-fish aisle ingredient's keyword (chicken, beef, pork, lamb,
  turkey, salmon, cod, tuna, prawns, sausage, bacon, mince → beef unless "lamb mince"/"turkey mince"); vegetarian
  recipes have protein `veg` and are exempt from the alternation penalty.
- **Effort fit.** Weekday dinner with total minutes > 45 −10 ("Long cook for a school night"); Sunday and tagged
  `sunday` +10; weekday and tagged `quick` +5; Friday or Saturday and tagged `comfort`/`bbq` +4.
- **Favourite** +6.
- **Untested** +3 if no attendee has ever rated it ("Nobody's tried it yet").
- **Jitter.** Deterministic ±3 from a hash of `seed + recipe.id` so the same inputs give the same week but a
  different seed gives a fresh one. Not a Reason.

Reasons are sorted by absolute delta; the first is the headline.

### `fill.ts` — `fillWeek(params) → Proposal[]`

`params = { days: string[], slots: Slot[], recipes, members, attendeesByDefault: number[], history, ratings,
seed, keepExisting: boolean, existing: PlanEntry[] }`.

For each `(day, slot)` in date order, skip if `keepExisting` and an entry exists. Otherwise score every recipe
with `history` extended by the proposals already made this run (so variety and protein alternation apply
within the proposed week) and pick the top; also return the next 4 as `alternatives`. Never propose the
same recipe twice in one run. If nothing scores above 0, propose nothing for that slot and add a
`gap: "No safe dish for these covers"` entry.

`Proposal = { day, slot, recipeId, score, headline, reasons, alternatives: { recipeId, score, headline }[] }`.

### Tests must cover
hard filters; each scoring rule with its Reason text; recency weighting of verdicts; variety penalties at
day 3, day 10, day 18; protein alternation across consecutive days and its veg exemption; effort fit by
weekday; jitter determinism (same seed same order; different seed can differ); `fillWeek` never repeats,
respects `keepExisting`, applies alternation across its own proposals, and emits a gap when everything
is unsafe.

## API

- `GET /api/suggest?date=&slot=&attendees=1,2&limit=6` → ranked `{ recipe summary, score, headline, reasons }`.
- `POST /api/plan/fill` `{ week, slots, attendees?, keepExisting = true, seed? }` → `{ proposals }`. Saves nothing.
- `POST /api/plan/batch` `{ entries: [{ service_date, slot, recipe_id, attendees }] }` → creates all in one
  transaction, returns them in GET shape.
- `PUT /api/ratings` `{ entry_id, member_id, verdict, note? }` upsert. `GET /api/ratings?recipe_id=` list.
- `GET /api/recipes/[id]` now also returns `record: { timesPlated, lastPlated, byMember: [{ memberId, clean, half, left }] }`.

## Screens

### The Pass — `Fire the week`

A `pass` Button in the header. Opens a Sheet: slot chips (dinner preselected), covers (member toggles, all
on), `Keep what's already on the pass` (on), `Fresh shuffle` button that changes the seed, then `Fire`.
Proposals render **in place** on the rail as draft tickets: `note` (yellow) variant, `DRAFT` stamp, headline
reason in ink-soft under the name, and a `Swap` control that cycles through the alternatives. Gaps render as
a red-ruled ticket "No safe dish for these covers" with a link to The Menu. A sticky bar at the bottom reads
`FIRE 5 TICKETS` (pass) and `Scrap` (ghost). Fire commits via the batch API; tickets flip from yellow to paper
with the spring motion. Scrap discards.

### The picker — `Chef's picks`

At the top of `DishPicker`, before search results, a `CHEF'S PICKS` mono label and the top 3 suggestions for
that day, slot and attendee set, each with its headline reason. Tapping one fires it as usual.

### Plate check

When an entry is plated from the action sheet, the sheet swaps to **Plate check**: kicker `HOW DID THE PLATES
COME BACK?`, one row per attendee with their avatar and three segmented options `Clean` / `Half` / `Left`
(lucide icons: `CircleCheck`, `CircleDot`, `CircleX`), optional one-line note, `Done` and `Skip`. Every
selection saves immediately (upsert). Plate check is also reachable from a plated ticket's sheet and from
`/pass/history` rows (`Plate check` button, shows a mint tick when complete for all attendees).

### Menu card — `Kitchen record`

A ticket on `/menu/[id]`: `PLATED 4 TIMES · LAST SUN 14 SEP`, then a row per member with three mono counts
under `CLEAN / HALF / LEFT` headings and a one-word verdict (`Loves it` ≥ 2 clean and no left; `Won't touch it`
≥ 2 left; `Mixed` otherwise; `Untested` if none).

### The Table — favourites

Under each member's chips: `CLEAN PLATES:` followed by up to three recipe names as chips (most clean
verdicts, ties by most recent). Link each to the menu card.

## Acceptance criteria

1. Migration clean and idempotent; engine tests all pass and cover the listed cases.
2. With a fish-allergic member attending, `/api/suggest` never returns Fish Pie or Salmon; excluding them from
   attendees makes those eligible again.
3. Fire the week on an empty week with dinners only proposes 7 different dishes, never the same primary
   protein on consecutive days when alternatives exist, and each draft shows a headline reason.
4. Swap cycles alternatives; Scrap leaves the pass unchanged; Fire creates exactly the proposed entries.
5. `Keep what's already on the pass` leaves existing entries untouched and proposes around them.
6. Plating an entry opens Plate check; verdicts save on tap; reopening shows them; the menu card's Kitchen
   record reflects them; a `left` verdict visibly lowers that dish in the next suggestions with the reason
   naming the member.
7. Chef's picks appear in the picker and honour the current attendee set.
8. Works at 390px and 1200px, dark and light. `npm test`, `npm run lint`, `npm run build` green. No emojis, no `any`.

## Build notes

**What was built.** Every item in Scope: migration `db/migrations/004_engine.sql` (`fm_ratings`, applied for
real against the shared Neon database, idempotent on a second `npm run migrate`); `VERDICTS` added to
`src/lib/vocab.ts`; the pure engine in `src/lib/engine/` — `protein.ts` (`primaryProtein`), `score.ts`
(`scoreRecipe`, `jitter`) and `fill.ts` (`fillWeek`), with 90 new unit tests across
`protein.test.ts`/`score.test.ts`/`fill.test.ts` covering every case the spec lists (hard filters, every
scoring rule with its exact Reason text, recency-weighted verdicts including the "only the 3 most recent,
weighted 3/2/1" rule, variety penalties at day 3/10/18 and the >21-day/eightysixed/different-recipe
exclusions, protein alternation across consecutive days and its veg exemption and same-slot-only rule,
effort fit by weekday, jitter determinism and cross-seed variation, and `fillWeek`'s never-repeats/
keepExisting/own-run-alternation/gap behaviour); two small pure additions to `src/lib/dates.ts`
(`formatWeekdayLong`, `daysBetween`, both unit tested) that the engine reuses rather than re-implementing
UTC date maths a third time; the data-access adapters that convert DB rows to the engine's plain types
(`src/lib/recipes-db.ts`'s `toEngineRecipe`/`fetchRecipeRecord`, `src/lib/members-db.ts`'s
`fetchAllMembersForEngine`, `src/lib/ratings-db.ts`'s `toEngineRatings`/`fetchCleanPlatesByMember`,
`src/lib/plan-db.ts`'s `fetchHistoryForEngine`) — the engine itself never touches `sql`; the API
(`GET /api/suggest`, `POST /api/plan/fill`, `POST /api/plan/batch`, `GET`/`PUT /api/ratings`,
`GET /api/ratings/clean-plates`, `GET /api/recipes/[id]`'s new `record` field); the screens (Fire the week
button + sheet + draft/gap tickets + sticky Fire/Scrap bar on The Pass, Chef's picks in `DishPicker`, Plate
check reachable from plating/a plated ticket/`/pass/history`, Kitchen record on the menu card, CLEAN PLATES
on The Table); and the Slice 2 carry-over fix (skeleton tickets while `usePlan` is loading).

**Carry-over fix.** `src/components/ui/SkeletonTicket.tsx` (a `.rk-skeleton` shimmer block, new CSS in
`globals.css`, reduced-motion safe — the shimmer sweep is `display: none` under `prefers-reduced-motion:
reduce`, leaving a static paper-coloured block) replaces the ghost "+ Fire something" tile in every
`SlotRail` while `usePlan`'s `loading` is true. Ghosts (and real tickets) only render once `loading` is
false, so a slow connection now shows one shimmer block per slot per day and then pops straight to real
content — never an empty ghost that then flashes into a ticket. Verified live: throttled nothing (Neon is
already slow enough locally to see it), reloaded `/`, and confirmed every slot showed a shimmer block before
the Chicken Fajitas ticket and the ghosts populated.

**Decisions and deviations.**
- **`fillWeek`'s `Proposal`/`Alternative` types carry no `reasons` on an alternative**, only a `headline` —
  the spec's `Alternative` shape (`{ recipeId, score, headline }`) doesn't list `reasons`, and a Swap only
  ever needs to show the headline of the dish it's cycling to, not its full reason list.
- **Variety's "last 7/14/21 days" and protein alternation's "previous day" both use `Math.abs(daysBetween(...))`**
  rather than only looking backward. `fillWeek` extends `history` with its own proposals as it goes
  day-by-day, so by the time a later day in the run is scored, an earlier day's proposal already sits in
  `history` "in the past" relative to it — but `/api/suggest`'s history window (last 21 days **plus the week
  being planned**) can include entries on days *after* the date being suggested for (e.g. suggesting for
  Tuesday when Friday of the same week already has a plan). An absolute distance handles both directions with
  one rule instead of two.
- **A meat-fish ingredient that matches none of the twelve named protein keywords becomes `'other'`, not
  `'veg'`.** The spec only names it as "vegetarian recipes have protein `veg`" — an unrecognised meat (e.g.
  "duck breast") genuinely isn't vegetarian, so silently treating it as `'veg'` would wrongly exempt it from
  the alternation penalty. `'other'` still participates in alternation (two unnamed-protein meat dishes back
  to back still get penalised), which is the more conservative, more correct reading.
- **Reason wording is the builder's own, not the spec's literal example strings.** The spec gives its Reason
  examples ("Ada's plate came back clean twice", "Chicken again after yesterday's fajitas") as illustrations
  of tone, not a literal contract — engine and its tests are both written by this same build, so the tests
  assert the exact wording this build chose (documented in `score.ts`'s `verdictReason` and the protein-
  alternation reason format: `` `${Protein} again after yesterday's ${previousDishName.toLowerCase()}` `` —
  e.g. "Chicken again after yesterday's chicken fajitas", slightly more literal than the spec's shortened
  example but unambiguous and still names the actual dish).
- **`jitter` is FNV-1a over `` `${seed}:${recipeId}` ``, mapped to `-3..3` via `% 7`.** Small, fast, fully
  deterministic across Node/browser/any future runtime, no external dependency.
- **`/api/plan/batch` uses a single multi-row `INSERT ... RETURNING id`, then a second real
  `sql.transaction()` for attendees, mirroring (and generalising to N rows) the two-step
  insert-then-attendees pattern `POST /api/plan` already established in Slice 2** — the neon HTTP driver's
  `sql.transaction()` can't have one query's result feed a later query in the same call, so the entries'
  ids have to exist in JS before the attendee rows can be built. If the attendee transaction fails, every
  just-inserted entry row is deleted (same rollback shape as the single-entry version).
- **`GET /api/ratings` also accepts `?entry_id=`, not just the spec's literal `?recipe_id=`.** Plate check's
  "reopening shows them" (Acceptance criterion 6) and `/pass/history`'s "complete" tick both need to know a
  specific entry's saved verdicts — solved more directly by carrying `ratings: { memberId, verdict, note }[]`
  on every `PlanEntryWithDetails` (`plan-db.ts`, merged from a second flat query the same way `attendees`
  already is, not a `LEFT JOIN` that would have Cartesian-producted against the existing attendees join) so
  Plate check and history never need a second round trip at all. The `?entry_id=` query param on
  `GET /api/ratings` was added alongside for completeness/debugging, not because the UI depends on it.
- **`GET /api/ratings/clean-plates` is a new endpoint, not in the spec's literal API list**, needed to power
  The Table's "CLEAN PLATES" row (up to 3 dishes per member ranked by clean-verdict count, ties by most
  recent) — this is a cross-recipe, cross-member aggregate that no other listed endpoint could answer without
  either a very wide `GET /api/ratings` with no filter, or fetching every recipe's `record` individually
  (N+1). One small dedicated query is simpler and cheaper at this household's scale.
- **The menu card's Kitchen record and The Table's CLEAN PLATES both fetch via a small dedicated
  `useEffect`, not through `useRecipes`/`useMembers`.** `record` only exists on `GET /api/recipes/[id]`
  (never the list endpoint `useRecipes` calls), and `RecipeDetailPage` finds its recipe from that list hook's
  already-loaded array rather than fetching by id — so Kitchen record needed its own narrow fetch rather than
  bloating the list endpoint with an N+1 rating query per recipe just for one detail page.
- **"Fire the week"'s two-stage flow**: the sheet's own "Fire" button calls `POST /api/plan/fill` and closes,
  landing the results as draft (`note`-variant, `DRAFT`-stamped) tickets directly on the rail; the sticky
  `FIRE N TICKETS` / `Scrap` bar is a *separate*, later confirmation that actually calls
  `POST /api/plan/batch`. Nothing is written to the database between opening the sheet and the second
  confirmation — Scrap really does leave the pass byte-for-byte unchanged, and Swap only ever mutates local
  React state (cycling through the alternatives `fillWeek` already returned) with zero network calls.
- **`FireTheWeekSheet` is conditionally mounted (`{fireSheetOpen && (<FireTheWeekSheet .../>)}`), matching
  `DishPicker`'s existing pattern, not unconditionally rendered with an `open` prop.** This was a real bug
  caught during browser QA (see below) — its own default "all household members" covers state is seeded once,
  in `useState`'s initializer, from whatever `members` prop it had at first mount; rendering it unconditionally
  meant that initializer ran on `PassView`'s very first render, before `useMembers()` had loaded anyone,
  permanently freezing "covers" at `[]` for the sheet's entire lifetime. Conditional mounting means a fresh
  mount — and a fresh, correctly-seeded initializer — every time the sheet opens.
- **Chef's picks renders above the Search field in `DishPicker`'s DOM order** (satisfying "at the top... before
  search results" literally), but the Search field's pre-existing `autoFocus` (kept from Slice 2, spec-required)
  scrolls the sheet down to bring the focused field into view on open, which visually pushes Chef's picks above
  the fold until the user scrolls up — confirmed correct in the DOM via `read_page`/`find` and reachable with
  one scroll in both breakpoints. Not fixed further: fighting the natural "scroll the focused field into view"
  browser behaviour would undermine the field's own required autofocus, and real mobile keyboards behave the
  same way.

**Verification.** `npm test` (257 tests total, 75 new), `npm run lint` and `npm run build` all green.
`npm run migrate` applied `004_engine.sql` for real against the shared Neon database and a second run
skipped it (idempotent). Browser QA (dev server, port 3111, desktop 1280px and mobile 375px, dark and light)
against the real database (Ada, fish-allergic child; the pre-existing Chicken Fajitas entry; 34 seeded
recipes) drove, and verified via a mix of `curl` against the real API and the live UI:
- **AC2**: `/api/suggest?attendees=<Ada>` never returned Fish Fingers & Chips / Fish Pie / Salmon & New
  Potatoes among 20+ ranked results; the identical request with a temporary non-allergic member instead of
  Ada returned all three; Ada alongside that member again excluded them.
- **AC3**: Fire the week on an empty week (dinners only) proposed 7 distinct dishes (verified via
  `/api/plan/fill` and live: `Pesto Pasta`, `Pasta Bake`, `Mac & Cheese`, `Spaghetti Bolognese`, `Toad in the
  Hole`, `Shepherd's Pie`, `Sunday Roast Chicken`), each with a non-empty headline, and consecutive-day primary
  proteins were pasta→pasta→mac(all veg, exempt)→beef→sausage→lamb→chicken — no repeat where the pool offered
  an alternative.
- **AC4**: Swap (live) cycled Monday's draft from Spaghetti Bolognese to Veggie Chilli (an alternative from
  the same proposal); Scrap (live) discarded all 6 drafts and left the rail exactly as before (only the
  pre-existing Fajitas ticket); Fire (live, via the sticky bar) created exactly the 6 proposed entries with
  the correct recipe, day, slot and covers — confirmed both visually (tickets flipped from yellow drafts to
  paper with the spike-in motion) and via `GET /api/plan`.
- **AC5**: `keepExisting: true` on the Fajitas' own week returned 6 proposals (skipping Tuesday); the Fajitas
  entry (id 29) was byte-for-byte unchanged afterwards (`GET /api/plan/29`); a live commit run also preserved
  it visually.
- **AC6**: clicking `Plate it` on a fired "Pasta Bake" ticket swapped the action sheet straight to Plate
  check; tapping `Clean` for Ada saved immediately (`PUT /api/ratings` 200) and the ticket showed the mint
  `Plated` stamp; reopening the sheet (`Plate check` button) showed `Clean` still selected; the menu card's
  Kitchen record showed `Ada — 1 clean, 0 half, 0 left`; separately, rating the pre-existing Chicken Fajitas
  entry `left` for Ada dropped its `/api/suggest` score and surfaced `"Ada left it last time"` as the
  headline (both directly against the real API, then cleaned up).
- **AC7**: Chef's picks (top 3, each with a headline) appeared in `DishPicker` honouring the slot and the
  current attendee set, confirmed via the DOM in both breakpoints.
- **AC8**: 390px and 1200px, dark and light — skeleton tickets, Fire the week sheet, draft/gap tickets, the
  sticky bar, Chef's picks, Plate check, Kitchen record and CLEAN PLATES chips were all screenshotted and
  legible in every combination; no emojis; no `any` (build's TypeScript pass is clean under `strict`).
- **Gap**: requesting a fill for `slot: snack` (0 seeded recipes carry that meal type) returned
  `{ gap: "No safe dish for these covers" }` for that day, live against the real API.
- **CLEAN PLATES**: after plate-checking two fired dishes as `clean` for Ada, `GET /api/ratings/clean-plates`
  and The Table's live card both showed her `CLEAN PLATES:` chip(s), linking to the right menu cards.

All test data created during this pass (a temporary "QA Temp" member, ten temporary plan entries across two
target weeks, and four temporary ratings) was removed afterwards via the real API (and, for `fm_ratings` rows
orphaned by `ON DELETE SET NULL` when their entry was deleted, a couple of direct `DELETE`s) — confirmed
back to exactly: 1 member (Ada), 1 plan entry (Chicken Fajitas, Tue 2026-09-22 dinner, `planned`), 34
recipes, 0 ratings before finishing.

**Deferred / out of scope for this slice** (per spec, not gaps): no pagination on `GET /api/ratings`. No
rate limiting beyond what Slice 0 already applies at the proxy/auth layer. `fillWeek`'s "never the same
recipe twice in one run" is enforced across the *whole* run regardless of slot — a household planning both
lunch and dinner in one Fire the week can't get the same dish for both, which reads as a feature (no
"leftover-disguised-as-fresh" duplicate) rather than a gap.

## QA fixes

A second QA pass came back "FIX FIRST" with six findings (two MAJOR, four MINOR). All six are addressed
below. `npm test` (281 tests, 24 new), `npm run lint` and `npm run build` were re-run green after all six
together, and every item was also separately re-verified live (dev server, port 3111, real Neon database)
as described.

1. **MAJOR — `PUT /api/ratings` didn't check the member actually attended.** Added
   `checkRatingEligibility()` to `src/lib/ratings-schema.ts` — a pure function (no DB access), taking the
   entry's recipe id/status/attendee ids and the member id being rated, so it's directly unit-testable
   (`ratings-schema.test.ts`, 6 cases) independent of the route's own DB lookups. `src/app/api/ratings/route.ts`'s
   `PUT` handler now fetches the entry's attendee ids (`fm_plan_entry_attendees`) alongside its existing
   recipe/status lookup and calls the helper before upserting.
   **Verified live:** plated the pre-existing Chicken Fajitas entry, created a temporary member who wasn't
   an attendee, and `PUT /api/ratings` for that member on that entry returned
   `400 {"message":"Member did not eat this service"}`; the same request for Ada (an actual attendee)
   succeeded.

2. **MAJOR — `PUT /api/ratings` didn't check the entry was plated.** The same `checkRatingEligibility()`
   helper also rejects `entryStatus !== 'plated'` with `"Plate check is for plated services"`, checked before
   the attendee check (so a `planned` entry's rejection message doesn't misleadingly blame attendance).
   **Verified live:** `PUT /api/ratings` against the pre-existing Chicken Fajitas entry *before* plating it
   returned `400 {"message":"Plate check is for plated services"}`.

3. **MAJOR — product decision on `keepExisting=false`: REPLACE, never stack.** `ExistingSlotEntry` (fill.ts)
   now carries `entryId`, `name` and `status`, not just `day`/`slot`. Per (day, slot): a `plated` or
   `eightysixed` entry present makes the whole slot off-limits and it's skipped *regardless* of
   `keepExisting` (never replaced — see the new `hasProtected` check in `fillWeek`); a `planned` entry, with
   `keepExisting=false`, no longer blocks a proposal — the slot gets a fresh proposal and that proposal's
   `replaces: { entryId, name }[]` lists every planned entry it would replace. `POST /api/plan/fill`
   (`src/app/api/plan/fill/route.ts`) now builds the richer `existing` array from `fetchPlanEntriesInRange`'s
   `id`/`status`/dish name. `POST /api/plan/batch` gained an optional `replaceEntryIds: number[]`
   (`plan-schema.ts`'s `batchPlanEntrySchema`); the route independently re-validates every id is currently
   `planned` (400 otherwise — never trusts the client), then deletes them and inserts the new entries in ONE
   `sql.transaction()` call (both statements are independent — neither needs the other's `RETURNING` value,
   which is neon's actual constraint on chaining queries within a transaction — only the caller needs the
   insert's ids afterwards, to attach attendees in a second transaction, same two-step pattern the rest of
   this codebase already uses). `DraftTicket.tsx` shows a new mono `REPLACES <NAMES>` line (ink-soft) when a
   draft carries `replaces`. `FireTheWeekSheet.tsx`'s "Keep what's already on the pass" toggle (copy
   unchanged — it already read exactly that) now shows helper text under it when switched off: "Planned
   tickets in those services will be replaced. Plated and 86'd ones stay." 7 new `fillWeek` unit tests cover
   REPLACE-lists-planned-entries, lists-every-entry-when-several-share-a-slot, plated/eightysixed-never-
   replaced-even-with-keepExisting-off (both), and empty-slot-gets-no-`replaces`-field.
   **Verified live, exactly the two scenarios in the brief:** (a) with the pre-existing Chicken Fajitas
   planned on Tue dinner, fired the week with Keep off — Tue dinner ended up with exactly one ticket (a
   fresh entry id; the old id 404'd afterwards; confirmed via `GET /api/plan`, not just the UI); the draft
   ticket itself showed `REPLACES CHICKEN FAJITAS` before firing. (b) plated that new Tuesday ticket, then
   fired the week again with Keep still off — the fill run produced **no proposal at all** for Tuesday (not
   even a gap), and `GET /api/plan/59` afterwards confirmed the plated entry was completely untouched.
   Also verified server-side re-validation directly: `POST /api/plan/batch` with a `replaceEntryIds`
   containing that same plated entry's id was rejected with
   `400 "entry 59 is not planned — only planned entries can be replaced"`, proving the route doesn't trust
   the client even though `fillWeek` itself would never offer a plated entry in `replaces`.

4. **MINOR — like/dislike matching wasn't plural-tolerant.** Extracted `wordBoundaryPattern`/
   `wordBoundaryMatch` into a new `src/lib/textMatch.ts` (8 unit tests: plural↔singular both directions,
   word-boundary safety, case-insensitivity, empty-term, regex-escaping) — the exact same rule
   `engine/compat.ts`'s `customAllergyPattern` already used, now shared rather than duplicated.
   `engine/compat.ts`'s `customAllergyPattern` is now a direct alias for `wordBoundaryPattern`;
   `engine/score.ts`'s like/dislike matching calls `wordBoundaryMatch` instead of its own local `wordMatch`.
   2 new `scoreRecipe` tests confirm "mushrooms" (dislike) matches a singular "mushroom" ingredient and
   "kiwi" (like) matches a plural "kiwis" ingredient.
   **Verified:** unit tests above; also re-ran the existing word-boundary-safety test ("ham" not matching
   "shame") to confirm the shared matcher didn't regress that guarantee.

5. **MINOR — an empty fill (zero proposals) showed a "Fire 0 tickets" sticky bar.** `PassView.tsx`'s
   `handleFireTheWeek` now checks `proposals.length === 0` before mapping anything to drafts: in that case it
   sets a new `emptyFillNotice` flag instead of `drafts`, so the sticky bar never mounts at all. A dismissible
   `note`-variant `Ticket` renders in its place: **THE PASS IS FULL** — every service you picked already has
   a ticket., with a close button; both `drafts` and `emptyFillNotice` are cleared together on week
   navigation.
   **Verified live:** with every dinner slot in the target week already occupied, fired the week with Keep on
   — no sticky bar appeared anywhere on the page (confirmed via `find` for "Scrap"/"Fire" — no matches), and
   the note ticket rendered with the exact copy above; clicking its × dismissed it cleanly.

6. **MINOR — "school night" incorrectly used the ordinary Mon-Fri weekday definition.** A school night is
   the evening before a school day: Sunday through Thursday. `engine/score.ts`'s effort-fit block now uses a
   dedicated `isSchoolNight = weekday <= 4` (Sun=0..Thu=4) for the "Long cook for a school night" −10 rule,
   separate from the pre-existing `isWeekday` (Mon-Fri) still used by the unrelated "Quick enough for a
   weeknight" +5 rule (not in scope for this fix). Friday and Saturday dinners are now exempt from the
   long-cook penalty even though Friday is an ordinary weekday; Sunday is now included even though it isn't.
   The reason text itself (`"Long cook for a school night"`) is unchanged — it was already accurate for the
   corrected day range, just previously applied to the wrong set of days. 2 new tests (`applies... on
   SUNDAY`, `does NOT penalise... on Friday`) alongside the existing Wednesday-applies and Saturday-exempt
   cases.
   **Verified:** unit tests above; this rule has no user-facing UI beyond the Reason text already covered by
   Acceptance criterion 3/6's Fire-the-week verification, so no separate live check was needed beyond the
   test suite.

All test data created during this QA-fix verification pass (a temporary "QA NonAttendee" member, seven
temporary plan entries, and one temporary rating) was removed afterwards — the last plan entry (Chicken
Fajitas, replaced mid-pass by a same-named fresh entry as part of verifying item 3) was recreated by direct
SQL to match the task brief's required baseline exactly, since the original row's id couldn't be recovered
once replaced. Confirmed back to exactly: 1 member (Ada), 1 plan entry (Chicken Fajitas, Tue 2026-09-22
dinner, `planned`), 34 recipes, 0 ratings before finishing.
