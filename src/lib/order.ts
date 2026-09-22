// The Order's pure logic: normalising ingredient names/units, merging them
// into one shopping line per (ingredient, unit family), scaling to covers,
// and rendering as plain text. No DB access — see docs/slices/04-order.md.

import { scaleQuantity, formatQuantity } from './recipes';
import type { Aisle, Unit } from './vocab';

// Shopping-trip order, deliberately different from vocab.ts's AISLES (which
// orders aisles for the recipe editor's own dropdown) — produce and bakery
// are usually near the entrance, frozen/pantry/spices/drinks/household
// further round, matching how you'd actually walk a supermarket.
export const AISLE_ORDER: Aisle[] = [
  'produce',
  'bakery',
  'meat-fish',
  'dairy-eggs',
  'frozen',
  'pantry',
  'spices',
  'drinks',
  'household',
];

// Ingredients that always belong in their own STAPLES block at the end,
// regardless of the aisle they were tagged with on their recipe (salt is
// often tagged "spices", olive oil "pantry" — here they're forced to
// `pantry` and pulled out of the normal aisle grouping). Matched against the
// FULL normalised name, not a substring — "salt and pepper" (a single
// combined ingredient) deliberately does NOT match "salt" or "pepper".
export const STAPLES = ['salt', 'black pepper', 'pepper', 'olive oil', 'vegetable oil', 'sunflower oil', 'water'];
const STAPLES_SET = new Set(STAPLES);

// "Simple plural -> singular" exceptions: words that already look plural but
// are the base/shopping-list form of the ingredient, not a plural of some
// singular "couscou"/"hummu"/"pea"/"bean"/"lentil"/"oat"/"chip"/"noodle".
// Checked against the LAST WORD of the (already lowercased) name, so
// "frozen peas" and "baked beans" are recognised too, not just the bare word.
//
// "peppers" is an addition beyond the slice spec's literal list, found live
// against the real seeded week: Chicken Fajitas' "peppers" (bell peppers,
// produce) singularized to "pepper", which is byte-for-byte the SAME string
// as the STAPLES entry "pepper" (ground black pepper, a pantry seasoning) —
// the vegetable was silently swept into the STAPLES block. "peppers" stays
// plural, exactly like "peas"/"beans" already do, so it can never collide
// with the singular seasoning name. See this slice's Build notes.
//
// "olives"/"chives"/"cloves" (QA, second pass): a product decision, not a
// STAPLES collision — like peas/beans, these are conventionally bought and
// listed in their plural form ("a jar of olives", "a bunch of chives",
// "a jar of cloves"), so they stay as-is rather than singularizing to
// "olive"/"chive"/"clove". This also sidesteps the new -ves handling below:
// "olives"/"chives"/"cloves" all end in "ves" but aren't -ves plurals in the
// same sense as leaves/loaves/halves/knives/shelves (they're -e + -s, not
// -f/-fe -> -ves), so they're listed here, checked before IRREGULAR_PLURALS.
const PLURAL_EXCEPTIONS = new Set([
  'couscous',
  'hummus',
  'peas',
  'beans',
  'lentils',
  'oats',
  'chips',
  'noodles',
  'peppers',
  'olives',
  'chives',
  'cloves',
]);

// Irregular -f/-fe -> -ves plurals (QA, second pass). NOT a general "-ves"
// suffix rule — "olives"/"chives"/"cloves" also end in "ves" but are NOT
// this kind of plural (see PLURAL_EXCEPTIONS above), so this is a closed
// lookup of the specific words this app needs, not a regex.
const IRREGULAR_PLURALS: Record<string, string> = {
  leaves: 'leaf',
  loaves: 'loaf',
  halves: 'half',
  knives: 'knife',
  shelves: 'shelf',
};

function singularizeWord(word: string): string {
  if (PLURAL_EXCEPTIONS.has(word)) return word;
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word];
  if (word.endsWith('oes') && word.length > 3) return word.slice(0, -2); // tomatoes -> tomato, potatoes -> potato
  if (word.endsWith('ies') && word.length > 3) return `${word.slice(0, -3)}y`; // berries -> berry, cherries -> cherry
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 1) return word.slice(0, -1); // onions -> onion, eggs -> egg, carrots -> carrot
  return word;
}

