# Slice 1 — The Menu: recipes, ingredients, allergen intelligence

Read `docs/VISION.md`, `docs/ARCHITECTURE.md` and `docs/slices/00-foundation.md` (including its Build notes)
first. Slice 0 is in place: auth, design system (`src/components/ui`), AppShell, The Table, migrations.

## Goal

Replace "a list of meal names" with a real recipe library. Every dish knows its ingredients, and the
kitchen derives allergens and diet conflicts from those ingredients rather than trusting a label.
The Menu must feel like a chef's book of menu cards, and it must tell you at a glance which dishes are
unsafe for someone at The Table.

## Schema (`db/migrations/002_menu.sql`)

```sql
create table fm_recipes (
  id serial primary key,
  name text not null,
  description text not null default '',
  meal_types jsonb not null default '["dinner"]',   -- subset of breakfast|lunch|dinner|snack
  tags jsonb not null default '[]',                  -- see TAGS below
  servings integer not null default 4,
  prep_minutes integer not null default 0,
  cook_minutes integer not null default 0,
  method jsonb not null default '[]',                -- array of step strings
  source_url text,
  favourite boolean not null default false,
  archived boolean not null default false,
  seeded boolean not null default false,             -- provenance only; seeded recipes are fully editable
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table fm_recipe_ingredients (
  id serial primary key,
  recipe_id integer not null references fm_recipes(id) on delete cascade,
  position integer not null default 0,
  name text not null,
  quantity numeric,                                  -- null = "to taste" / unspecified
  unit text,                                         -- see UNITS
  aisle text not null default 'pantry',              -- see AISLES
  allergens jsonb not null default '[]',
  optional boolean not null default false,
  note text                                          -- "finely chopped", "or oat milk"
);
create index fm_recipe_ingredients_recipe_idx on fm_recipe_ingredients(recipe_id, position);
```

Vocabularies (export from `src/lib/vocab.ts`, single source of truth for UI and validation):

- `MEAL_TYPES`: breakfast, lunch, dinner, snack
- `TAGS`: kid-friendly, quick, healthy, comfort, vegetarian, vegan, gluten-free, dairy-free, pescatarian,
  slow-cook, one-pan, batch-cook, freezer-friendly, bbq, sunday
- `UNITS`: g, kg, ml, l, tsp, tbsp, cup, pcs, clove, slice, can, pack, pinch, handful
- `AISLES`: produce, meat-fish, dairy-eggs, bakery, pantry, frozen, spices, drinks, household
- `ALLERGENS`: nuts, peanuts, dairy, eggs, gluten, soy, fish, shellfish, sesame (same list as The Table)

## Logic (`src/lib/`, all unit tested)

- `allergens.ts`: `inferAllergens(ingredientName)` and `inferAisle(ingredientName)` from keyword tables
  (flour/bread/pasta/noodles/couscous/naan/soy sauce → gluten; milk/cheese/butter/cream/yogurt/parmesan → dairy;
  egg → eggs; peanut → peanuts; almond/cashew/walnut/pecan/hazelnut/nut → nuts; soy/tofu/edamame → soy;
  salmon/tuna/cod/haddock/fish → fish; prawn/shrimp/crab/mussel → shellfish; tahini/sesame → sesame; and
  sensible aisle keywords). Case-insensitive, word-boundary aware so "nutmeg" is not nuts and "eggplant" is
  not eggs. These are *suggestions* the user can override per ingredient.
- `recipes.ts`:
  - `deriveAllergens(ingredients)` → union of allergens on non-optional ingredients.
  - `tagConflicts(tags, ingredients)` → list of human strings, e.g. "Tagged vegetarian but contains chicken thighs
    (meat-fish aisle)", "Tagged gluten-free but flour carries gluten", "Tagged dairy-free but butter carries dairy",
    "Tagged vegan but contains eggs".
  - `scaleQuantity(qty, unit, fromServings, toServings)` → scaled number with kitchen-sensible rounding
    (whole numbers for pcs/clove/slice/can/pack; 0.25 steps for tsp/tbsp/cup; 5g/5ml steps under 100, 10 above).
  - `formatQuantity(qty, unit)` → "½ tsp", "1.5 kg", "2 pcs" style strings (use vulgar fractions for ¼ ½ ¾).
