# Slice 2 — The Pass: the weekly planner

Read `docs/VISION.md`, `docs/ARCHITECTURE.md`, and the Build notes of slices 00 and 01 first.

## Goal

The Pass is the home screen and the heart of the app: a week of services as a rail of paper tickets.
Fire a dish onto a slot, choose who's eating, plate it when it's served, 86 it when plans change.
It must be fast on a phone in a kitchen and beautiful on a laptop on a Sunday night.

## Schema (`db/migrations/003_pass.sql`)

```sql
create table fm_plan_entries (
  id serial primary key,
  service_date date not null,
  slot text not null,                                -- breakfast | lunch | dinner | snack
  recipe_id integer references fm_recipes(id) on delete set null,
  custom_name text,                                  -- used when recipe_id is null: "Leftovers", "Takeaway"
  servings integer,                                  -- null = number of attendees
  status text not null default 'planned',            -- planned | plated | eightysixed
  notes text,
  position integer not null default 0,               -- ordering within a slot; several tickets per slot allowed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recipe_id is not null or custom_name is not null)
);
create index fm_plan_entries_date_idx on fm_plan_entries(service_date, slot, position);
create table fm_plan_entry_attendees (
  entry_id integer not null references fm_plan_entries(id) on delete cascade,
  member_id integer not null references fm_members(id) on delete cascade,
  primary key (entry_id, member_id)
);
```

Attendees are explicit. New entries default to every member. "Covers" in the UI = attendee count.

## Logic (`src/lib/dates.ts`, unit tested)

All calendar maths on `YYYY-MM-DD` strings, never on UTC `Date` conversions that can shift a day.
`todayISO()` (client local), `startOfWeek(iso)` (Monday), `addDays(iso, n)`, `weekDays(iso)` → 7 strings,
`formatDayShort(iso)` → `MON 22`, `formatDayLong(iso)` → `MON 22 SEP`, `formatWeekKicker(iso)` →
`WEEK OF MON 22 SEP 2026`, `isSameWeek`.

## API

- `GET /api/plan?from=&to=` → entries in range, each with `attendees: number[]`, and when `recipe_id` set a
  `recipe` summary `{ id, name, totalMinutes, allergens, mealTypes }` and `compat` computed against the
  **attendees only** (not the whole family).
- `POST /api/plan` `{ service_date, slot, recipe_id | custom_name, attendees?, servings?, notes? }`.
  Missing `attendees` → all members. Returns the entry in the same shape as GET.
- `PATCH /api/plan/[id]` any of `{ service_date, slot, recipe_id, custom_name, attendees, servings, status,
  notes, position }`. Replaces attendees wholesale when given. Bumps `updated_at`.
- `DELETE /api/plan/[id]` → hard delete, `204`.
- `GET /api/plan/history?limit=50` → `plated` entries, newest first, same shape.
- zod on everything; `slot` and `status` validated against vocab.

## Screens

### `/` — The Pass (replaces the Slice 0 placeholder home)

**Header:** kicker `WEEK OF MON 22 SEP 2026`, title `THE PASS`, actions: `‹` `Today` `›` (mono), and a
`Past services` link. The week in view is in the URL (`/?week=2026-09-22`) so it is shareable and reload-safe.

**Desktop (≥ 1024px):** seven columns, Monday to Sunday. Each column: display-font day header (`MON` large,
`22 SEP` mono beneath), then four slot rails (BREAKFAST, LUNCH, DINNER, SNACK as tiny mono labels).
Today's column sits under the **heat lamp**: a soft radial pass-orange glow behind it and a pass-orange rule
under its header. Past days are slightly dimmed.

**Mobile (< 1024px):** a horizontal strip of seven day chips (`MON 22` … ), today highlighted, selected day
in pass orange; below it the selected day's four slot rails stacked. Default selected day is today when the
week in view contains today, else Monday. `‹` `›` move a week.

