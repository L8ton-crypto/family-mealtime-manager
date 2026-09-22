# Slice 4 — The Order: the shopping list as a supplier order

Read `docs/VISION.md`, `docs/ARCHITECTURE.md`, and the Build notes of slices 00 to 03 first.

## Goal

Turn the week on the pass into one shopping list that looks and behaves like a thermal-printed supplier
order. Aggregated across dishes, scaled to covers, grouped by aisle, tick-able with one thumb, and
survives regenerating when the plan changes.

## Schema (`db/migrations/005_order.sql`)

```sql
create table fm_shopping_items (
  id serial primary key,
  week_start date not null,
  key text,                                          -- normalised "name|unit" for generated lines; null for manual
  name text not null,
  quantity numeric,
  unit text,
  aisle text not null default 'pantry',
  checked boolean not null default false,
  manual boolean not null default false,
  optional boolean not null default false,
  sources jsonb not null default '[]',               -- [{ entryId, recipeId, recipeName, quantity, unit }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index fm_shopping_items_week_key_idx on fm_shopping_items(week_start, key) where key is not null;
create index fm_shopping_items_week_idx on fm_shopping_items(week_start, aisle, checked);
```

## Logic (`src/lib/order.ts`, unit tested)

- `normaliseName(name)` → lowercase, trimmed, parenthetical notes removed, simple plural → singular
  (tomatoes→tomato, onions→onion, eggs→egg, potatoes→potato, carrots→carrot, but not "couscous", "hummus",
  "peas", "beans", "lentils", "oats", "chips", "noodles" which stay as-is via an exception list).
- `normaliseUnit(qty, unit)` → kg→g ×1000, l→ml ×1000; everything else unchanged. Unit families:
  `mass` (g), `volume` (ml), `spoon` (tsp, tbsp, cup: convert tbsp=3 tsp, cup=16 tbsp when merging; display in
  the largest sensible unit), `count` (pcs, clove, slice, can, pack), `vague` (pinch, handful, null).
- `lineKey(name, unit)` → `${normaliseName}|${family}` so "onion 2 pcs" and "onion 200 g" stay separate lines
  while "plain flour 200 g" and "plain flour 0.5 kg" merge.
- `aggregate(entries, existingItems)` → `ShoppingLine[]`. Input entries are this week's `planned` plan
  entries with their recipe and ingredients. Each ingredient is scaled by `entry.servings ?? attendeeCount`
  over `recipe.servings` using `scaleQuantity` from Slice 1. Lines with the same key merge by summing
  (vague quantities merge as "to taste"). `optional` is true only if every source marked it optional.
  `checked` is carried over from an existing item with the same key. Manual items are untouched.
  Returns lines sorted by `AISLE_ORDER` (produce, bakery, meat-fish, dairy-eggs, frozen, pantry, spices,
  drinks, household) then name.
- `STAPLES`: salt, black pepper, pepper, olive oil, vegetable oil, sunflower oil, water. Generated staple
  lines get aisle `pantry` and are rendered in a separate `STAPLES` block at the end, unchecked.
- `toPlainText(lines, weekKicker)` → the list as text for clipboard/share, aisle headings in caps, `[ ]` / `[x]`.

Tests: plural handling incl. the exception list; unit merging across kg/g and l/ml and tsp/tbsp/cup;
key separation for count vs mass; scaling by covers; checked carry-over across regeneration; manual items
preserved; optional only-if-all; staples block; `toPlainText` output.

## API

- `GET /api/order?week=` → items for that week (Monday), plus `{ total, checked, generatedAt }`.
- `POST /api/order/generate` `{ week }` → rebuilds generated lines from the pass (delete generated lines not
  present any more, upsert the rest preserving `checked`), leaves manual lines, returns the same as GET.
- `POST /api/order` `{ week, name, quantity?, unit?, aisle? }` → manual line.
- `PATCH /api/order/[id]` `{ checked?, name?, quantity?, unit?, aisle? }` (editing a generated line sets
  `manual = true` and clears `key` so regeneration will not overwrite it, and re-adds the generated line
  separately; document this).
- `DELETE /api/order/[id]` → `204`.
- `POST /api/order/clear` `{ week, checkedOnly: true }` → deletes ticked lines.

## Screen — `/order`

**The receipt.** One long paper strip, max width 480px, centred on desktop, full-bleed on mobile, monospace
throughout. Perforated top edge, **zigzag torn bottom edge** (CSS). Header block centred:

```
THE RICE KITCHEN
SUPPLIER ORDER
WEEK OF MON 22 SEP 2026
PRINTED 21 SEP 18:42
- - - - - - - - - - - - - - - -
```

Week nav `‹ ›` above the receipt (mono), and a progress line under the header: `9/24 LINES TICKED` with a
thin pass-orange bar.

Aisle blocks: uppercase aisle name, dashed rule, then lines. Each line is one tap target (44px): a square
tick box, the name (with `(optional)` in ink-soft where relevant, and a second ink-soft line
`for Fajitas, Mild Chicken Curry` from sources), quantity and unit right-aligned. Ticking draws the
strike-through left to right and dims the line; ticked lines stay in place (no reordering while shopping).
Long-press or a small `Edit` icon opens an inline edit row (name, qty, unit, aisle, delete).

`STAPLES` block at the end, then `+ Add a line` (mono input with a quick aisle select, Enter adds), then:

```
- - - - - - - - - - - - - - - -
24 LINES · 9 TICKED
THANK YOU FOR YOUR ORDER
```

Actions above the receipt: `Regenerate from the pass` (ink), `Clear ticked` (ghost, inline confirm),
`Copy as text` (ghost; shows a `COPIED` stamp for 2s), `Share` (only when `navigator.share` exists; uses
`toPlainText`).

Empty state (no generated or manual lines): `NOTHING ON ORDER`, "Fire some dishes on the pass first.",
action `Open the pass`. If there are planned entries but no lines yet, show `Print the order` (pass) which
calls generate.

**The Pass:** header gains a small ghost link `Order` with a lucide `ShoppingBasket` icon and a mono count of
unticked lines for the week in view.

## Acceptance criteria

1. Migration clean and idempotent; all `order.ts` tests pass.
2. A week with Fajitas and Chicken Curry for 4 covers produces one merged `chicken` line whose quantity is
   the sum, with both dishes listed as sources; changing curry's covers to 2 and regenerating halves that part.
3. Ticking a line, then regenerating after adding a dish, keeps the tick on the unchanged line and adds the new lines.
4. A manual line survives regeneration; editing a generated line converts it to manual and regeneration adds the
   generated line back separately.
5. kg and g of the same ingredient merge to one line displayed in the sensible unit; pcs and g of the same
   ingredient stay as two lines.
6. Copy as text produces the aisle-grouped list; Share appears only where supported.
7. The receipt looks like a receipt: mono, narrow, perforated top, torn bottom, dashed rules, in dark and light,
   at 390px and 1200px. Strike-through animates and respects reduced motion.
8. `npm test`, `npm run lint`, `npm run build` green. No emojis, no `any`.

## Build notes

**What was built.** All four carry-over fixes from the Slice 3 review (below); migration
`db/migrations/005_order.sql` (`fm_shopping_items`, applied for real against the shared Neon database,
idempotent on a second `npm run migrate`); the pure engine `src/lib/order.ts` (`normaliseName`,
`normaliseUnit`, `lineKey`, `aggregate`, `STAPLES`, `AISLE_ORDER`, `toPlainText`) with 41 unit tests in
`order.test.ts` covering every case in the spec's test list; `src/lib/order-schema.ts` (zod) and
`src/lib/order-db.ts` (data access, including `fetchAggregateEntriesForWeek` which resolves this week's
`planned` pass entries to full recipe/ingredient records for `aggregate()`); the API
(`GET`/`POST /api/order`, `POST /api/order/generate`, `POST /api/order/clear`,
`PATCH`/`DELETE /api/order/[id]`); `src/hooks/useOrder.ts`; the `/order` screen
(`src/components/order/OrderView.tsx` + `OrderLine.tsx`) — receipt header, week nav, progress bar, aisle
blocks, STAPLES block, a dedicated "Added" block for manual lines, tick with animated strike-through, inline
edit, add-a-line, Regenerate / Clear ticked (inline confirm) / Copy as text (2s "Copied" state) / Share (only
where `navigator.share` exists), and the two empty states (no planned dishes at all vs. planned-but-not-yet-
printed); the receipt's paper-strip CSS in `globals.css` (`.rk-receipt*` — perforated top reusing the
`Ticket` mask technique, a separate torn-zigzag strip glued under the paper rather than fighting the top
perforation for the same `mask-image`); and the Pass header's `Order` ghost link with a live unticked-count
badge (`PassView.tsx`, via `useOrder`).