- `engine/compat.ts`: `compatibility(recipe, members)` → `{ safe: boolean, conflicts: { memberId, memberName,
  reason }[] }`. A conflict is: a member allergy present in derived allergens; member restriction
  vegetarian and recipe lacks vegetarian or vegan tag; vegan and recipe lacks vegan; gluten-free and derived
  allergens include gluten; dairy-free and derived includes dairy; pescatarian and recipe has a meat-fish
  ingredient that is not fish/shellfish-tagged. Halal/kosher: conflict only if an ingredient name contains
  pork/bacon/ham/gammon/sausage/lard (halal and kosher) or shellfish (kosher). Document this in a comment; it
  is deliberately conservative.

## Seed data

- `db/seed/recipes.json`: every meal in `docs/seed/meal-ideas.json` turned into a full recipe: real UK
  ingredient lists with quantities and units for 4 servings, aisle and allergens set, 4 to 8 method steps
  written like a competent home cook, honest prep/cook minutes, meal types and tags mapped from the old tags.
  Use UK words (mince, courgette, coriander, aubergine, spring onion, plain flour). Keep it accurate:
  a "gluten-free" tagged recipe must have no gluten ingredient, and so on. Run `tagConflicts` over the seed
  in a test to prove it.
- `scripts/seed.mjs`: inserts recipes from the JSON where no recipe with that name exists (idempotent).
  `npm run seed`. Run it for real against Neon.

## API

- `GET /api/recipes?q=&mealType=&tag=&archived=1` → list. Each item includes derived `allergens`,
  `ingredientCount`, `totalMinutes`, and `compat` (from `compatibility()` against current members).
- `POST /api/recipes` body `{ ...recipe fields, ingredients: [...] }` → creates both (use `sql.transaction`).
- `GET /api/recipes/[id]` → recipe with `ingredients`, derived `allergens`, `compat`.
- `PATCH /api/recipes/[id]` → partial recipe update; if `ingredients` present, replace the full set.
  Bumps `updated_at`.
- `DELETE /api/recipes/[id]` → soft delete (`archived = true`), `204`. Query `?hard=1` is not supported.
- All validated with zod against the vocab lists. Unknown tag/unit/aisle/allergen → 400.

## Screens

### `/menu` — The Menu

- `PageHeader` kicker: `42 DISHES · 6 FAVOURITES · 3 86'D` (live counts), title `THE MENU`, action `New dish`.
- Controls row: search `Field` (name and ingredient names, debounced, client-side filter over the loaded list),
  meal-type chips, tag chips (multi), a `Safe for everyone` toggle that hides any dish with `compat.safe === false`,
  a `Favourites` toggle, sort (A–Z, newest, quickest). On mobile the controls collapse behind a "Filter" button
  with a count badge.
- Grid of `Ticket`s (1 col mobile, 2 tablet, 3 desktop). Each: mono header `DINNER · 35 MIN · SERVES 4`,
  name in display font, one-line description, allergen chips (red outlined), up to 3 tag chips, favourite
  toggle (lucide `Star`, filled when on, optimistic), and if unsafe a red `Stamp` reading `NOT FOR <NAME>`
  (first name; `+2` if more). Archived dishes (only when shown) get an `86'D` stamp and reduced opacity.
- Empty states: no recipes → `THE MENU IS BLANK`, action New dish. No matches → `NOTHING ON THE MENU`, action
  Clear filters.

### `/menu/[id]` — Menu card

- Display name, mono meta (`DINNER · PREP 10 · COOK 25 · SERVES 4`), description, tag chips, allergen chips.
- If unsafe for anyone: a `warning` Ticket at the top listing each conflict in plain words.
- Two tickets side by side on desktop, stacked on mobile: **Ingredients** with a servings stepper
  (`−` / `4` / `+`, mono) that rescales every quantity live using `scaleQuantity`, optional ingredients
  marked "(optional)", notes in ink-soft; **Method** with numbered steps in mono numerals.