**Ticket on the pass:** mono header `DINNER · 35 MIN · 4 COVERS` (custom entries: `DINNER · TAKEAWAY`),
dish name in display font, a row of small attendee avatar discs, notes preview in ink-soft if present.
State: `planned` = paper; `plated` = mint `PLATED` stamp and a mint left rule; `eightysixed` = red `86'D` stamp,
name struck through, reduced opacity. If `compat.safe === false` a red `CHECK` stamp; tapping the ticket
shows the reasons.

**Empty slot:** a dashed-outline ghost ticket reading `+ Fire something` (mono). Tap to open the picker.

**Tap a ticket → action sheet** (bottom sheet on mobile, anchored popover on desktop; one component
`src/components/ui/Sheet.tsx`): dish name at top, then actions as full-width `ink` buttons:
`Plate it` / `Un-plate` (toggle), `86 it` / `Bring it back`, `Covers` (attendee toggles inline, saves on change),
`Move` (date field + slot chips, save), `Swap dish` (opens the picker in swap mode), `Notes` (textarea, save),
`Remove` (danger, inline confirm). Optimistic updates for Plate/86/Covers; rollback on failure with an inline
error line.

**The picker** (`src/components/pass/DishPicker.tsx`, a `Sheet`): search field with autofocus, meal-type
chips preset to the slot, a `Safe for these covers` toggle on by default (uses `compat` against the current
attendee set), results as compact ticket rows (name, minutes, allergen chips, `NOT FOR X` stamp when unsafe),
and a `Something else` section with `Leftovers`, `Takeaway`, `Eating out` and a free-text field.
Choosing creates or swaps the entry and the ticket spikes onto the rail with the spring-in motion.

### `/menu/[id]` — add `Put on the pass`

A `pass` Button on the menu card. Opens a small Sheet: next 14 days as chips (`TODAY`, `TOMORROW`,
`WED 24` …), slot chips preset from the recipe's first meal type, `Fire it` confirms. Success shows a mint
`ON THE PASS` stamp on the button for two seconds and a link to that week.

### `/pass/history` — Past services

Plated entries grouped by date, newest first, each a compact ticket row with `Plate it again` which opens
the 14-day chooser above. Empty state: `NOTHING PLATED YET`.

### The Table — small addition

Each member ticket shows `NEXT SERVICE: TUE DINNER · CHICKEN FAJITAS` (mono, ink-soft) if they are an
attendee of any future entry. Purely informational.

## Acceptance criteria

1. Migration applies cleanly and idempotently.
2. `dates.ts` tests cover week start across month and year boundaries, Sunday handling, and `formatWeekKicker`.
3. Fire a dish from an empty dinner slot: it appears with all members as covers, correct header, and animates in.
4. Change covers to exclude the member with the fish allergy and the `CHECK` stamp on Fish Pie disappears;
   re-include them and it returns. `compat` is against attendees, not the family.
5. Plate, un-plate, 86, bring back, move to another day/slot, swap dish, notes, remove all work from the
   sheet and survive reload. Optimistic actions roll back visibly if the API fails (verify by killing the
   dev server mid-action or by a forced 500).
6. Week navigation updates the URL; reloading `/?week=…` shows that week; `Today` returns to the current week
   and, on mobile, selects today.
7. `Put on the pass` from a menu card creates the entry on the chosen day and slot.
8. History lists plated entries and `Plate it again` creates a new planned entry.
9. Works at 390px and 1200px, dark and light; today's column glows; motion respects reduced-motion.
10. `npm test`, `npm run lint`, `npm run build` green. No emojis, no `any`.

## Build notes