/** lowercase, trimmed, parenthetical notes removed, whitespace collapsed — the shared first stage of normaliseName, WITHOUT the plural -> singular step. */
function stripAndLower(rawName: string): string {
  let name = rawName.toLowerCase().trim();
  name = name.replace(/\([^)]*\)/g, ' '); // "stock (chicken)" -> "stock "
  return name.replace(/\s+/g, ' ').trim();
}

/**
 * Lowercase, trimmed, parenthetical notes removed, simple plural -> singular
 * on the last word only (so "frozen peas" stays "frozen peas" via the
 * exception list, but "chopped tomatoes" becomes "chopped tomato"). See
 * docs/slices/04-order.md's Logic section for the exception list.
 */
export function normaliseName(rawName: string): string {
  const name = stripAndLower(rawName);
  if (!name) return name;
  const words = name.split(' ');
  words[words.length - 1] = singularizeWord(words[words.length - 1]);
  return words.join(' ');
}

/** kg -> g (x1000), l -> ml (x1000); everything else unchanged. Null quantity/unit passes through. */
export function normaliseUnit(
  quantity: number | null,
  unit: Unit | null
): { quantity: number | null; unit: Unit | null } {
  if (quantity === null || unit === null) return { quantity, unit };
  if (unit === 'kg') return { quantity: quantity * 1000, unit: 'g' };
  if (unit === 'l') return { quantity: quantity * 1000, unit: 'ml' };
  return { quantity, unit };
}

// How many of the "spoon" family's smallest unit (tsp) one of each larger
// spoon unit is worth, for merging tsp/tbsp/cup together.
const SPOON_TO_TSP: Partial<Record<Unit, number>> = { tsp: 1, tbsp: 3, cup: 48 };
const VAGUE_UNITS_SET = new Set<Unit>(['pinch', 'handful']);

/**
 * The token used in a line's merge key for a given unit: the shared base
 * unit for a whole family (mass -> "g", volume -> "ml", spoon -> "tsp",
 * every vague/null unit -> "vague"), or the unit itself for a count unit
 * (pcs/clove/slice/can/pack), since those aren't interchangeable — "2 clove"
 * and "3 pcs" of the same ingredient are two different purchases, not one
 * line to sum.
 */
function familyToken(unit: Unit | string | null): string {
  if (unit === null) return 'vague';
  const massVol = normaliseUnit(0, unit as Unit);
  if (massVol.unit === 'g' || massVol.unit === 'ml') return massVol.unit;
  if (unit in SPOON_TO_TSP) return 'tsp';
  if (VAGUE_UNITS_SET.has(unit as Unit)) return 'vague';
  return unit as string; // count units: pcs, clove, slice, can, pack
}

/** `${normaliseName}|${family}` — same key for "plain flour" at 200g and 0.5kg; different keys for "onion" at 2 pcs vs 200 g. */
export function lineKey(name: string, unit: Unit | string | null): string {
  return `${normaliseName(name)}|${familyToken(unit)}`;
}

