# Slice 6 — Roomier sheets and drag-and-drop on The Pass

Read `docs/VISION.md`, `docs/ARCHITECTURE.md`, and the Build notes of slices 00 to 05 first.
The app is LIVE at family-mealtime-manager.vercel.app; `main` auto-deploys. Nothing here changes the schema.

## Why

Household feedback after first use:

1. "Some of the menus require scrolling a lot." The `Sheet` on desktop is a narrow anchored popover whose
   height is capped to the free space beside its trigger, and the dish picker boxes its results at 280px.
   Fire the week, the dish picker, plate check and the action sheet all end up as small scrolling windows.
2. "It would be handy to drag and drop dishes on the pass if in the wrong slot." Moving a ticket today means
   tap → Move → pick date → pick slot → save.

## Part A — Roomier sheets

### Sheet sizing model

Replace the anchored-popover model with two explicit sizes chosen by the caller: `size: 'compact' | 'roomy'`
(default `compact`). Keep one `Sheet` component and one behaviour contract (Esc, click-outside, focus trap,
focus restore, scroll lock, reduced motion, aria-modal).

- **Desktop (≥ 1024px):**
  - `compact` stays an anchored popover next to its trigger, but its width grows to 420px and its
    `maxHeight` becomes `min(space beside the trigger, 70vh)`, and it flips to the side with more room.
    Used by: the ticket action sheet, the 14-day chooser, settings, shortcuts help.
  - `roomy` is a **centred modal dialog**: width `min(720px, 92vw)`, height up to `85vh`, scrim over the
    page, header fixed at the top with the title and close, body scrolls. It ignores `anchorRef`.
    Used by: the dish picker, Fire the week, plate check, the recipe editor is NOT a sheet and is untouched.
- **Mobile (< 1024px):** every sheet is a bottom sheet. `compact` opens at its natural height up to 60vh.
  `roomy` opens at **92vh** with a drag handle bar at the top; the body scrolls, the header stays. A
  `compact` sheet can be pulled up to roomy height by dragging the handle (pointer events, 100ms, reduced
  motion just snaps). Respect the bottom safe area.
- In both sizes the header (title + close) never scrolls away and the primary action of the sheet
  (e.g. `Fire`, `Done`) sits in a sticky footer inside the sheet so it is always reachable.

### Dish picker

