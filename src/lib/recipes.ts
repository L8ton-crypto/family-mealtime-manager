import type { Allergen, Tag, Unit } from './vocab';

export interface RecipeIngredientLike {
  name: string;
  allergens: Allergen[];
  optional: boolean;
}

export interface AisleIngredientLike extends RecipeIngredientLike {
  aisle: string;
}

/**
 * Union of allergens carried by every non-optional ingredient. Optional
 * ingredients ("or oat milk", a topping you can leave off) don't count —
 * the dish can genuinely be made without them.
 */
export function deriveAllergens(ingredients: RecipeIngredientLike[]): Allergen[] {
  const found = new Set<Allergen>();
  for (const ingredient of ingredients) {
    if (ingredient.optional) continue;
    for (const allergen of ingredient.allergens) found.add(allergen);
  }
  return Array.from(found);
}

// Gelatine is animal-derived — not vegetarian, not vegan. Honey is an
// animal product too, but conventionally accepted by vegetarians (just not
// vegans). Neither has an entry in the ALLERGENS vocabulary (they're not
// allergens), so they're matched directly against ingredient NAMES here,
// the same word-boundary-aware way engine/compat.ts's custom allergy
// matching works — and engine/compat.ts imports these same two patterns so
// the tag-level check (here) and the per-member check (there) never drift
// apart on what counts as "contains gelatine"/"contains honey".
export const GELATINE_PATTERN = /\bgelatine?\b/i;
export const HONEY_PATTERN = /\bhoney\b/i;

/**
 * Human-readable conflicts between a recipe's tags and what its
 * (non-optional) ingredients actually are. Doesn't block saving — the
 * kitchen check is a warning, not a gate.
 */
export function tagConflicts(tags: Tag[] | string[], ingredients: AisleIngredientLike[]): string[] {
  const conflicts: string[] = [];
  const nonOptional = ingredients.filter((i) => !i.optional);
  const derived = deriveAllergens(ingredients);

  if (tags.includes('vegetarian')) {
    for (const ingredient of nonOptional) {
      if (ingredient.aisle === 'meat-fish') {
        conflicts.push(`Tagged vegetarian but contains ${ingredient.name} (meat-fish aisle)`);
      } else if (GELATINE_PATTERN.test(ingredient.name)) {
        conflicts.push(`Tagged vegetarian but contains ${ingredient.name} (gelatine is not vegetarian)`);
      }
    }
  }

  if (tags.includes('vegan')) {
    for (const ingredient of nonOptional) {
      if (ingredient.aisle === 'meat-fish') {
        conflicts.push(`Tagged vegan but contains ${ingredient.name} (meat-fish aisle)`);
      } else if (GELATINE_PATTERN.test(ingredient.name)) {
        conflicts.push(`Tagged vegan but contains ${ingredient.name} (gelatine is not vegan)`);
      } else if (HONEY_PATTERN.test(ingredient.name)) {
        conflicts.push(`Tagged vegan but contains ${ingredient.name} (honey is not vegan)`);
      }
    }
    if (derived.includes('dairy')) conflicts.push('Tagged vegan but contains dairy');
    if (derived.includes('eggs')) conflicts.push('Tagged vegan but contains eggs');
  }

  if (tags.includes('gluten-free') && derived.includes('gluten')) {
    const offenders = dedupeNames(nonOptional.filter((i) => i.allergens.includes('gluten')));
    for (const name of offenders) conflicts.push(`Tagged gluten-free but ${name} carries gluten`);
  }

  if (tags.includes('dairy-free') && derived.includes('dairy')) {
    const offenders = dedupeNames(nonOptional.filter((i) => i.allergens.includes('dairy')));
    for (const name of offenders) conflicts.push(`Tagged dairy-free but ${name} carries dairy`);
  }

  // Not spelled out in the slice spec's tagConflicts list, but kept
  // consistent with engine/compat.ts's own pescatarian rule: a pescatarian
  // dish may contain fish/shellfish, just not other meat.
  if (tags.includes('pescatarian')) {
    for (const ingredient of nonOptional) {
      const isSeafood = ingredient.allergens.includes('fish') || ingredient.allergens.includes('shellfish');
      if (ingredient.aisle === 'meat-fish' && !isSeafood) {
        conflicts.push(`Tagged pescatarian but contains ${ingredient.name} (meat-fish aisle, not fish or shellfish)`);
      }
    }
  }

  return conflicts;
}