/** Converts a quantity to its family's base unit for summing (grams, millilitres or teaspoons); count units pass through unchanged (their own unit IS the family). */
function toBaseQuantity(quantity: number | null, unit: Unit | null): number | null {
  if (quantity === null || unit === null) return null;
  const massVol = normaliseUnit(quantity, unit);
  if (massVol.unit === 'g' || massVol.unit === 'ml') return massVol.quantity;
  const spoonFactor = SPOON_TO_TSP[unit];
  if (spoonFactor !== undefined) return quantity * spoonFactor;
  return quantity; // count unit
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Rounds to the nearest multiple of `step`, but never rounds a genuinely non-zero value down to exactly 0 — matches scaleQuantity's own "never show 0 of an ingredient that's still on the list" rule. */
function roundToStep(value: number, step: number): number {
  const rounded = Math.round(value / step) * step;
  return rounded === 0 && value !== 0 ? step : rounded;
}

/**
 * The base-unit sum back to a sensible display unit, snapped to the same
 * kitchen-sensible steps scaleQuantity uses when scaling a single recipe —
 * QA (second pass): a merged sum used to display as a raw decimal (e.g.
 * "2.33 tbsp"), which formatQuantity can't render as a vulgar fraction and
 * no kitchen measure actually uses. Below 1000 g/ml, mass/volume snap to a
 * 5-unit (under 100) or 10-unit step, same as scaleQuantity. At 1000+, they
 * convert to kg/l rounded to one decimal place (not the g/ml step — a
 * kitchen scale reads kilograms to one decimal, not to the nearest 10g).
 * Spoon units (tsp/tbsp/cup) always snap to quarter steps once converted to
 * the target unit, so formatQuantity's ¼ ½ ¾ rendering always has something
 * exact to render.
 */
function resolveDisplay(token: string, baseSum: number | null): { quantity: number | null; unit: Unit | null } {
  if (token === 'vague') return { quantity: null, unit: null };
  if (baseSum === null) return { quantity: null, unit: token as Unit };
  if (token === 'g') {
    if (baseSum >= 1000) return { quantity: round1(baseSum / 1000), unit: 'kg' };
    return { quantity: roundToStep(baseSum, baseSum < 100 ? 5 : 10), unit: 'g' };
  }
  if (token === 'ml') {
    if (baseSum >= 1000) return { quantity: round1(baseSum / 1000), unit: 'l' };
    return { quantity: roundToStep(baseSum, baseSum < 100 ? 5 : 10), unit: 'ml' };
  }
  if (token === 'tsp') {
    if (baseSum >= 48) return { quantity: roundToStep(baseSum / 48, 0.25), unit: 'cup' };
    if (baseSum >= 3) return { quantity: roundToStep(baseSum / 3, 0.25), unit: 'tbsp' };
    return { quantity: roundToStep(baseSum, 0.25), unit: 'tsp' };
  }
  return { quantity: baseSum, unit: token as Unit }; // count unit
}

export interface OrderIngredientSource {
  entryId: number;
  recipeId: number;
  recipeName: string;
  quantity: number | null;
  unit: Unit | null;
}

/** One line on the receipt — generated (has a `key`) or manual (`key: null`). */
export interface ShoppingLine {
  key: string | null;
  name: string;
  quantity: number | null;
  unit: Unit | null;
  aisle: Aisle;
  checked: boolean;
  manual: boolean;
  optional: boolean;
  /** Forced into its own STAPLES block regardless of `aisle` — see STAPLES above. */
  staple: boolean;
  /** True when a generated line's name/quantity/unit/aisle were hand-edited and are now preserved verbatim across regeneration — see aggregate()'s doc comment. Always false for a manual line (there's nothing to "override" — it's entirely hand-entered already). */
  overridden: boolean;
  sources: OrderIngredientSource[];
}

export interface AggregateIngredient {
  name: string;
  quantity: number | null;
  unit: Unit | null;
  aisle: Aisle;
  optional: boolean;
}

/** One of this week's `planned` pass entries, ready for aggregation — the API layer resolves the recipe and its ingredients before calling aggregate(). */
export interface AggregateEntry {
  entryId: number;
  recipeId: number;
  recipeName: string;
  recipeServings: number;
  /** entry.servings — null means "use attendeeCount" (see docs/slices/04-order.md). */
  servings: number | null;
  attendeeCount: number;
  ingredients: AggregateIngredient[];
}

/**
 * What an existing DB row carries into a regeneration — `checked` for every
 * row (generated or manual, though only a generated one's key ever matches
 * anything here), and, for a row with `overridden: true`, the exact
 * name/quantity/unit/aisle to preserve instead of recomputing them (omitted
 * entirely / `overridden: false` for an ordinary carried-over line — only
 * `checked` matters then). See aggregate()'s doc comment.
 */
export interface ExistingCheckedLine {
  key: string | null;
  checked: boolean;
  overridden?: boolean;
  name?: string;
  quantity?: number | null;
  unit?: Unit | null;
  aisle?: Aisle;
}

interface Accum {
  key: string;
  name: string;
  token: string;
  baseSum: number | null;
  aisle: Aisle;
  optionalAll: boolean;
  sources: OrderIngredientSource[];
}

/**
 * Aggregates this week's planned entries into merged, covers-scaled shopping
 * lines, sorted by AISLE_ORDER then name (staples last, sorted by name).
 * Each ingredient is scaled by `entry.servings ?? attendeeCount` over the
 * recipe's own `servings` via scaleQuantity (Slice 1). Lines with the same
 * key (see lineKey) merge by summing; a "vague" line (pinch/handful/no unit)
 * merges to a single "to taste" line (quantity/unit both null) regardless of
 * how many sources contributed. `optional` is true only when EVERY source
 * marked it optional. An entry with zero effective covers (0 attendees, no
 * `servings` override) contributes nothing for a non-vague ingredient — see
 * the `scaledQuantity === 0` skip below (QA, second pass).
 *
 * Only computes GENERATED lines (every returned line has manual: false and a
 * non-null key) — manual lines are never touched by regeneration at all, so
 * the API layer that calls this leaves them in the database untouched rather
 * than round-tripping them through here. See docs/slices/04-order.md's API
 * section and this slice's Build notes for why that split lives at the
 * route layer.
 *
 * `checked` is carried over from `existingItems` by key. QA (second pass),
 * product decision — editing a generated line no longer duplicates it as a
 * manual line: an existing row with `overridden: true` for a key this round
 * still produces (i.e. the dish is still on the pass) keeps that row's own
 * name/quantity/unit/aisle/checked EXACTLY as stored, but its `sources`
 * still refresh to whatever currently contributes to that key. An
 * overridden row whose key this round does NOT produce at all (the dish
 * left the plan, or every contributing entry now has zero covers) is simply
 * absent from the result, same as any other line that stops existing —
 * the caller (regenerateGeneratedLines) deletes any stored generated row
 * not present in this function's return value.
 */
export function aggregate(entries: AggregateEntry[], existingItems: ExistingCheckedLine[]): ShoppingLine[] {
  const existingByKey = new Map(
    existingItems.filter((i): i is ExistingCheckedLine & { key: string } => i.key !== null).map((i) => [i.key, i])
  );

  const accums = new Map<string, Accum>();

  for (const entry of entries) {
    const toServings = entry.servings ?? entry.attendeeCount;
    for (const ingredient of entry.ingredients) {
      const key = lineKey(ingredient.name, ingredient.unit);
      const scaledQuantity =
        ingredient.unit === null
          ? ingredient.quantity
          : scaleQuantity(ingredient.quantity, ingredient.unit, entry.recipeServings, toServings);
      const token = familyToken(ingredient.unit);

      // QA (second pass): zero effective covers (0 attendees, no servings
      // override -> toServings === 0 -> scaleQuantity returns 0) means this
      // entry contributes NOTHING for a non-vague ingredient — not even a
      // zero-quantity source. A vague-unit ingredient (to taste) is exempt:
      // it carries no real numeric quantity to begin with, and "0 covers"
      // doesn't make a pinch of salt any less needed.
      if (token !== 'vague' && scaledQuantity === 0) continue;

      const source: OrderIngredientSource = {
        entryId: entry.entryId,
        recipeId: entry.recipeId,
        recipeName: entry.recipeName,
        quantity: scaledQuantity,
        unit: ingredient.unit,
      };

      const existing = accums.get(key);
      if (!existing) {
        const name = normaliseName(ingredient.name);
        accums.set(key, {
          key,
          name,
          token,
          baseSum: token === 'vague' ? null : toBaseQuantity(scaledQuantity, ingredient.unit),
          aisle: STAPLES_SET.has(name) ? 'pantry' : ingredient.aisle,
          optionalAll: ingredient.optional,
          sources: [source],
        });
        continue;
      }

      existing.sources.push(source);
      existing.optionalAll = existing.optionalAll && ingredient.optional;
      if (token !== 'vague') {
        const contribution = toBaseQuantity(scaledQuantity, ingredient.unit);
        existing.baseSum = existing.baseSum === null || contribution === null ? null : existing.baseSum + contribution;
      }
    }
  }

  const lines: ShoppingLine[] = [];
  for (const acc of accums.values()) {
    const existing = existingByKey.get(acc.key);

    if (existing?.overridden) {
      lines.push({
        key: acc.key,
        name: existing.name ?? acc.name,
        quantity: existing.quantity ?? null,
        unit: existing.unit ?? null,
        aisle: existing.aisle ?? acc.aisle,
        checked: existing.checked,
        manual: false,
        optional: acc.optionalAll,
        staple: STAPLES_SET.has(existing.name ?? acc.name),
        overridden: true,
        sources: acc.sources,
      });
      continue;
    }

    const display = resolveDisplay(acc.token, acc.baseSum);
    lines.push({
      key: acc.key,
      name: acc.name,
      quantity: display.quantity,
      unit: display.unit,
      aisle: acc.aisle,
      checked: existing?.checked ?? false,
      manual: false,
      optional: acc.optionalAll,
      staple: STAPLES_SET.has(acc.name),
      overridden: false,
      sources: acc.sources,
    });
  }

  return sortLines(lines);
}

function sortLines(lines: ShoppingLine[]): ShoppingLine[] {
  return [...lines].sort((a, b) => {
    if (a.staple !== b.staple) return a.staple ? 1 : -1;
    if (!a.staple) {
      const diff = AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle);
      if (diff !== 0) return diff;
    }
    return a.name.localeCompare(b.name);
  });
}