**Carry-over fixes (Slice 3 review).**
1. **Fire the week never proposes for a day before today.** `FillParams` gained a required `today: string`
   (`src/lib/engine/fill.ts`); `fillWeek` filters `params.days` to `day >= today` before proposing anything —
   a past day is skipped entirely, not even a gap ticket. `fillPlanSchema.today` (isoDateSchema, required) and
   `POST /api/plan/fill` forward it straight through to `fillWeek`; `PassView.handleFireTheWeek` sends the
   client's own `todayISO()` in the request body, per the brief's "todayISO on the server side should come
   from the request's client date." 3 new `fillWeek` tests (skips a past day entirely, proposes for today
   itself, returns nothing when every requested day is past); `fill.test.ts`'s `baseParams` default
   (`today: '2026-09-21'`) was chosen to match every existing test's earliest `days` entry so no pre-existing
   test's expected output changed.
   **Verified live:** deleted the real Monday (21 Sep, a past day relative to "today" = 22 Sep) Pasta Bake
   entry — it had been proposed for a past day, which was exactly this bug — then fired the week for dinner
   with the default "Keep what's already on the pass": `POST /api/plan/fill`'s raw response was
   `{"proposals":[]}` (Monday skipped for being in the past; every other day already had a real ticket), and
   the UI correctly showed **THE PASS IS FULL** with no sticky bar and no Monday draft/gap ticket.