function dedupeNames(ingredients: RecipeIngredientLike[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const ingredient of ingredients) {
    if (!seen.has(ingredient.name)) {
      seen.add(ingredient.name);
      names.push(ingredient.name);
    }
  }
  return names;
}

// Countable-item units: whole numbers most of the time, but a scaled-down
// quantity can genuinely mean "half of one" (half a can, half a slice) —
// see the COUNT_UNITS branch below. "pinch"/"handful" are vague quantities
// to begin with ("a pinch", "a handful"), so they stay simple whole-number
// rounding with a floor of 1.
const COUNT_UNITS: Unit[] = ['pcs', 'clove', 'slice', 'can', 'pack'];
const VAGUE_UNITS: Unit[] = ['pinch', 'handful'];
const QUARTER_STEP_UNITS: Unit[] = ['tsp', 'tbsp', 'cup'];

/**
 * Rescales a quantity from one serving count to another with
 * kitchen-sensible rounding: whole numbers for countable units (half-steps
 * below 0.75 — see COUNT_UNITS), quarter steps for spoons/cups, and 5-unit
 * (under 100) or 10-unit (100+) steps for grams/millilitres. Kilograms and
 * litres round to 2 decimal places.
 */
export function scaleQuantity(
  quantity: number | null,
  unit: Unit | string,
  fromServings: number,
  toServings: number
): number | null {
  if (quantity === null || quantity === undefined) return null;
  if (!fromServings || fromServings <= 0) return quantity;

  const raw = quantity * (toServings / fromServings);
  if (raw <= 0) return 0;

  if (COUNT_UNITS.includes(unit as Unit)) {
    // A raw value of 0.75 or more rounds to a whole number as usual (0.75
    // itself rounds up to 1). Below that, round to the nearest half-step
    // instead of clamping straight up to a whole "1" — 3 pcs scaled down to
    // an eighth is more honestly "0.5 pcs" than "1 pcs".
    if (raw >= 0.75) {
      return Math.round(raw);
    }
    const roundedHalf = Math.round(raw / 0.5) * 0.5;
    return roundedHalf === 0 ? 0.5 : roundedHalf;
  }

  if (VAGUE_UNITS.includes(unit as Unit)) {
    const rounded = Math.round(raw);
    return rounded === 0 ? 1 : rounded;
  }

  if (QUARTER_STEP_UNITS.includes(unit as Unit)) {
    const rounded = Math.round(raw / 0.25) * 0.25;
    return rounded === 0 ? 0.25 : round2(rounded);
  }

  if (unit === 'g' || unit === 'ml') {
    const step = raw < 100 ? 5 : 10;
    const rounded = Math.round(raw / step) * step;
    return rounded === 0 ? step : rounded;
  }

  if (unit === 'kg' || unit === 'l') {
    return round2(raw);
  }

  return round2(raw);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const VULGAR_FRACTIONS: Record<string, string> = {
  '0.25': '¼',
  '0.5': '½',
  '0.75': '¾',
};

/**
 * Formats a quantity for display: vulgar fractions (¼ ½ ¾) for the
 * quarter-step spoon/cup units and the half-steps a scaled-down count unit
 * (pcs/clove/slice/can/pack) can land on, plain trimmed decimals for
 * everything else. A null quantity (unspecified / "to taste") formats as an
 * empty string.
 */
export function formatQuantity(quantity: number | null, unit: Unit | string): string {
  if (quantity === null || quantity === undefined) return '';

  if (QUARTER_STEP_UNITS.includes(unit as Unit) || COUNT_UNITS.includes(unit as Unit)) {
    const whole = Math.floor(quantity);
    const frac = round2(quantity - whole);
    const fracStr = VULGAR_FRACTIONS[frac.toString()];
    if (fracStr) {
      return `${whole > 0 ? whole : ''}${fracStr} ${unit}`.trim();
    }
  }

  const trimmed = Number(quantity.toFixed(2)).toString();
  return `${trimmed} ${unit}`;
}