function formatLineQuantity(line: ShoppingLine): string {
  if (line.quantity === null) return 'to taste';
  return formatQuantity(line.quantity, line.unit ?? '');
}

function formatLine(line: ShoppingLine): string {
  const box = line.checked ? '[x]' : '[ ]';
  const qty = formatLineQuantity(line);
  const optional = line.optional ? ' (optional)' : '';
  return qty ? `${box} ${line.name}${optional} — ${qty}` : `${box} ${line.name}${optional}`;
}

/**
 * The order as plain text for clipboard/share: header, aisle headings in
 * caps, `[ ]`/`[x]` lines, STAPLES then ADDED (manual lines) last. QA
 * (second pass): a manual line NEVER goes under STAPLES even if its name
 * happens to match one (e.g. a manually-added "salt") — manual lines always
 * get their own "ADDED" section instead, matching the receipt's own on-
 * screen grouping (`OrderView.tsx`), which never renders a manual line
 * inside an aisle block or the STAPLES block either.
 */
export function toPlainText(lines: ShoppingLine[], weekKicker: string): string {
  const out: string[] = ['THE RICE KITCHEN', 'SUPPLIER ORDER', weekKicker.toUpperCase(), ''];

  const byAisle = new Map<Aisle, ShoppingLine[]>();
  const staples: ShoppingLine[] = [];
  const added: ShoppingLine[] = [];
  for (const line of lines) {
    if (line.manual) {
      added.push(line);
      continue;
    }
    if (line.staple) {
      staples.push(line);
      continue;
    }
    const group = byAisle.get(line.aisle) ?? [];
    group.push(line);
    byAisle.set(line.aisle, group);
  }

  for (const aisle of AISLE_ORDER) {
    const group = byAisle.get(aisle);
    if (!group || group.length === 0) continue;
    out.push(aisle.toUpperCase());
    for (const line of group) out.push(formatLine(line));
    out.push('');
  }

  if (staples.length > 0) {
    out.push('STAPLES');
    for (const line of staples) out.push(formatLine(line));
    out.push('');
  }

  if (added.length > 0) {
    out.push('ADDED');
    for (const line of added) out.push(formatLine(line));
    out.push('');
  }

  const checkedCount = lines.filter((l) => l.checked).length;
  out.push(`${lines.length} LINES · ${checkedCount} TICKED`);

  return out.join('\n').trimEnd();
}