**What was built.** Every item in Scope: migration `db/migrations/003_pass.sql` (`fm_plan_entries`,
`fm_plan_entry_attendees`, applied for real against the shared Neon database, idempotent on a second
`npm run migrate`); `src/lib/dates.ts` (all seven required functions plus two small display helpers,
`formatWeekdayShort`/`formatDayAndMonth`, for the two-line desktop day header) with 18 unit tests in
`dates.test.ts` cross-checked against an independently-implemented Zeller's congruence (not against the
module's own logic) covering month and year boundaries, Sunday handling and `formatWeekKicker`; the plan API
(`src/lib/plan-schema.ts` zod schemas, `src/lib/plan-db.ts` data access, `GET/POST /api/plan`,
`GET/PATCH/DELETE /api/plan/[id]`, `GET /api/plan/history`) with `compat` always computed against an entry's
own `attendees`, never the whole household; `src/hooks/usePlan.ts` and `src/hooks/usePlanHistory.ts`;
`src/components/ui/Sheet.tsx` (bottom sheet < 1024px, anchored popover ≥ 1024px, shared by the action sheet,
`DishPicker` and `DayChooser`); `src/components/pass/` (`PassTicket`, `ActionSheet`, `DishPicker`,
`DayChooser`, `PassView` — the week grid, desktop 7-column and mobile day-strip-plus-stacked, in one file
since they share the same entries/sheet-state); `/` rewritten entirely (Suspense-wrapped `PassView`,
replacing the Slice 0 placeholder); `/pass/history`; `Put on the pass` wired into `/menu/[id]`; The Table's
`NEXT SERVICE` line (`src/app/(app)/table/page.tsx` + `MemberCard.tsx`). `Ticket` gained a `plated` variant
(mint left rule, mirroring the existing `warning` variant) and `globals.css` gained `.rk-sheet-in` (sheet
entrance, reduced-motion aware) and `.rk-heat-lamp` (today's soft radial pass-orange glow).

**Decisions and deviations.**
- **A ghost "+ Fire something" tile is always appended to a slot's ticket list, even when the slot already
  has entries** — not just shown for empty slots. The spec's "several tickets per slot allowed" is only
  reachable in the UI if there's a way to add a second ticket to a non-empty slot, and re-using the same
  ghost affordance (rather than a separate "add another" control) keeps one visual language for "start a new
  ticket here" everywhere.
- **`compat` on `PlanEntryWithDetails` is `null`, not `{safe:true,conflicts:[]}`, when the entry has no
  recipe.** A custom entry ("Takeaway") has nothing to check compatibility against, and `null` lets the UI
  (`PassTicket`, `ActionSheet`) skip the CHECK stamp and conflict panel entirely via a single falsy check,
  rather than every consumer needing to know "compat can be trivially true but also meaningless."
- **The db's `recipe_id IS NOT NULL OR custom_name IS NOT NULL` check constraint is pre-validated in both
  the POST and PATCH route handlers** by merging the patch against the existing row's current values before
  the query runs, exactly mirroring how `fm_recipes`' PATCH already builds its SET clause from only the
  fields present in the body. This turns what would otherwise be a raw Postgres constraint-violation 500
  (e.g. Swap dish clearing `recipe_id` without setting `custom_name`) into a clean `400 validation` response.
- **`usePlan`'s `patchEntry` takes an `optimistic` flag per call, not per hook.** Plate/Un-plate/86/Bring
  back/Covers call it with `optimistic=true` (apply the patch to local state immediately, roll back to the
  pre-patch snapshot if the server rejects it); Move/Swap dish/Notes/Remove call it with the default `false`
  (nothing changes on screen until the server confirms) — matching the spec's "optimistic for
  Plate/Un-plate/86/Bring back/Covers... pessimistic for create/move/swap/remove" line item for item, from
  one hook rather than two.
- **A `PassTicket`'s React `key` includes `entry.updated_at`** (`` `${entry.id}-${entry.updated_at}` ``), not
  just `entry.id`. Since `updated_at` bumps on every PATCH, this forces a fresh mount — and therefore a fresh
  `.rk-spike-in` animation — on every state change, not just on create. That's what makes Swap dish (and
  Plate/86/Move) "spike onto the rail" again per the spec's motion language, without needing separate
  animation-trigger plumbing.
- **`Sheet`'s focus-capture effect is keyed only on `open`, not `[open, onClose]`.** `onClose` is passed as a
  fresh inline function on every render of the parent (`PassView`, `ActionSheet`, etc.), and parents re-render
  independently of the sheet (e.g. `usePlan`/`useMembers` refreshing). Including `onClose` in that effect's
  deps re-ran it on every such parent re-render, re-capturing "previously focused element" as whatever already
  had focus *inside* the panel (e.g. the search field that had just received its own `autoFocus`) instead of
  the original external trigger — found and fixed during browser QA (see below). The Escape/Tab-trap listener
  is a separate effect that still depends on `[open, onClose]`, since re-attaching a keydown listener on every
  parent re-render is harmless, unlike stomping the focus-restore target.