- Actions: Favourite toggle, Edit, and `86 it` (archive, inline confirm) or `Bring it back` if archived.

### `/menu/new` and `/menu/[id]/edit` — the editor

- One long Ticket form. Sections: Dish (name, description, meal types multi-chip, tags multi-chip),
  Numbers (servings, prep, cook; mono fields), Ingredients, Method, Source URL.
- Ingredient rows: name (on blur, auto-fill aisle and allergen suggestions if the user hasn't set them),
  quantity (mono, blank allowed), unit select, aisle select, allergen chips (toggleable), optional toggle,
  note. Add row, remove row, move up/down. Enter in the name field adds a new row.
- Method: one textarea per step, add/remove/move. Paste of multi-line text into an empty step splits into steps.
- Live **kitchen check** ticket (`warning` variant) under the form listing `tagConflicts()` output; it does not
  block save but it is impossible to miss.
- Save → detail page. Cancel → back.

### Home (`/`) touch-up

- When members exist and at least one recipe exists, the empty state copy becomes
  "The pass is empty. Nothing is fired for tonight." with action `Open the menu`. Keep the other states.

## Acceptance criteria

1. `npm run migrate` and `npm run seed` succeed against Neon; a second run of each changes nothing.
2. All 32 seeded recipes have ingredients with quantities, aisles, allergens and a method; a unit test
   proves zero `tagConflicts` across the seed.
3. `inferAllergens`, `inferAisle`, `deriveAllergens`, `tagConflicts`, `scaleQuantity`, `formatQuantity`
   and `compatibility` have unit tests covering the cases named above (including nutmeg / eggplant).
4. With a member whose allergy is `fish`, `/menu` shows `NOT FOR <NAME>` on Fish Pie and Salmon dishes and the
   `Safe for everyone` toggle hides them; the detail page shows the warning ticket with the reason.
5. Creating a dish with "plain flour" auto-suggests gluten and aisle bakery/pantry; tagging it gluten-free
   shows a kitchen-check warning; saving and reopening shows the same ingredients in order.
6. Servings stepper rescales quantities with sensible rounding (e.g. 1 tsp at 4 → ½ tsp at 2, 3 pcs at 4 → 5 pcs at 6).
7. Archive hides the dish from the default list; "show 86'd" reveals it with the stamp; bring back restores it.
8. Works at 390px and 1200px, dark and light. `npm test`, `npm run lint`, `npm run build` green.
9. No emojis, no `any`, no `family_code`.

## Build notes

**What was built.** Every item in Scope: migration `db/migrations/002_menu.sql` (`fm_recipes`,
`fm_recipe_ingredients`, applied for real against the shared Neon database, idempotent on a second
`npm run migrate`); `src/lib/vocab.ts` (single source of truth for `MEAL_TYPES`/`TAGS`/`UNITS`/`AISLES`,
and `ALLERGENS`/`RESTRICTIONS` re-exported from `src/lib/members-schema.ts` so The Menu and The Table can
never drift apart on those two lists); `src/lib/allergens.ts` (`inferAllergens`/`inferAisle`, word-boundary
keyword matching, with explicit negative-lookbehind exceptions for plant milks — coconut/oat/almond/soy/
rice/cashew/hazelnut milk — and nut/fruit butters, so "nutmeg", "eggplant", "coconut milk" and "peanut
butter" all infer correctly); `src/lib/recipes.ts` (`deriveAllergens`, `tagConflicts`, `scaleQuantity`,
`formatQuantity`); `src/lib/engine/compat.ts` (`compatibility()`, with the halal/kosher pork-family check
implemented exactly as specified — conservative, name-based, documented in a comment); seed data
(`db/seed/recipes.json`, 32 full UK recipes hand-written from `docs/seed/meal-ideas.json`, honest
ingredient lists with quantities/units/aisles/allergens and 4-6 method steps each) and `scripts/seed.mjs`
(idempotent insert-by-name, run for real — see Acceptance criteria below); the API
(`GET/POST /api/recipes`, `GET/PATCH/DELETE /api/recipes/[id]`, all zod-validated against `vocab.ts`,
compat computed against live `fm_members`); `src/hooks/useRecipes.ts`; `/menu`, `/menu/[id]`, `/menu/new`,
`/menu/[id]/edit`; the home (`/`) touch-up; and both carry-over fixes from the Slice 0 review.

**Carry-over fixes.**
1. `src/components/members/MemberCard.tsx` now prints a small mono label (`LIKES`/`DISLIKES`/
   `RESTRICTIONS`/`ALLERGIES`) above each chip group. Dislike chips get a new `Chip` variant (`dislike`):
   ink-soft/steel-outlined with a small lucide `Ban` icon, visually distinct from the plain "likes" chip and
   from the outlined "restrictions" chip. Allergy chips are unchanged (red, `AlertTriangle`).
2. Added `src/components/ui/ChipToggle.tsx`: every toggleable chip in the app (member preset chips, recipe
   meal-type/tag/allergen chips, the ingredient-row allergen toggles, the `/menu` filter chips) is now built
   on this one component, which always sets an explicit `aria-label` (the chip's own visible text) and
   `aria-pressed`, rather than relying on inferred text content. `src/components/members/TagEditor.tsx` was
   refactored to use it. Verified live in the browser: read every preset-chip button's `aria-label`/
   `aria-pressed` via the DOM on both the member form and the recipe editor — every one carries its own text
   as an explicit label and a correct pressed state.

**Decisions and deviations.**
- **Ingredient inserts on `POST`/`PATCH` use a two-statement pattern, not a single `sql.transaction`.** The
  neon HTTP driver's `sql.transaction()` takes an eagerly-built array of queries — a later query can't read
  an earlier one's `RETURNING` value within the same call. So `POST` inserts the recipe row first (to get
  its id), then inserts every ingredient row together in one real `sql.transaction`; if that second step
  fails, the orphaned recipe row is deleted to avoid leaving a dish with no ingredients on the menu. `PATCH`
  doesn't have this problem (the id is already known from the URL) and its scalar-field update plus
  ingredient replace (`DELETE` + re-`INSERT`) run together in one genuine transaction. `scripts/seed.mjs`
  follows the same two-step pattern for the same reason.
- **`GET /api/recipes` fetches the whole table and filters/searches server-side in JS**, rather than
  building a dynamic parameterised `WHERE` clause for `q`/`mealType`/`tag`/`archived`. The household's menu
  is a few dozen recipes; one unfiltered query (recipe + `json_agg`'d ingredients) plus in-memory filtering
  is simpler and just as fast as a dynamic query builder would be, and it reuses the exact same code path
  `fetchRecipeByIdWithCompat` uses for a single recipe. The `/menu` screen's own search/filter/sort is fully
  client-side per the spec anyway (debounced over the already-loaded list), so the API's query params exist
  mainly for curl/future use, not because the UI depends on server-side filtering.
- **`PATCH` builds its `SET` clause from only the fields actually present in the body** (checking
  `!== undefined`), rather than the `COALESCE(${value ?? null}, column)` pattern `fm_members` uses. That
  pattern can't distinguish "field omitted" from "field explicitly set to `false`" for the new boolean
  fields (`favourite`, `archived`) — a `COALESCE` would silently ignore `{ "favourite": false }`. `updated_at
  = now()` is always included in the `SET` clause, even when only `ingredients` changed and no scalar field
  did.
- **`tagConflicts` includes a pescatarian rule** (flags a `pescatarian`-tagged recipe containing a
  non-seafood meat-fish-aisle ingredient) beyond the four rules named in this spec's Logic section. It isn't
  required by any acceptance criterion, but it mirrors `compatibility()`'s own pescatarian rule exactly, and
  costs nothing extra once that logic already exists — kept for internal consistency rather than leaving one
  engine pescatarian-aware and the other not.
- **Kitchen-check conflict messages name the specific ingredient** for `gluten-free`/`dairy-free`/
  `vegetarian`/`vegan`-against-meat, one message per offending ingredient (deduplicated by name), matching
  the wording style in this doc's examples (`"Tagged gluten-free but plain flour carries gluten"`). Vegan-
  against-dairy/eggs stays generic (`"Tagged vegan but contains dairy"`) since there's often more than one
  dairy ingredient and naming just one would be misleading.
- **Optional ingredients are excluded from both `deriveAllergens` and `tagConflicts`**, exactly as specified
  ("union of allergens on non-optional ingredients"). This has a real, deliberate consequence used in the
  seed data: Jacket Potatoes lists optional tuna and is tagged `vegetarian`/`gluten-free` with no conflict,
  because the dish is genuinely fine without it; a member with a fish allergy sees it as safe. Fish Pie and
  Salmon & New Potatoes use *non-optional* fish, so they correctly show `NOT FOR ADA` — see Acceptance
  criteria below.
- **`scaleQuantity` never rounds a positive quantity down to zero** — if the rounded result would be `0`
  (e.g. 1 pcs scaled down to an eighth), it clamps to the smallest sensible non-zero step for that unit
  bucket instead, since "0 pcs of an ingredient the recipe still lists" isn't a meaningful kitchen
  instruction.
- **`formatQuantity` uses vulgar fractions (¼ ½ ¾) only for the quarter-step units** (tsp/tbsp/cup) and a
  plain trimmed decimal for everything else, matching the three examples in this doc exactly (`"½ tsp"`,
  `"1.5 kg"`, `"2 pcs"`) — the rule follows directly from which units round to quarters vs. decimals in
  `scaleQuantity`, not a separate per-value choice.
- **Ingredient auto-suggestion in the editor is "touch"-tracked per row, per field.** Blurring the name
  field only overwrites aisle/allergen suggestions the user hasn't explicitly touched yet (a manual aisle
  change or allergen chip toggle marks that field "touched" and the auto-fill stops overwriting it for that
  row). Ingredients loaded from an existing recipe (edit mode) start already "touched" on both fields, so
  editing an existing dish's ingredient name never silently changes a deliberately-set aisle or allergen.
- **The editor's paste-to-split-steps behaviour only fires into an empty step** with a genuinely multi-line
  clipboard payload — pasting into a step that already has text, or pasting a single line, behaves like a
  normal paste. This matches "Paste of multi-line text into an empty step splits into steps" literally.
- **`RecipeForm` has no favourite toggle** — the spec's editor section (Dish/Numbers/Ingredients/Method/
  Source URL) doesn't list one, and favouriting is already available from both the `/menu` card and the
  detail page's star button, so a new recipe is created unfavourited and can be favourited immediately after
  from the detail page it redirects to.