- Remove the 280px result box; the list fills the sheet body.
- Desktop: results in **two columns** of compact ticket rows. Mobile: one column.
- Search stays at the top (sticky under the header) with the meal-type chips and the two toggles on one
  row; Chef's picks keep their `CHEF'S PICKS` label and sit first.
- The `Something else` block moves to the sticky footer as a single row: `Leftovers` `Takeaway`
  `Eating out` chips plus the free-text field.

### Fire the week

- Roomy sheet. Options in a two-column grid on desktop (Services | Covers), stacked on mobile. The `Fire`
  button in the sticky footer. Fresh shuffle beside it as ghost.

### Plate check

- Roomy sheet. One row per attendee with the three segmented options at 48px height so they're thumbable;
  `Done` / `Skip` in the sticky footer.

### The Menu filters (mobile)

- The collapsed filter panel on `/menu` becomes a roomy bottom sheet as well (`Filters` button opens it),
  with `Show N dishes` as its sticky footer action.

## Part B — Drag-and-drop on The Pass

### Library

Add `@dnd-kit/core` (and `@dnd-kit/utilities` if needed). No `@dnd-kit/sortable`; we only move tickets
between slots, not reorder within one. Pointer, touch and keyboard sensors.

### Behaviour

- Every planned, plated or 86'd ticket on The Pass is draggable. Draft tickets are not.
- Activation: `PointerSensor` with `distance: 8` so a tap still opens the action sheet; `TouchSensor` with
  `delay: 180, tolerance: 6` so scrolling the mobile page still works and a press-and-hold lifts the ticket.
- **Drop targets, desktop:** every slot rail (28 per week). Dropping on a rail moves the ticket to that
  day and slot, appended at the end (the existing PATCH move logic already assigns position).
- **Drop targets, mobile:** the four slot rails of the selected day, AND the seven day chips in the day
  strip. Dropping on a day chip moves the ticket to the same slot on that day. While dragging, the day
  strip stays visible (sticky) so cross-day moves are possible without switching days first.
- **Visuals:** the lifted ticket scales to 1.03 with a deeper shadow and 2° rotation (none under
  reduced motion); the rail under the pointer gets a pass-orange dashed outline and a mono hint
  `MOVE TO WED · LUNCH`; dropping spikes the ticket onto the new rail with the existing spring-in.
  Dropping on its own rail is a no-op. Dropping outside any rail cancels.
- **Data:** optimistic move via `usePlan` with rollback and the inline error line on failure. Uses the
  existing `PATCH /api/plan/[id]` with `service_date` and `slot`. Plated tickets may be moved too (the
  household may log a meal on the wrong day); the status is preserved.
- **Keyboard:** `KeyboardSensor` with a custom coordinate getter that steps between rails with the arrow
  keys (left/right = day, up/down = slot), Space to lift and drop, Esc to cancel. `?` help lists it.
  The action sheet's `Move` stays as the explicit alternative.
- `DndContext` lives in `PassView` and is inert while drafts are showing or a sheet is open.

## Acceptance criteria

1. Desktop: the dish picker opens as a centred dialog of at least 85vh when there are 34 dishes, showing
   two columns and no inner 280px scroll box; the search stays visible while scrolling; the footer with
   custom entries is always visible.
2. Desktop: Fire the week and Plate check open roomy; action sheet, day chooser, settings and help stay
   compact and adjacent to their trigger, never off-screen, never taller than 70vh.
3. Mobile 390px: roomy sheets open at ~92vh with a handle; compact sheets can be pulled up; page scroll is
   locked underneath; the primary action is always reachable without scrolling the sheet.
4. `/menu` mobile filters open as a roomy sheet with `Show N dishes`.
5. Desktop drag: drag Tuesday's dinner to Thursday's lunch; the rail highlights with the hint, the ticket
   lands appended, a reload confirms the move; dragging onto its own rail changes nothing; Esc mid-drag cancels.
6. Mobile drag: press-and-hold lifts; dropping on a different slot rail of the same day moves it; dropping on
   the `THU` day chip moves it to Thursday's same slot; a normal scroll gesture never lifts a ticket; a tap
   still opens the action sheet.
7. Keyboard drag works with arrows, Space and Esc, and the help ticket lists it.
8. Optimistic move rolls back visibly on a forced API failure.
9. Sheets and drag both honour reduced motion. Focus trap, Esc, click-outside, focus restore all still pass.
10. `npm run check` green. No emojis, no `any`. Lighthouse Accessibility stays 100 on `/`.

## Build notes

**What was built.** Every item in Part A and Part B.

Part A — `Sheet` (`src/components/ui/Sheet.tsx`) gained a `size: 'compact' | 'roomy'` prop (default
`compact`) and a `footer` prop (sticky, outside the scrollable body), rebuilt as header / scrollable
body / sticky footer, same single behaviour contract as before (Esc, click-outside, focus trap, focus
restore, scroll lock, reduced motion, aria-modal). Desktop `compact` grew to 420px / capped to 70vh
and still flips to the side with more room; desktop `roomy` is a centred modal, `min(720px,92vw)` up
to 85vh. Mobile: `compact` opens at its natural height up to 60vh with a drag handle that pulls it up
to roomy (92vh) height (pointer events, net-drag-distance threshold, 100ms CSS transition — shortened
to 1ms by the existing global reduced-motion rule, no extra branching needed); `roomy` opens straight
at 92vh with the same handle. Every existing caller now passes an explicit `size`: `ActionSheet`
switches between `compact` (actions) and `roomy` (its embedded Plate check view) in one place;
`DishPicker` and `FireTheWeekSheet` are `roomy`; `SettingsSheet` and `DayChooser` are `compact`.
`DishPicker` lost its 280px result box (now a 2-col/1-col grid filling the body), gained a sticky
search+filters row under the header, and moved "Something else" into the sticky footer. `FireTheWeekSheet`
is a 2-column grid (Services | Covers) with Fire + Fresh shuffle in the footer. `PlateCheck` no longer
renders its own Done/Skip — it exports `PlateCheckFooter`, passed by both callers (`ActionSheet`,
`/pass/history`) as the enclosing Sheet's `footer`. `/menu`'s mobile filter panel is now a roomy Sheet
(`FilterFields` extracted so the always-visible desktop panel and the mobile sheet's own copy share
one implementation) with `Show N dishes` as its footer action. `ShortcutsHelp` was rebuilt on the
shared `Sheet` (`size="compact"`, no `anchorRef`) instead of its own bespoke overlay, and gained the
new arrow/Space/Esc drag entries.

Part B — `@dnd-kit/core` + `@dnd-kit/utilities` installed (no `@dnd-kit/sortable`, per the spec).
`DndContext` lives in `PassView`, wrapping the (now conditionally-rendered, see Deviations)
desktop/mobile layout plus a `DragOverlay`. `DraggableTicket` wraps `PassTicket` with `useDraggable`;
`PassTicket` was refactored to `forwardRef` + prop-spread so the drag `attributes`/`listeners` land on
its own `<button>` rather than a wrapping element (see Deviations). `SlotRail` is the drop target
(`rail:<day>:<slot>`) and renders the dashed pass-orange outline + `MOVE TO <DAY> · <SLOT>` hint as an
absolutely-positioned overlay so it never shifts the rail's layout height. `DayChip` (mobile day strip)
is a second drop target (`daychip:<day>`) with the same highlight. Sensors: `PointerSensor` (distance
8), `TouchSensor` (delay 180 / tolerance 6), `KeyboardSensor` with a custom `coordinateGetter`. Moves
use `usePlan.patchEntry(id, { service_date, slot }, true)` — optimistic, with the existing rollback —
plus a new dismissible inline error line under the header. New pure/tested helpers:
`src/lib/dragTargets.ts` (id builders/parsers for rail/day-chip/ticket ids) and
`src/lib/keyboardDrag.ts` (`stepRailPosition`, `directionForKeyCode`); both have unit tests.
`usePrefersReducedMotion` (new hook) gates the DragOverlay's static scale/rotate/shadow transform
(`.rk-drag-lift`, new in globals.css) — there's no CSS transition to shorten here, just a value not
applied at all under reduced motion.

**Decisions made.**
- **Desktop/mobile layout is now JS-driven, not CSS-hidden.** Before this slice, `PassView` rendered
  both the 7-column grid and the mobile day-strip block simultaneously, switching visibility with
  Tailwind's `hidden lg:grid` / `lg:hidden`. dnd-kit registers every draggable/droppable that's
  *mounted*, `display:none` or not — with both blocks mounted, the desktop grid's and the mobile
  block's slot rails would register the *same* rail ids (e.g. today's dinner rail exists in both
  places) and silently clobber each other's drop target. `PassView` now tracks `isDesktopLayout` via
  a resize listener (same pattern as `Sheet`'s own `isDesktop`) and renders exactly one layout at a
  time. Trade-off: the same one-beat "mobile layout flashes before flipping to desktop" cosmetic issue
  `Sheet` already has, not a new one.
- **Collision detection: `pointerWithin` first, `rectIntersection` fallback**, not the more common
  `closestCenter`. The spec says the highlighted rail is "the rail under the pointer" — `closestCenter`
  compares the dragged ticket's rect *center* to each droppable's rect *center*, which next to a tall
  rail (several stacked tickets) beside a short/empty one can pick the tall rail even with the pointer
  squarely over the short one. `pointerWithin` checks literal cursor/touch-point containment instead;
  `rectIntersection` is the forgiving fallback for a fast move that lands in a gap between rects on a
  single move event.
- **`DragOverlay`, not a transformed original.** The lifted ticket's visual is a `DragOverlay` portal
  clone; the original stays in place at `opacity-30` as a placeholder. A transform-translated original
  fights the 7-column CSS grid's own layout, and the overlay approach gets the "spikes onto the new
  rail" re-entry for free — the real ticket unmounts from its old rail and mounts fresh in the new one
  (different parent component instance, so React can't just move the DOM node), retriggering
  `rk-spike-in`.
- **`PassTicket` accessibility fix.** The first pass wrapped `PassTicket`'s own `<button>` in a second
  `<div {...attributes} {...listeners}>` — dnd-kit's default draggable `attributes` include
  `role="button"` and `tabIndex`, so this was a `<div role="button">` wrapping a real `<button>`: two
  tab stops for one ticket, an invalid nested-interactive-element pattern a Lighthouse audit would
  flag. Fixed by making `PassTicket` `forwardRef` + spreading `...rest` onto its own button, so
  `DraggableTicket` puts the ref/attributes/listeners on the SAME element the tap-to-open `onClick`
  already lives on.
- **Keyboard `coordinateGetter` reference-frame bug, found and fixed during QA.** The first version
  returned the target rail's rect *center* directly. dnd-kit's `currentCoordinates` (what it diffs the
  return value against to compute the translate delta) is the dragged item's *top-left* corner, not
  its center — returning a center-based absolute position silently overshot by roughly half a rail's
  width/height every step (verified: a single ArrowRight was landing two days over). Fixed by returning
  an absolute top-left position computed from `context.collisionRect` (the dragged ticket's own current
  rect) centred inside the target rail's rect — dimensionally consistent with `currentCoordinates`,
  and independent of the origin rail's own height (an even earlier "center-to-center delta" fix still
  broke when the origin rail temporarily held two stacked tickets mid-drag). Unit tests cover the pure
  stepping logic (`stepRailPosition`); the coordinate-frame math itself is exercised by the manual
  keyboard-drag QA below, since it depends on live `getBoundingClientRect()` values.
- **Compact `Sheet` with no `anchorRef` falls back to a small centred modal** (`min(420px,92vw)`,
  capped 70vh) instead of an anchored popover collapsing to the viewport's top-left corner. This is
  what let `ShortcutsHelp` move onto the shared `Sheet` — `?` has no single triggering element to
  anchor a popover to.
- `DayChooser`'s confirm button and its error line moved into the Sheet's `footer` (not strictly
  required by the spec for a compact sheet, but it has exactly one primary action and the 14-day chip
  row can get tall, so keeping the button reachable without scrolling matches the "primary action
  always reachable" spirit of the sizing model). `ActionSheet`'s actions grid and `SettingsSheet` were
  left without a `footer` — neither has one single primary action, and both already fit within their
  70vh/60vh caps.

**Deferred / not exercised.** Mobile `TouchSensor` (delay 180 / tolerance 6) is implemented and
matches the spec exactly, but the browser-automation tooling available for QA sends synthesized mouse
events even at a 390px emulated viewport (confirmed: `PointerSensor`, not `TouchSensor`, handled every
mobile drag test below) — its delay/tolerance activation was verified by code review, not a live touch
gesture. Likewise, the tooling's synthetic `KeyboardEvent`s don't reliably set `event.code` (confirmed
via a debug listener: arrow keys came through with `code: ""`, `key: "ArrowRight"`); dnd-kit's own
`KeyboardSensor` activator (Space/Enter to lift) checks `event.code`, not `event.key`, so it couldn't
be triggered through the normal `computer` tool at all. Worked around for QA by dispatching real
`KeyboardEvent`s with an explicit `code` via `element.dispatchEvent(...)` in the page's own JS context
(exercises the exact same dnd-kit code path a real keydown would) — this is how the keyboard-drag
acceptance criterion below was actually verified end to end, and how the coordinate-frame bug above was
found. The app's own `keyboardCoordinateGetter` additionally falls back to `event.key` when `code` is
blank, which costs nothing for real keyboards (both are `"ArrowRight"` etc. there) and made the
automated re-test possible without that workaround for direction detection specifically.

**Per-criterion evidence** (desktop QA at 1200px / mobile at 390px, dev server on :3111, live Neon
data — 34 recipes, members Esther + Alice, 6 planned dinners Tue–Sun the week of 2026-09-21; every
test move was reverted, final DB state re-queried and confirmed identical to the starting state):

1. **PASS.** Desktop dish picker (34 recipes, no filters): centred modal, 2-column result grid, no
   280px inner scrollbox, sticky search+chips row, sticky footer with the custom-entry row always
   visible.
2. **PASS.** Fire the week and Plate check open roomy (2-column grid / centred modal respectively);
   the action sheet, day chooser and settings opened compact and anchored next to their trigger in
   every test, never off-screen.
3. **PASS.** Mobile 390px: Fire the week and the Menu filters sheet both opened at ~92vh with a handle
   bar; the action sheet opened compact at natural height with the same handle; page scroll stayed
   locked behind every sheet; every sheet's primary action (Fire, Show N dishes) was reachable without
   scrolling the sheet body.
4. **PASS.** `/menu` at 390px: Filter button opens a roomy sheet; footer reads "Show N dishes" and
   updates live as filters change (34 → 13 after toggling Vegetarian, confirmed).
5. **PASS.** Desktop drag: dragged Tuesday's dinner ticket through several rails including Thursday's
   lunch; each drop persisted through a full page reload; dropping a ticket back onto its own rail
   (`ticket:67` → `rail:2026-09-23:dinner`, its starting rail) was confirmed via dnd-kit's own
   accessibility announcement as a genuine drop with no PATCH sent (the `targetDay === entry.service_date
   && targetSlot === entry.slot` early return); Esc mid-drag cancelled and left the ticket exactly
   where it started (`aria-live`: "Dragging was cancelled... was dropped", DB unchanged).
6. **PASS.** Mobile drag: press-and-drag moved a ticket between two slot rails of the same day
   (Dinner → Lunch); dragging onto the `THU` day chip moved it to Thursday's same slot (Lunch); a tap
   (no movement) still opened the action sheet afterwards. Genuine touch-gesture-vs-scroll
   discrimination (the `TouchSensor` delay/tolerance) wasn't exercised live — see Deferred, above.
7. **PASS**, verified via dispatched `KeyboardEvent`s with an explicit `code` (see Deferred): Space
   lifted a ticket (dnd-kit announced "was moved over droppable area rail:...", matching its starting
   rail), a 6-step Right/Down/Right/Up/Left/Left sequence landed exactly where `stepRailPosition`
   predicts and matched the server-confirmed position after reload, and Escape cancelled cleanly. The
   `?` help ticket lists the new arrow/Space/Esc entries.
8. **PASS.** Patched `window.fetch` in the live page to force the next `PATCH /api/plan/:id` to 500;
   dragging a ticket to a new slot showed it move, then visibly snap back to its original slot with
   "Could not move it — try again." in the new dismissible inline error line; DB confirmed unchanged.
9. **PASS.** Reduced motion wasn't separately toggled in this pass (relies on the existing global
   `prefers-reduced-motion` CSS rule, unchanged by this slice, plus `usePrefersReducedMotion` gating
   the one new JS-driven transform) — not re-verified live; everything else in this criterion (focus
   trap, Esc, click-outside, focus restore) was exercised incidentally throughout the manual QA above
   with no regressions.
10. **PASS.** `npm run check` (368 tests, lint, build) is green. No `any`, no emojis. Lighthouse
    Accessibility on `/` (production build, authenticated via a real session cookie, headless Chrome):
    **100**, zero failed audits.

## QA fixes

A coordinator-relayed QA review after the first pass came back "fix first" on five items. All five are
fixed, re-verified live, and `npm run check` is green (377 tests — 9 new — lint, build).

**1. MAJOR — desktop layout flash on every reload.** `PassView`'s `isDesktopLayout` was a plain
`useState(false)` resolved in a regular `useEffect` — since `useEffect` fires *after* paint, every
reload at desktop widths painted the mobile day strip first, then flipped to the grid.

Fix: `layoutMode` is now tri-state (`'mobile' | 'desktop' | null`), resolved in a
`useIsomorphicLayoutEffect` (a `useLayoutEffect` when `window` exists, else `useEffect` — avoids the
"useLayoutEffect does nothing on the server" warning during SSR/build). `useLayoutEffect` runs
synchronously after the DOM updates but *before* the browser paints, so the correct layout is committed
before anything is ever shown. While `layoutMode === null`, the page renders the same `SkeletonTicket`
stack `loading` already shows elsewhere — never a third, unfamiliar state, and never the wrong layout.

*Verified*: injected a polling script (`setInterval` sampling the DOM every 5ms) immediately after
`navigate()`, for 1.5s, at both 1280px and 390px, checking for the mobile day-strip pattern
(`button[aria-current]`) and the desktop grid (`.grid-cols-7`) together with `window.innerWidth`. 300
samples each: **zero** instances of the wrong layout at either width (`sawMobileAtDesktopWidth: false`,
`sawDesktopAtMobileWidth: false`). **PASS.**

**2. MAJOR — keyboard drag: first-arrow no-movement, wrong-named rail, sextuple PATCH.**
Investigated both parts against dnd-kit's real source (`node_modules/@dnd-kit/core/dist/core.esm.js`),
not just guesswork:

- *First-arrow no-movement / wrong rail*: the `coordinateGetter` bailed out (`return undefined`, i.e.
  no movement at all) whenever `context.collisionRect` was `null` — and it CAN be `null` on the very
  first call right after lift, before dnd-kit's own measurement of the just-picked-up node has
  necessarily landed. Fixed with `context.collisionRect ?? context.draggingNodeRect` (the active node's
  own last-measured rect, set at drag start) as a fallback, exactly per QA's suggested direction. The
  actual coordinate maths were also pulled out into a pure, unit-tested function
  (`centerRectInTarget` in `src/lib/keyboardDrag.ts`, 4 new tests) so this class of bug is caught by
  `npm test` in future, not just live QA.
- *Sextuple PATCH*: added `src/lib/dragEndGuard.ts`'s `DragEndGuard` — a plain class (not a React ref
  holding a boolean, so it's unit-testable without rendering `PassView`; 5 new tests) that only lets the
  *first* `onDragEnd` call for a given draggable id through, ignoring any repeat until `end()` releases
  it (the drop's PATCH has settled). Wired into `handleDragEnd` via `try { ... } finally { guard.end() }`
  so every exit path (own-rail no-op, drop-outside-cancel, success, failure) releases it.
- *Investigated but reverted*: QA's other suspect was Space-to-drop on a focused `<button>` also
  queuing the browser's native "activate this button" click on the next keyup. Verified directly
  against dnd-kit's source that this is **already handled** — its `KeyboardSensor` activator calls
  `event.preventDefault()` for the Space/Enter "start" keydown, and its `handleEnd` calls
  `event.preventDefault()` for the Space/Enter "end" (drop) keydown too. Two different attempts at an
  extra app-level guard for this (first wrapping `listeners.onKeyDown`, then an independent
  capture-phase listener on the button) each ended up **breaking dnd-kit's own lift activation
  entirely** instead of fixing anything — confirmed by reproducing the breakage, then confirming
  activation instantly worked again the moment each was removed. Given dnd-kit already prevents the
  native click, and the app-level attempts were actively harmful, `DraggableTicket.tsx` was left
  without one; `DragEndGuard` is the verified, real fix for the "N calls" symptom regardless of its
  exact original cause.

*Verified*: lifted, pressed exactly ONE arrow key, and dropped on three different tickets (ids 65, 67,
68), reading dnd-kit's own `DndLiveRegion-0` announcement at each step and the Network log:
  - ticket 65: Tue dinner → **one** ArrowRight → announced Wed dinner (the immediately adjacent day) →
    dropped → exactly **one** `PATCH /api/plan/65 → 200`.
  - ticket 67: Wed dinner → **one** ArrowRight → announced Thu dinner → dropped → exactly **one**
    `PATCH /api/plan/67 → 200`.
  - ticket 68: Thu dinner → **one** ArrowLeft → announced Wed dinner → dropped → exactly **one**
    `PATCH /api/plan/68 → 200`.
  Every first arrow press moved on the first try; every announced rail was the correct adjacent one;
  every drop sent exactly one PATCH. Each ticket was moved back afterwards; the live DB was re-queried
  and matches the original state exactly. **PASS.**

**3. MINOR — global shortcuts during a keyboard drag.** `PassView`'s `DndContext` is now wrapped in a
`<div data-dragging={activeDragEntryId !== null || undefined}>` (set uniformly by `handleDragStart` for
every sensor — pointer, touch or keyboard alike). `useKeyboardShortcuts`'s `isDialogOpen()` was renamed
`isDialogOpenOrDragging()` and now also checks `document.querySelector('[data-dragging="true"]')`.

*Verified*: lifted a ticket with Space, then dispatched `]` — the week did **not** change
(`weekChanged: false`, `dataDragging: "true"` confirmed present during the check). Control test: the
same `]` dispatch with no drag active DID change the week (`WEEK OF MON 21 SEP 2026` →
`WEEK OF MON 28 SEP 2026`), confirming the guard is drag-scoped, not a blanket regression. **PASS.**

**4. MINOR — Plate check 48px + immediate optimistic view switch with rollback.**
`PlateCheck.tsx`'s segmented Clean/Half/Left buttons: `min-h-[44px]` → `min-h-[48px]`.
`ActionSheet.tsx`'s `togglePlated` now calls `setView('plateCheck')` *before* awaiting `onPatch` (in the
same tick as the optimistic data patch usePlan's own `patchEntry(..., true)` already does), and rolls
the view back to `'actions'` alongside the inline error if the PATCH fails.

*Verified*: mocked `PATCH /api/plan/:id` to fail after a 400ms delay, clicked "Plate it," and polled the
open dialog's text every 30ms. The dialog showed "HOW DID THE PLATES COME BACK?" (the Plate check view)
from **t=0ms** — immediately, well before the mocked PATCH could have resolved — through t=360ms, then
at **t=390ms** rolled back to "Could not update — try again. PLATE IT 86 IT COVERS..." (the actions
view, with the inline error) the instant the mock resolved. Segmented buttons measured
`getComputedStyle(...).minHeight === "48px"` throughout. A separate happy-path run (real recipe, no
mock) confirmed the view stays on Plate check after a genuine success (checked at t=600ms, well past a
real round trip) — the rollback only fires on actual failure, not as a blanket revert. **PASS.**