- **`Sheet`'s desktop popover computes an explicit `maxHeight` from the actual free space around the anchor**,
  rather than relying on a fixed Tailwind `max-h-[80vh]`. A `bottom`-anchored popover sizes itself *upward*
  from that point by its natural content height — `max-height` alone only caps it, it doesn't reserve space —
  so a tall panel (the `DishPicker`'s scrollable recipe list) opening "upward" near the bottom of the viewport
  could render started above the top of the viewport entirely. Also found and fixed during browser QA.
- **`DishPicker`'s meal-type filter starts pre-selected to the current slot but is a genuine multi-select
  (`ChipToggle` per `MEAL_TYPE`)**, not a single-select segmented control — the spec says "chips preset to the
  slot," which this satisfies, while still letting someone searching for a specific dish widen the filter
  rather than being stuck to one meal type.
- **The Table's `NEXT SERVICE` line looks 60 days ahead** (`usePlan(today, addDays(today, 60))`), not
  unbounded. "Any future entry" per the spec is satisfied for any realistic planning horizon on a private
  single-household app without an unbounded range query.
- **`/` (The Pass) is no longer a `force-dynamic` server component.** Slice 0's placeholder read `fm_members`
  directly at request time and needed that flag to avoid Next baking in build-time data. The rewritten page is
  a pure client component (`PassView`) wrapped in `Suspense` for `useSearchParams`; it has no server-side data
  fetch to go stale, so `next build` now happily prerenders it as static shell (confirmed in the build output:
  `○ /`) and the real data loads client-side on mount, same as every other authenticated screen.

**Browser QA (dev server, port 3111).** Drove the full flow live, dark and light, desktop (1280px) and
mobile (390px), against the real Neon database (1 pre-existing member, Ada, child, fish allergy; 34 seeded
recipes): fired Fish Pie onto an empty Tuesday dinner slot from an empty week (spike-in on create, header
`DINNER · 55 MIN · 1 COVER`, CHECK stamp since Ada is allergic to fish); opened the action sheet and
confirmed the CHECK panel names the reason (`Allergic to fish`); toggled Covers to exclude Ada — CHECK stamp
and panel disappeared, ticket header dropped to `0 COVERS` — then re-included her and watched both return
(Acceptance criterion 4); Plate it (mint `PLATED` stamp + left rule) / Un-plate; 86 it (`86'D` stamp, name
struck through, dimmed) / Bring it back; Move (Tue dinner → Wed lunch, ticket relocated, notes and CHECK
preserved); Swap dish (Fish Pie → Lentil Soup mid-picker, notes and covers preserved, CHECK cleared since
Lentil Soup has no fish); Notes (saved, previewed on the ticket); Remove (inline confirm, ticket gone, sheet
auto-closed via the "entry vanished" effect); week navigation (`›` updated the URL to `?week=2026-09-28`,
direct navigation to that URL reload-safely showed that week spanning into October, `Today` returned to
`?week=2026-09-21`); mobile (390px) day-strip + stacked slots, bottom sheet for both the action sheet and
`DishPicker`; `Put on the pass` from `/menu/31` (Fish Pie) onto tomorrow's dinner, confirmed via the API
(not just the transient 2-second stamp, which had already reverted by the time of my next check — a timing
artifact of the QA pass, not a bug); `/pass/history` listing the plated entry grouped by date, `Plate it
again` creating a fresh `planned` entry for today via the same `DayChooser`; the `NEXT SERVICE` line on
Ada's Table card (`TUE DINNER · FISH PIE`). **Forced failure / rollback:** created a "Takeaway" entry,
deleted it directly via the API (simulating another tab/session), then clicked `Plate it` in the still-open,
now-stale action sheet — the `PATCH` 404'd, the optimistic status flip rolled back visibly (button stayed
`Plate it`, no `PLATED` stamp appeared), and the sheet showed `Could not update — try again.` (Acceptance
criterion 5's forced-failure case). Sheet accessibility: `aria-modal="true"` and an `aria-label` matching the
title confirmed via the DOM; Escape and click-on-scrim both close the sheet; a child field's own `autoFocus`
(the `DishPicker` search field) is respected rather than overridden (see QA fixes below). Focus RESTORATION
to the trigger element on close could not be verified in this environment — `document.hasFocus()` was `false`
throughout the session (the automation's browser window never had OS-level focus), which makes
`document.activeElement` behave unreliably for this one specific check regardless of the app code; the fix
is correct by inspection (see the `Sheet` deviation above) but a human should re-check "does focus visibly
return to the ticket/button I tapped" with a real click in a real, focused browser window. All test data
(plan entries) created during this pass was deleted afterwards; `fm_plan_entries` was confirmed empty and
`fm_members`/`fm_recipes` confirmed unchanged (1 member, 34 recipes) before finishing.

**QA fixes (found and fixed during this same pass, not a separate review round).**
1. **Desktop popover could render above the top of the viewport.** See the `Sheet` maxHeight deviation
   above. Verified live: opening the picker from a ghost slot near the bottom of the grid, before the fix,
   showed the sheet's title and search field cut off above the visible viewport; after the fix it renders
   fully on-screen, flipping to open upward only when there's genuinely more room above than below.
2. **A child field's `autoFocus` was silently overridden by the Sheet's own initial-focus logic**, which
   unconditionally focused the first focusable element (always the Close button, before the search field in
   DOM order). Fixed by checking `panelRef.current?.contains(document.activeElement)` first and skipping the
   forced focus if something inside the panel is already focused. Verified live: `document.activeElement`
   after opening `DishPicker` changed from the Close button to the search input.
3. **The focus-restore-on-close target could get silently corrupted.** See the `Sheet` effect-splitting
   deviation above — `onClose`'s changing identity on unrelated parent re-renders was re-running the
   focus-capture effect and re-capturing the wrong element. Fixed by splitting into two effects. Not
   independently re-verifiable end-to-end in this environment (see the browser QA note on
   `document.hasFocus()` above), but the specific mechanism (parent re-render → effect re-run → wrong capture)
   was confirmed by code inspection and the fix removes that re-run trigger entirely.

**Deferred / out of scope for this slice** (per spec, not gaps): drag-and-drop reordering of tickets within
a slot (position is set automatically on create; no manual reorder UI, matching the same "buttons only, no
drag-and-drop" precedent Slices 0 and 1 both set). No pagination on `/api/plan/history` beyond `?limit=`. No
push/real-time sync between two open tabs — the "forced failure" scenario above (another tab deleting an
entry from under an open action sheet) is handled gracefully (rollback + the sheet auto-closes once its
entry disappears from the next successful fetch) but the currently-open tab doesn't proactively poll.

## QA fixes (second pass — verdict FIX FIRST, six findings)

All six addressed. `npm test` (182 tests), `npm run lint` and `npm run build` all green after all six
together; every item was also separately re-verified live below (dev server, port 3111, real Neon database).
All test data created during this pass (temporary archived recipes, temporary plan entries) was deleted
afterwards; the database was confirmed back to 0 plan entries / 1 member / 34 recipes before finishing.

1. **BLOCKER — invalid calendar dates 500'd instead of 400ing.** `src/lib/plan-schema.ts`'s `isoDateSchema`
   only matched the `YYYY-MM-DD` shape; `Date.UTC` silently normalizes overflow (`2026-02-30` rolls over to
   March 2), so a shape-valid-but-calendrically-invalid date either reached the database as a silently
   different date or crashed a raw SQL `date` cast. Added `isValidISODate` to `src/lib/dates.ts`: shape check
   plus a round-trip through `Date.UTC`, rejecting anything whose parsed year/month/day don't come back
   exactly unchanged (correctly handles the Gregorian leap-year rule, including the ÷100-but-not-÷400
   century case). 24 new unit tests in `dates.test.ts` cover the required cases (`2026-02-30`, `2026-13-01`,
   `2027-02-29` invalid; `2028-02-29`, `2026-12-31` valid) plus non-zero-padded, wrong-length-year and
   wrong-separator shape rejections and an explicit `1900-02-29` century-rule check. Wired in three places:
   `plan-schema.ts`'s `isoDateSchema` (covers `service_date` on both create and patch), and `GET /api/plan`'s
   `from`/`to` query params (`src/app/api/plan/route.ts`), which previously used their own bare shape regex.
   The `?week` URL param on The Pass itself (`PassView.tsx`) already normalised any input (valid or not)
   through `startOfWeek`, which itself calls `Date.UTC`, so an invalid `?week` value was already silently
   corrected to a nearby real week rather than crashing — no separate fix needed there, confirmed by reading
   `PassView.tsx` fresh rather than assumed.
   **Verified with real `curl`** (fresh login, cookie jar): `POST /api/plan` with
   `service_date: "2026-02-30"` → `400 {"error":"validation","issues":[{"message":"Date must be a real
   YYYY-MM-DD calendar date", ...}]}`, not a 500. Also verified `GET /api/plan?from=2026-02-30&...` and
   `?from=2026-13-01&...` both 400, and a valid range still 200.

2. **MAJOR — Sheet had no body scroll lock.** Added `lockScroll`/`unlockScroll` to `src/components/ui/Sheet.tsx`:
   module-scoped (not per-instance) `scrollLockCount` plus saved-state variables, so the lock/unlock pair is
   shared across every `Sheet` on the page. Locking (only at the mobile/bottom-sheet breakpoint — the desktop
   popover doesn't cover the page) saves `window.scrollY`, pins `<body>` via `position: fixed` + a negative
   `top` offset (not just `overflow: hidden`, which doesn't reliably stop iOS touch-scroll bounce) and hides
   overflow on `<html>`; only the first lock call (count 0→1) actually applies this, and only the call that
   brings the count back to 0 restores it, via `window.scrollTo` to the exact saved position — so two sheets
   open at once (or a sheet-to-sheet transition like Swap dish) never unlocks scrolling prematurely.
   **Verified live at 375px** (`/menu/31`, which has enough content to genuinely overflow): scrolled to
   `y=300`, opened "Put on the pass" — `body.style.position` became `"fixed"` and `top` became `"-300px"`,
   `window.scrollY` read `0`. Dispatched a `wheel` event and called `window.scrollTo(0, 500)` while open —
   `scrollY` stayed `0` (the scroll gesture had no effect). Closed the sheet — inline styles cleared, and
   `window.scrollY` was `300` again (exact restore) with the page scrollable once more (`scrollTo(0, 450)`
   worked). Also drove the more realistic "nested" case the counter exists for — opened a ticket's action
   sheet, then clicked **Swap dish** (which unmounts the action sheet's `Sheet` and mounts `DishPicker`'s
   `Sheet` in the same state transition) — `body.style.position` stayed `"fixed"` continuously through the
   transition (title changed from "Fish Pie" to "Fire something" without the lock ever visibly dropping),
   and closing that second sheet released cleanly (`position`/`overflow` both back to `""`). The app's own UI
   never mounts two `Sheet`s *simultaneously* (only one `sheet` state in `PassView` at a time), so a true
   concurrent-lock scenario isn't reachable through the real app; the counter's `0→1`/`1→0` arithmetic was
   also confirmed correct by direct code inspection.

3. **MAJOR — slot ordering was alphabetical (breakfast, dinner, lunch, snack) instead of chronological.**
   Added `src/lib/planOrder.ts`: `mealSlotIndex` (a slot's position in `MEAL_TYPES`) and two comparators,
   `comparePlanEntries` (ascending: date, then meal chronology, then ticket position, then id) and
   `comparePlanEntriesForHistory` (same, but newest date first). `plan-db.ts`'s two list queries
   (`fetchPlanEntriesInRange`, `fetchPlanHistory`) dropped the alphabetical `ORDER BY pe.slot` SQL clause
   entirely and now apply the authoritative order in JS after fetching. `/pass/history`'s `groupByDate` now
   explicitly re-sorts both the day-groups (newest first) and each day's own entries (`comparePlanEntries`)
   rather than trusting fetch order — the same "don't trust insertion order, re-sort explicitly" approach
   `table/page.tsx`'s `NEXT SERVICE` lookup already used, and that lookup was itself refactored to import
   `comparePlanEntries` instead of its own inline `MEAL_TYPES.indexOf` comparator, so there's one shared
   implementation instead of two that could drift. 9 new unit tests in `planOrder.test.ts` cover
   breakfast/lunch/dinner/snack ordering (explicitly asserting it's NOT alphabetical), date-before-slot
   precedence, position as a tie-break for multiple tickets in one slot, id as a final tie-break, and the
   history comparator's newest-first date order combined with still-chronological same-day ordering.
   **Verified live on `/pass/history`** with four plated entries on one day, one per slot, created in
   snack/breakfast/dinner/lunch order (deliberately not chronological) — both the raw API response and the
   rendered page showed BREAKFAST, LUNCH, DINNER, SNACK.

4. **MINOR — create didn't require exactly one of recipe_id/custom_name; patch could leave both set.**
   `createPlanEntrySchema`'s refine changed from "at least one" (`||`) to "exactly one" (`!==`, i.e. XOR).
   For `PATCH /api/plan/[id]`: explicitly setting both to non-null values in one request is now rejected
   with `400 "Cannot set both recipe_id and custom_name"`; setting just one of them (to a non-null value)
   now automatically nulls the other — even if the other field wasn't mentioned in the request at all (e.g.
   Swap dish only ever sends `recipe_id`, and the entry's previous `custom_name` now clears automatically
   rather than needing the client to remember to clear it itself).
   **Verified with `curl`:** `POST /api/plan` with both `recipe_id` and `custom_name` set → `400 "Provide
   exactly one of recipe_id or custom_name"`; with neither → the same 400. `PATCH` behaviour confirmed
   correct via the Swap dish flow already exercised in item 3's history test and in the original browser QA
   (swapping Fish Pie → Lentil Soup left no stray `custom_name`).

5. **MINOR — Move didn't append at the end of the destination slot.** `PATCH /api/plan/[id]` now computes
   whether the patch changes `service_date` and/or `slot` (a "move"); if so, and the caller didn't explicitly
   supply their own `position`, it runs the same `COALESCE(MAX(position), -1) + 1` query `POST` uses,
   scoped to the *destination* date+slot, so a moved ticket always lands after whatever's already there.
   **Verified with `curl`:** created two entries in Thursday lunch (positions 0, 1), then `PATCH`ed a third
   entry (originally Friday dinner) to move into Thursday lunch with no `position` in the request body — it
   landed at `position: 2`, and `GET /api/plan?from=...&to=...` listed all three in the correct 0/1/2 order.

6. **MINOR — archived recipes were plannable.** `POST /api/plan` and `PATCH /api/plan/[id]` now check
   `fm_recipes.archived` alongside existence whenever `recipe_id` is being set (create, or a patch that sets
   a non-null `recipe_id`), rejecting with `400 "dish is 86'd"` if the recipe is archived. `/menu/[id]`'s
   `Put on the pass` button is now wrapped in `!recipe.archived &&` — an archived dish's actions row shows
   only the existing Star/Edit/Bring-it-back controls and the pre-existing `86'D` stamp below the header,
   with no dead/misleading "Put on the pass" button.
   **Verified with `curl` and live in the browser:** created a temporary recipe, archived it via
   `DELETE /api/recipes/:id`, then `POST /api/plan` with its id → `400 "dish is 86'd"`; a separate `PATCH`
   attempting to set an existing plan entry's `recipe_id` to the same archived id → the same 400. In the
   browser, `/menu/<archived id>` showed `EDIT` / `BRING IT BACK` and the `86'D` stamp with no `Put on the
   pass` button anywhere on the page. Both temporary recipes created for this test were hard-deleted
   afterwards (direct SQL — the API has no hard-delete endpoint by design, per the original slice spec).