- **32 seeded recipes get a few honest tag additions beyond the literal `docs/seed/meal-ideas.json`
  mapping** where the ingredients genuinely support it: `pescatarian` on Salmon & New Potatoes, Fish Pie and
  Tuna Pasta Salad; `dairy-free` on Veggie Chilli, Lentil Soup, Smoothie Bowls and Wraps & Hummus (all
  already vegan, so this was already true, just previously untagged); `comfort`/`batch-cook`/
  `freezer-friendly` on a handful of stews/bakes. None of these change any allergen or safety fact — they
  were re-checked against `tagConflicts` and the seed-data unit test (zero conflicts across all 32) passes
  with them included.
- **`salt and pepper`-style "to taste" ingredients** (used in a handful of recipes — Bolognese, Shepherd's
  Pie, Grilled Chicken & Rice) have `quantity: null, unit: null, optional: true`, exercising the "to taste" /
  unspecified-quantity path end-to-end: `formatQuantity(null, ...)` returns `''`, and the ingredient prints
  on the detail page with no quantity column.

**Verification.** `npm test` (104 tests, including a seed-data test that runs `tagConflicts` over all 32
seeded recipes and asserts zero conflicts, and one asserting every recipe has ≥3 ingredients and ≥3 method
steps), `npm run lint` and `npm run build` are all green. `npm run migrate` and `npm run seed` were both run
for real against the shared Neon database and are idempotent (verified with a second run of each — "skip"
for every migration file and every recipe name, zero rows changed). Browser QA (dev server on port 3111,
desktop and 390px, dark and light) drove: The Menu grid rendering all 32 dishes with correct meta/allergen/
tag chips; the fish-allergy member (Ada, pre-existing) producing `NOT FOR ADA` stamps on exactly Fish
Fingers & Chips, Fish Pie, Salmon & New Potatoes and Tuna Pasta Salad, and correctly *not* on Jacket
Potatoes (optional tuna); the `Safe for everyone` toggle hiding exactly those four; a Fish Pie detail page
showing the `KITCHEN WARNING` ticket with `Ada: Allergic to fish`; the servings stepper live-rescaling every
ingredient (verified 4→6 servings on Fish Pie: 300g cod → 450g, 150g prawns → 230g, all matching
`scaleQuantity`'s rounding rules); creating a dish with ingredient name "plain flour" auto-suggesting aisle
`bakery` and allergen `gluten` (both confirmed via the DOM, not just visually) on blur; tagging that dish
`gluten-free` producing the kitchen-check warning `"Tagged gluten-free but plain flour carries gluten"`; the
archive/restore cycle via the API (`DELETE` → `archived: true`, `204`; hidden from the default list; `PATCH
{archived:false}` → restored); and both carry-over fixes rendering and behaving as described above. The
one test recipe created during manual QA (id 33, "Test Bread Rolls") was deleted afterwards; `fm_recipes`
and `fm_recipe_ingredients` were confirmed back to exactly the 32 seeded dishes before finishing.

**Deferred / out of scope for this slice** (per spec, not gaps): drag-and-drop reordering of ingredients or
method steps (up/down buttons only, matching the same choice Slice 0 made for members). No rate limiting or
pagination on `/api/recipes` (a private single-household menu of a few dozen dishes doesn't need it).
`?hard=1` on `DELETE /api/recipes/[id]` is explicitly not supported, per spec.

## QA fixes

A second QA pass came back "FIX FIRST" with eight findings. All eight are addressed below; `npm test`
(139 tests), `npm run lint` and `npm run build` were re-run green after all of them together, and every fix
was also separately re-verified live against a dev server (port 3111) as described.

1. **BLOCKER — tag chips invisible in dark mode on `/menu/[id]`.** `Chip`'s `outline` variant hardcoded
   `border-ink`/`text-ink`, which are fixed near-black colours meant for text *on paper*. The `/menu/[id]`
   allergen/tag row and the `/menu` filters row both sit directly on the counter (no `Ticket` wrapper), and
   the dark-mode counter is also near-black — ink-on-near-black was effectively invisible. Fixed by adding
   an `onCounter` prop to `Chip` (and threading it through `ChipToggle`): when true, the `outline`/`soft`/
   `dislike` variants switch to `chalk`/`chalk-soft` instead of `ink`/`ink-soft`. `chalk` is a theme-aware
   token (near-white in dark mode, near-black in light mode — see `globals.css`), so this one change makes
   the chip correct in *both* themes, not just dark. `allergen` (fixed red) and `plain` (own opaque
   `bg-paper-2` background) already worked in both contexts and are untouched. Audited every `Chip`/
   `ChipToggle` usage in `src/`: `RecipeCard.tsx`, `MemberCard.tsx` and `TagEditor.tsx` (via `MemberForm`)
   all sit inside a `Ticket`, so they're correctly left as plain (paper) chips; `/menu/[id]/page.tsx`'s
   allergen/tag row and every filter chip in `/menu/page.tsx` (meal type, tags, Safe for everyone,
   Favourites, Show 86'd) now pass `onCounter`.
   **Verified live:** screenshotted `/menu/31` (Fish Pie) and `/menu` in both dark and light — tag chips
   (`COMFORT`, `PESCATARIAN`, `FREEZER-FRIENDLY`, filter chips) and allergen chips (`FISH`, `DAIRY`,
   `GLUTEN`) are all clearly legible against the counter in both themes; allergen chips stayed red in both.

2. **BLOCKER/MAJOR — `inferAllergens` misses.** Added every keyword from the QA list to
   `src/lib/allergens.ts`'s `ALLERGEN_KEYWORDS`, including two new compound-word entries
   (`buttermilk`, `fishcakes?`) for words that word-boundary matching can't decompose (there's no boundary
   in the middle of a single fused word), and a new negative-lookahead exception (`cream` NOT followed by
   `crackers?`) alongside the existing milk/butter lookbehind exceptions, so "cream crackers" infers gluten
   (from the new `crackers?` keyword) without falsely inferring dairy. All 25 new cases from the QA list are
   now unit-tested in `allergens.test.ts` (oyster sauce → shellfish, tamari → soy, buttermilk → dairy,
   fishcake/fishcakes/fish fingers → fish, cream crackers → gluten-not-dairy, biscuits/digestives/
   crispbread → gluten, worcestershire sauce → fish, pesto → nuts+dairy, stock cube(s) → gluten, gelatine →
   nothing, anchovies/anchovy → fish (already correct, now explicitly tested), clams/squid/lobster/scallops
   → shellfish, brioche → gluten+dairy+eggs, mayonnaise/mayo → eggs, custard → dairy+eggs, halloumi/feta/
   mozzarella/cheddar/ricotta/mascarpone/ghee/paneer → dairy), plus new regression tests confirming the
   existing correct negatives still hold (nutmeg, eggplant, coconut milk, almond milk, butternut squash,
   water chestnuts, plain coconut).
   **Verified live:** typed "oyster sauce" into the recipe editor's ingredient name field and confirmed via
   the DOM that the `shellfish` allergen chip auto-selected (`aria-pressed="true"`) on blur.

3. **MAJOR — custom member allergies never matched anything.** `engine/compat.ts` only ever checked a
   member's allergies against the recipe's *derived* (preset-only) allergens, so a custom allergy like
   "kiwi" was silently ignored no matter what the recipe contained. Added a second path: for each member
   allergy that isn't one of the nine `ALLERGENS` presets, it's now matched directly against every
   non-optional ingredient's name — case-insensitive, word-boundary aware (reusing the exact same
   substring-safety property as `allergens.ts`, so a custom allergy of "nut" still can't match "nutmeg" or
   "coconut"), and singular/plural tolerant (a trailing "s" is stripped from however the member spelled it,
   then optionally re-added when matching, so "kiwi" matches both "kiwi fruit" and "kiwis"). Conflict reason
   format matches the QA spec exactly: `"<member name> is allergic to <allergy> (in: <ingredient name>)"`.
   Documented in `compat.ts`'s header comment, right above the new `customAllergyPattern` helper.
   **Verified live:** created a temporary member with allergy `"kiwi"` and a temporary recipe containing
   non-optional ingredient `"kiwi fruit"` via the real API — the recipe's `compat` came back
   `{"safe":false,"conflicts":[{"memberId":14,"memberName":"QA Test Member","reason":"QA Test Member is
   allergic to kiwi (in: kiwi fruit)"}]}`, exact match to spec. Both the test member and test recipe were
   deleted afterwards.

4. **Vegetarian/vegan rule gap — gelatine and honey.** Neither `tagConflicts` nor `compatibility` had ever
   heard of gelatine or honey; a recipe tagged (or a member restricted to) vegetarian/vegan would happily
   pass with gelatine in it. Added `GELATINE_PATTERN`/`HONEY_PATTERN` to `src/lib/recipes.ts` (exported so
   `engine/compat.ts` imports the same two patterns rather than risking drift), matched directly against
   ingredient names the same way custom allergies are (word-boundary, not through the allergens vocabulary,
   since neither is an allergen). `tagConflicts` now flags a vegetarian- or vegan-tagged dish containing
   gelatine, and a vegan-tagged dish containing honey (vegetarian + honey is fine — that's the conventional
   distinction). `compatibility` independently checks the same two patterns against ingredient names for any
   vegetarian/vegan member, regardless of the recipe's own tags — a dish mistakenly tagged vegetarian that
   still has gelatine in it now still warns a vegetarian member, which the old tags-only check could never
   catch.
   **Verified:** 7 new unit tests across `recipes.test.ts` and `compat.test.ts` (gelatine flagged for both
   vegetarian and vegan; honey flagged for vegan only, not vegetarian; the `compatibility` version confirmed
   to fire even when the recipe carries the "vegetarian"/"vegan" tag).

5. **MINOR — empty `ingredients` array wasn't rejected.** `createRecipeSchema.ingredients` had `.default([])`
   with no minimum; `patchRecipeSchema.ingredients` had no minimum either. Both now require `.min(1, 'At
   least one ingredient is required')` (create is no longer defaulted — a recipe must supply at least one
   ingredient; patch stays `.optional()` so omitting the field entirely still means "leave ingredients
   alone", but an explicit `[]` is rejected same as create). Also added the equivalent client-side check in
   `RecipeForm.tsx` so the editor surfaces "At least one ingredient is required." next to the Name field
   instead of only failing server-side.
   **Verified via curl:** `POST /api/recipes` with `"ingredients": []` → `400
   {"error":"validation","issues":[{...,"message":"At least one ingredient is required"}]}`. `PATCH
   /api/recipes/31` with `"ingredients": []` → the identical 400.

6. **MINOR — `scaleQuantity` for count units clamped every sub-1 value up to a whole "1".** Split the old
   single `WHOLE_NUMBER_UNITS` list into `COUNT_UNITS` (pcs, clove, slice, can, pack) and `VAGUE_UNITS`
   (pinch, handful — these stay whole-number-with-a-floor-of-1, since "half a pinch" isn't a meaningful
   instruction for an already-vague quantity). For `COUNT_UNITS`, a raw scaled value `>= 0.75` still rounds
   to a whole number as before; below that, it now rounds to the nearest 0.5 step (never below 0.5) instead
   of jumping straight to 1 — e.g. 1 pcs scaled from 4 servings down to 2 now gives 0.5, not 1.
   `formatQuantity` was extended to render that 0.5 as a vulgar fraction (`"½ pcs"`) for count units the same
   way it already did for tsp/tbsp/cup.
   **Verified:** unit tests cover the `>= 0.75` boundary exactly (0.75 still rounds up to 1), the half-step
   rounding for all five `COUNT_UNITS`, `VAGUE_UNITS` being unaffected, and `formatQuantity(0.5, 'pcs')` →
   `"½ pcs"`.

7. **MINOR — `scripts/seed.mjs` could leave an orphan recipe row.** Mirrored the same try/catch-and-delete
   pattern already used in `POST /api/recipes`: if the ingredient-rows transaction throws after the recipe
   row has already been inserted, the script now deletes that recipe row before re-throwing, rather than
   leaving a name-only "recipe" behind that the idempotency check (`existingNames.has(recipe.name)`) would
   then skip forever on every future run.
   **Verified by code inspection and by the real re-seed run below** (no interrupted inserts occurred, but
   the try/catch path mirrors the already-tested `POST` route's equivalent behaviour line for line).

8. **Seed data.** Chicken Caesar Salad's `caesar dressing` ingredient now also carries `fish` (traditional
   Caesar dressing contains anchovy) alongside its existing `dairy`/`eggs` — this was a data fix on an
   *already-seeded* recipe, so `npm run seed`'s idempotent-by-name insert wouldn't touch it; applied directly
   with a one-off `UPDATE fm_recipe_ingredients ... WHERE name = 'caesar dressing'` against the real Neon
   database (confirmed via `RETURNING`). Added two new seeded recipes to exercise the nut/peanut allergy
   path with real data: **Chicken Satay Skewers** (peanut butter → peanuts, soy sauce → gluten+soy, served
   with rice, tagged `bbq`) and **Pesto Pasta with Pine Nuts** (pesto → nuts+dairy, parmesan → dairy, pasta →
   gluten, tagged `vegetarian`+`quick`) — both have full ingredient lists, 5–6 method steps, honest
   prep/cook times, and zero `tagConflicts` (verified by the same seed-data unit test that checks all the
   others). `recipes.test.ts`'s expected minimum count was updated from 32 to 34.
   **Verified for real against Neon:** `npm run seed` inserted exactly the 2 new recipes and skipped the
   other 32 by name; a second `npm run seed` run skipped all 34 (fully idempotent); `GET /api/recipes`
   confirmed 34 total and the Caesar Salad's `NOT FOR ADA` stamp now correctly appears (Ada's fish allergy
   now catches the dressing). All QA-created scratch data (one test member, one test recipe) was deleted
   from the real database afterwards.