2. **Dish names wrap to two lines instead of one-line ellipsis.** `PassTicket.tsx` and `DraftTicket.tsx`'s
   dish-name `<h3>` changed from `truncate` to `line-clamp-2` (and `leading-none` to `leading-tight`, since
   two lines of a display font at line-height 1 read as visually cramped/overlapping). The ticket grows to
   fit two lines since neither `Ticket` nor its parents impose a fixed height.
   **Verified live at 1024px** (explicitly the narrowest desktop column width, per the brief): every
   2-and-3-word dish name in the real week (Chicken Fajitas, Spaghetti Bolognese, Pesto Pasta with Pine Nuts,
   Shepherd's Pie, Mac & Cheese, Sunday Roast Chicken) wrapped to two lines with a third line's worth of
   overflow eliding as `...` only where genuinely too long ("Pesto Pasta wit…", "Sunday Roast…") — never a
   single truncated line — and the ticket cards in that row were visibly taller than the empty ghost-only
   Monday column next to them.
3. **Effort fit: Sunday exemption + positive tie-break.** `score.ts`'s long-cook penalty
   (`ctx.slot === 'dinner' && isSchoolNight && totalMinutes > 45`) now additionally requires
   `!isSundayRoast` (`isSunday && recipe.tags.includes('sunday')`) — a `sunday`-tagged dish on Sunday never
   incurs the −10 at all, it's not just offset by the +10 "A proper Sunday dish" bonus. Separately, the
   reasons sort (`Math.abs(b.delta) - Math.abs(a.delta)`) now falls back to `b.delta - a.delta` when two
   reasons tie on absolute delta, so the headline (`reasons[0]`) prefers the positive one. 3 new `score.test.ts`
   tests: the Sunday exemption (long-cook penalty absent, Sunday bonus present), a control case confirming an
   *untagged* long dish still gets penalised on Sunday (the exemption is tag-specific, not day-specific), and
   a realistic tie (`+10` "A proper Sunday dish" vs. `-10` protein alternation from the previous day's same
   protein) asserting the headline is the positive reason.
4. **The Fire the week Sheet anchors next to its trigger on desktop.** `FireTheWeekSheet` never received an
   `anchorRef` at all — `Sheet` rendered it with no `left`/`top`, which (for a `position: fixed` element with
   no inset set) collapses to its default static-flow position, i.e. the viewport's top-left. Fixed by adding
   `anchorRef` to `FireTheWeekSheetProps`, threading it to the inner `Sheet`, and giving `PassView` a
   dedicated `fireButtonRef` (separate from the ticket/ghost-slot `anchorRef` the action sheet and picker
   already share) attached to the header's "Fire the week" button. `Sheet`'s existing clamp
   (`Math.min(Math.max(8, rect.left), window.innerWidth - DESKTOP_WIDTH - 8)`, from Slice 2) already flips/
   clamps a popover near the right edge to stay fully on-screen — that logic needed no changes, only a real
   anchor to clamp *against*.
   **Verified live at 1024px:** opening Fire the week rendered the popover directly below-and-adjacent to the
   header button (not the viewport's top-left), fully inside the 1024px viewport with no horizontal overflow.

**Decisions and deviations.**
- **SUPERSEDED by the QA fixes (second pass) section at the end of this document — kept here only for
  history.** ~~`aggregate()` computes ONLY generated lines (`manual: false`, non-null `key`); manual lines are
  never read or written by it at all. `POST /api/order/generate` (`regenerateGeneratedLines` in
  `order-db.ts`) upserts by `(week_start, key)` — the migration's partial unique index — and deletes any
  `manual = false` row whose key isn't in the fresh set; it never touches `manual = true` rows in any way.
  This reads the spec's "leaves manual lines" literally rather than round-tripping manual rows through
  `aggregate()`'s return value, and matches this codebase's established convention (per ARCHITECTURE.md) that
  only `src/lib/**` pure logic gets unit tests — the "manual line survives regeneration" and "editing a
  generated line converts it to manual, regeneration adds it back separately" behaviours are route-level
  integration behaviour, verified live below rather than unit-tested in isolation.~~ QA (second pass) rejected
  the "editing converts to manual" half of this as a product decision (it silently duplicated a line rather
  than actually editing it) — editing now overrides the generated line in place instead. `aggregate()` still
  never reads or writes manual (`key: null`) rows, but it now DOES accept and honour a generated row's
  `overridden` state. See the QA fixes section for the full replacement design.
- **A line's merge key's unit "family" is finer-grained than the spec's literal "Unit families" list for
  count units.** Mass (kg→g), volume (l→ml) and spoon (tbsp/cup→tsp) units share ONE base-unit token per
  family, so any unit within those families merges. Count units (pcs/clove/slice/can/pack) do **not** all
  share one merge key — `lineKey` uses the literal unit string for them — because summing "2 clove" and
  "3 pcs" of the same ingredient would silently invent a meaningless total; nothing in the spec's own examples
  exercises cross-count-unit merging, only mass-vs-count staying separate (which this still satisfies).
  "Vague" (pinch/handful/no unit) is one shared family, per the spec's literal grouping, and always renders as
  "to taste" once merged, discarding any numeric quantity a vague-unit ingredient happened to carry.
- **`STAPLES`'s exception-list addition: `"peppers"` stays plural, found live against the real seeded week.**
  Chicken Fajitas' ingredient "peppers" (bell peppers, produce) singularized to "pepper" under the spec's
  general plural rule — byte-for-byte the STAPLES entry `"pepper"` (ground black pepper, a pantry seasoning)
  — and the vegetable was silently swept into the STAPLES block with a forced `pantry` aisle. `"peppers"` was
  added to `PLURAL_EXCEPTIONS` (`src/lib/order.ts`) alongside the spec's own `"peas"`/`"beans"` entries, for
  the same reason: it's the base/shopping-list form of the ingredient, not a plural to strip. This is the one
  place this build's `normaliseName` list differs from the spec's literal one; every other exception word
  matches the spec exactly. Caught during browser QA (see below), not anticipated in the original design;
  2 new `order.test.ts` tests cover it (`normaliseName('peppers') === 'peppers'`, and an `aggregate()`-level
  test that bell peppers land in `produce`, not `STAPLES`).
- **`fm_shopping_items.quantity::float8` on every read, not the bare `numeric` column.** The neon serverless
  driver returns a raw `numeric` column as a **string** (to avoid silent float precision loss on a value it
  can't know the app's tolerance for) — this broke `formatQuantity()` at render time
  (`quantity.toFixed is not a function`) the first time a real generated order was loaded, since every other
  numeric value in this codebase reaches the client already-parsed (recipe ingredient quantities travel through
  a `json_build_object(...)` aggregate, where Postgres's JSON serialization emits a genuine JSON number, not a
  quoted string). Casting to `float8` in `order-db.ts`'s `ITEM_SELECT` and the manual-insert's `RETURNING`
  clause makes the driver hand back a real JS number, matching every other numeric field in the app; the
  precision `float8` gives up relative to arbitrary-precision `numeric` is irrelevant for shopping quantities.
  Found and fixed during browser QA (see below).
- **Every line is one 44px tap target that toggles the tick**, not just a small checkbox glyph — the
  checkbox/name/quantity are one `<button>` spanning the row, matching the spec's "Each line is one tap
  target (44px)" literally rather than only the visual tick box being 44px. The small Edit/Delete icons are
  **always present at low opacity** (`opacity-40`, full opacity on hover/focus), not hover-only — VISION.md's
  "No hover-only affordances" rule applies here too, since a touchscreen has no hover state and the original
  `group-hover`-only implementation would have made them permanently unreachable on mobile. Caught and fixed
  during browser QA (see below), not the original design.
- **The Order link's unticked count on The Pass header re-fetches `fm_shopping_items` via `useOrder`
  directly in `PassView`**, the same "small dedicated fetch" pattern Slice 3's Kitchen record and CLEAN PLATES
  used for data outside their host hook's own resource — simpler than plumbing the count through `usePlan` or
  duplicating `useOrder`'s logic.
- **The two empty states are told apart by a second, lightweight `usePlan(weekStart, weekStart+6)` call in
  `OrderView`**, checking for any `planned` entry with a `recipe_id`. `fm_shopping_items` alone can't
  distinguish "nothing planned this week" from "planned but never generated" (both are zero rows), and the
  spec requires different copy and a different action for each.
- **`toPlainText`'s "TO TASTE" rendering lives in the UI** (`OrderLine.tsx`'s `displayQuantity`), not baked
  into `aggregate()`'s stored `quantity`/`unit` (which stay `null`/`null` for a vague line, not a string) —
  keeping `order.ts` free of any hardcoded display string outside `toPlainText` itself, which does render
  `"to taste"` for a `null` quantity in the plain-text export.

**Verification.** `npm test` (326 tests, 45 new: 39 in the new `order.test.ts`, 3 in `fill.test.ts` and 3 in
`score.test.ts` for the carry-over fixes, up from 281 at the end of Slice 3), `npm run lint` and
`npm run build` all green; no `any`, no emojis. `npm run migrate` applied `005_order.sql` for real against the
shared Neon database and a second run skipped it (idempotent).

Browser QA (dev server, port 3111, dark and light, 390px and 1200px/1024px) against the real household data
described in this brief (Ada, fish-allergic child; 34 recipes; the real week of Mon 22 Sep with Fajitas
already on Tuesday) drove, via a mix of the live UI and direct `fetch()`/curl-equivalent calls against the
real API:
- Deleted the Monday Pasta Bake entry (the past-day bug), leaving 6 real dinners Tue–Sun, confirmed against
  the database directly before and after.
- **Generate/aggregate against the real week:** `onion` merged across Chicken Fajitas, Spaghetti Bolognese and
  Shepherd's Pie into one `1½ pcs` line listing all three as sources; `chopped tomato` merged across
  Spaghetti Bolognese's own "chopped tomatoes"; `potato` merged Shepherd's Pie (900g) and Sunday Roast
  Chicken (1kg), scaled to 1 cover each and summed to exactly `480 g` (hand-verified against `scaleQuantity`'s
  rounding rules); `plain flour` (Sunday Roast, 2 tbsp) and `plain flour` (Mac & Cheese, 50g) stayed two
  separate lines (spoon family vs. mass family); `salt and pepper` (Bolognese + Shepherd's Pie, both
  quantity-less/optional) merged into one line rendered **TO TASTE**; `STAPLES` correctly held only `olive
  oil` (merged Bolognese + Pesto Pasta, `1½ tsp`) — see the `"peppers"` finding below.
- **Finding, not in the brief's literal example: Chicken Fajitas' "chicken breasts" and Sunday Roast
  Chicken's "whole chicken" do NOT merge into one "chicken" line.** They're genuinely different ingredient
  *names* under this spec's `normaliseName` (which only handles plural→singular and parenthetical removal,
  not concept-level extraction like the engine's own `primaryProtein` keyword matching) — "chicken breasts"
  singularizes to "chicken breast", "whole chicken" stays "whole chicken", and those are two different
  strings, so `lineKey` correctly keeps them as two separate, correctly-scaled lines (`130 g` and `450 g`).
  This is arguably the *more* correct shopping behaviour (a whole chicken and boneless breast fillets are
  different butcher purchases, not interchangeable), but it means the brief's own live-verification instruction
  ("check chicken merges across Fajitas and Sunday Roast with both as sources") does not hold against the real
  seeded data as written. The underlying merge mechanism itself (acceptance criterion 2's literal scenario —
  two sources with the SAME ingredient name) is proven both by `order.test.ts`'s
  "merges the same ingredient across two dishes and lists both as sources" test and live above (`onion`,
  `chopped tomato`, `potato`, `olive oil` all genuinely merged with multiple sources listed).
- **AC3 (tick preserved across regenerate):** ticked `carrot` (Bolognese/Shepherd's Pie), regenerated — the
  tick and the `1/38` count survived unchanged.
- **AC4 (manual line + edit-to-manual):** added a manual line "Kitchen roll" (2 pack, household) — survived a
  regenerate untouched, listed in its own "Added" block, not under any aisle heading. Edited the generated
  `olive oil` line's quantity (1½ tsp → 3 tsp) — the PATCH response confirmed `manual: true, key: null`;
  regenerating afterwards added a **fresh** `olive oil` line (`1½ tsp`, a new key) into `STAPLES`, while the
  manually-edited one (`3 tsp`) stayed in "Added" — both existing simultaneously, exactly as specified.
- **AC5 (kg/g and pcs/g):** unit-tested directly (`order.test.ts`); live, `carrot` at `100 g` (Sunday Roast)
  and `carrot` at `1 pcs` (Bolognese/Shepherd's Pie) correctly stayed as two lines.
- **AC6 (Copy as text / Share):** `toPlainText`'s output format is unit-tested (header, aisle headings in
  caps, `[ ]`/`[x]`, STAPLES last, optional marker, totals line). Live, `navigator.clipboard.writeText`
  itself was denied by this sandboxed browser's permissions (`NotAllowedError`) — an environment limitation,
  not an app bug: `handleCopy` already catches that failure silently, which is why the button's `COPIED` state
  never appeared in this environment; the underlying text generation is correct per the unit tests. `Share`
  correctly did not render at all, since `navigator.share` doesn't exist in this browser context — confirmed
  the `canShare` check works both ways (absent here, and this exact check is what makes it appear on a
  browser/device that does support it).
- **AC7 (looks like a receipt, both themes, 390px/1200px, reduced motion):** perforated top and the torn
  zigzag bottom (a separate glued-on strip, not fighting the top perforation for one `mask-image`) both
  rendered correctly in dark and light at 390px and desktop widths; monospace throughout; dashed rules between
  aisle blocks; the tick's strike-through reuses the already reduced-motion-aware `.rk-strike` animation from
  Slice 0/2 (1ms duration under `prefers-reduced-motion: reduce`), not a new animation.
- **AC1/AC8:** migration idempotent (second `npm run migrate` skipped it); `npm test`/`lint`/`build` green
  throughout, re-confirmed after every fix below.
- **Carry-over fixes:** all four verified live, see above.
- **The Pass's Order link:** showed a live `38` badge (`, 38 lines unticked` for screen readers) matching the
  real generated total; confirmed it updates after regenerate/clear via the same `useOrder` fetch.

**QA fixes made during this same pass** (found live, not a separate review round — all re-verified after
fixing, `npm test`/`lint`/`build` re-run green):
1. **`fm_shopping_items.quantity` string-vs-number** (`quantity.toFixed is not a function`) — see the
   `float8` deviation above.
2. **`"peppers"` vs. `STAPLES`'s `"pepper"`** — see the `PLURAL_EXCEPTIONS` deviation above.
3. **A manual line's aisle heading rendered empty.** `OrderView`'s aisle-grouping originally counted manual
   lines toward `grouped` (so a `household`-aisle manual line produced a `HOUSEHOLD` heading) but then failed
   to render anything under it (the aisle blocks look items up by `key`, which a manual line doesn't have) —
   the manual line rendered a second time, correctly, in its own block with no heading at all. Fixed by
   excluding `manual` lines from `grouped`/`STAPLES` entirely and giving the manual block its own "Added"
   heading.
4. **Edit/Delete were hover-only, and the tick target was only the 24px checkbox glyph** — see the 44px
   tap-target deviation above.

All test data created during this pass (a temporary manual "Kitchen roll" line, the manually-edited `olive
oil` duplicate) was deleted afterwards via the real API; the real order was regenerated fresh once more
before finishing. Confirmed back to exactly: 1 member (Ada), 34 recipes, 6 plan entries (the real Tue–Sun
week, Monday's past-day entry deleted per this brief), 0 ratings, and `fm_shopping_items` holding exactly one
week (2026-09-21) with 38 generated lines, 0 manual, 0 checked — the real, freshly-printed order for the
household.

**Deferred / out of scope for this slice** (per spec, not gaps): no drag-and-drop reordering of manual lines
(add/delete only, matching every prior slice's "buttons only" precedent). No pagination on `GET /api/order` (a
private household's weekly shopping list is at most a few dozen lines). `POST /api/order/clear`'s
`checkedOnly` is always `true` per the spec's own literal shape (not a general "clear all" endpoint).

## QA fixes (second pass — verdict FIX FIRST, six findings)

All six addressed below. `npm test` (343 tests, 17 new), `npm run lint` and `npm run build` were re-run green
after all six together, and every item was also separately re-verified live (dev server, port 3111, real Neon
database) as described. All scratch data created during verification (a temporarily-zeroed attendee list, a
temporary manual "salt" line, a temporarily-deleted-then-regenerated `olive oil` line from a mis-click) was
restored/removed afterwards; the database was confirmed back to exactly 1 member, 34 recipes, 6 plan entries
each with their original single attendee, 0 ratings, and `fm_shopping_items` holding 38 generated lines for
week `2026-09-21` with 0 manual/overridden/checked before finishing.

1. **MAJOR — spoon-unit merges printed raw decimals ("2.33 tbsp").** `resolveDisplay` (`src/lib/order.ts`) now
   snaps every display quantity to the same kitchen-sensible steps `scaleQuantity` (Slice 1) already uses when
   scaling a single recipe, instead of a plain `round2`: tsp/tbsp/cup snap to quarter steps (`roundToStep(v,
   0.25)`) once converted to the chosen unit, so `formatQuantity`'s existing ¼ ½ ¾ rendering always has
   something exact to work with; mass/volume under 1000 g/ml snap to the same 5-unit (<100) / 10-unit (≥100)
   step `scaleQuantity` uses; mass/volume at 1000+ convert to kg/l rounded to **one decimal place** (`round1`),
   not the g/ml step — a kitchen scale reads kilograms to one decimal, not to the nearest 10g. `roundToStep`
   also carries over `scaleQuantity`'s "never round a genuinely non-zero value down to exactly 0" guarantee.
   5 new `order.test.ts` tests, including the three literal cases from the QA brief.
   **Verified live:** every quantity on the real week's regenerated order (38 lines) renders as a clean
   fraction, whole number or ≤1-decimal value — no raw multi-decimal quantity anywhere (spot-checked via
   `get_page_text` over the full receipt).

2. **MAJOR — "-ves" plurals and a false-positive on olives/chives/cloves.** Added `IRREGULAR_PLURALS`
   (`src/lib/order.ts`): a closed lookup (not a general "-ves" regex, since that would also catch
   olives/chives/cloves) for `leaves→leaf`, `loaves→loaf`, `halves→half`, `knives→knife`, `shelves→shelf`,
   checked in `singularizeWord` right after the exception-list check. `"olives"`/`"chives"`/`"cloves"` were
   added to `PLURAL_EXCEPTIONS` — not a bug fix so much as a product decision (like peas/beans, they're
   conventionally bought and listed in their plural form), and it also happens to sidestep them ever reaching
   a -ves rule in the first place. `-ies→-y` (cherries/berries) and `-oes→-o` (tomatoes/potatoes) were already
   correct in the existing code; added explicit regression tests for them per the brief's request. 9 new
   `order.test.ts` tests across a new `normaliseName — irregular plurals` describe block.
   **Verified:** unit tests above; live regeneration of the real week still shows `peppers` (unaffected,
   already fixed in the prior QA pass) correctly outside STAPLES, confirming no regression from the new
   exception-list entries.

3. **MAJOR — product decision: editing a generated line now OVERRIDES it in place, never duplicates it.**
   New migration `db/migrations/006_order_overridden.sql` adds `fm_shopping_items.overridden boolean not null
   default false` (applied for real against the shared Neon database; a second `npm run migrate` skipped it).
   - **`src/lib/order.ts`**: `ShoppingLine` and `ExistingCheckedLine` both gained `overridden` (plus
     `ExistingCheckedLine` gained optional `name`/`quantity`/`unit`/`aisle`, only meaningful when
     `overridden: true`). `aggregate()` now looks up each computed key against `existingItems`; when the match
     has `overridden: true`, the returned line uses that row's own `name`/`quantity`/`unit`/`aisle`/`checked`
     **exactly**, refreshing only `sources` from the current entries. An overridden row whose key doesn't
     appear in the current computation at all (dish removed from the pass, or every contributing entry now has
     zero effective covers — see finding 4) is simply absent from the result, same as any other line that
     stops existing; `regenerateGeneratedLines` already deletes any stored row not present in `aggregate()`'s
     return value, so no separate "removal" code path was needed.
   - **`src/lib/order-schema.ts` / `order-db.ts`**: `patchOrderItemSchema` gained `overridden: z.literal(false)`
     (a client can only ever *clear* the flag, never set it — setting it is a side effect of a content edit,
     not a direct client assertion). `patchOrderItem` now: sets `overridden = true` (keeping the same row and
     `key` — no more nulling the key or flipping `manual`) when a content field (name/quantity/unit/aisle) is
     patched on a still-generated line; sets `overridden = false` when the body is exactly `{ overridden:
     false }` ("Undo edit"); a manual line's own edits are unaffected (it has no key/generated status to
     override).
   - **`src/app/api/order/generate/route.ts`** now passes the full existing-row shape (not just
     `key`/`checked`) into `aggregate()`.
   - **UI** (`OrderLine.tsx`/`OrderView.tsx`): a small mono `EDITED` marker (pass-orange) renders next to an
     overridden line's name; its inline editor gains an `Undo edit` link (only when `item.overridden`) that
     PATCHes `{ overridden: false }` then calls `generate()` — clearing the flag alone doesn't recompute
     anything by itself, so the client always follows up with a real regenerate, per the brief.
   4 new `order.test.ts` tests: an overridden line surviving regeneration unchanged except sources; undo then
   regenerate restoring the computed values; removal once the key no longer exists in the plan; a
   non-overridden line correctly ignoring a stale existing row's name/quantity.
   **Verified live, end to end against the real order:** edited `olive oil`'s quantity via the real PATCH
   endpoint — `overridden: true`, same `id`/`key`, total line count unchanged (**no duplicate**); regenerated —
   the row survived with its edited quantity exactly preserved and a bumped `updated_at` (sources refreshed);
   opened the real inline editor in the browser and clicked the real `Undo edit` button — `overridden` flipped
   to `false` and the quantity was restored to the computed value, via the actual UI control, not just the API.

4. **MINOR — zero-quantity lines.** In `aggregate()`'s per-ingredient loop, a non-vague ingredient whose
   `scaleQuantity` result is exactly `0` (zero effective covers: 0 attendees and no `servings` override) is
   now skipped entirely — no source, no contribution to the merged sum, as if that entry didn't mention the
   ingredient at all. A vague-unit ingredient (to taste) is exempt, since it carries no real quantity to be
   zero in the first place and "0 covers" doesn't make a pinch of salt any less needed. 3 new `order.test.ts`
   tests.
   **Verified live against the real week:** temporarily set Chicken Fajitas' attendees to `[]` and regenerated
   — the 6 ingredients unique to that dish (tortilla wrap, peppers, lime, fajita spice mix, chicken breast,
   soured cream) disappeared entirely (38 → 32 lines) rather than showing as 0-quantity lines, and the shared
   `onion` line's sources correctly dropped Fajitas' contribution while keeping Bolognese's and Shepherd's
   Pie's; restored the real attendee and regenerated again to confirm the real order came back to 38 lines
   unchanged.

5. **MINOR — staples consistency in `toPlainText`.** `toPlainText` now buckets a `manual` line into its own
   `ADDED` section (same name the receipt itself already uses for manual lines) **before** checking `staple`
   at all, so a manually-added line named e.g. "salt" can never land under `STAPLES` — matching the on-screen
   receipt's own grouping (`OrderView.tsx`), which has never rendered a manual line inside the STAPLES block
   either. 1 new `order.test.ts` test.
   **Verified live:** added a real manual line named "salt" via the API — the live receipt showed it under
   `ADDED`, after `STAPLES` (which correctly held only the genuine generated `olive oil` line); deleted it
   afterwards. (`toPlainText`'s own clipboard output couldn't be read back in this sandboxed browser —
   `navigator.clipboard.writeText` is permission-denied here, an environment limitation, not an app bug, as
   already noted in the original Verification section — so the format itself is confirmed by the unit test and
   by the on-screen grouping it now matches exactly.)

6. **MINOR — `/order` showed a "0/0 LINES TICKED" shell while loading.** New `src/components/order/
   OrderSkeleton.tsx`: a few shimmering mono bars (reusing the shared, reduced-motion-safe `.rk-skeleton`
   shimmer from Slice 3's `SkeletonTicket`) inside the same perforated-top/torn-bottom `.rk-receipt` shell, so
   it reads as "the same receipt, still loading" rather than a different empty state. `OrderView` now renders
   this whenever `useOrder`'s `loading` **or** the empty-state-deciding `usePlan`'s own `loading` is true
   (the second one wasn't explicitly asked for but fixes the same class of bug: deciding between the two empty
   states from a still-empty `planEntries` before `usePlan`'s own fetch resolves could otherwise flash "Nothing
   on order" for a week that does have planned dishes) — the real receipt and both empty states only render
   once both have resolved.
   **Verified live:** a fresh navigation to `/order` reliably showed the skeleton (shimmering bars, no "0/0"
   text anywhere) before the real 38-line receipt replaced it — screenshotted mid-load.
