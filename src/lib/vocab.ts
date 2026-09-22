// Single source of truth for The Menu's controlled vocabularies, shared by
// zod validation (API routes) and the UI (selects, chip pickers). See
// docs/slices/01-menu.md "Schema" section.

import { ALLERGY_PRESETS, RESTRICTION_PRESETS } from './members-schema';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const TAGS = [
  'kid-friendly',
  'quick',
  'healthy',
  'comfort',
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'pescatarian',
  'slow-cook',
  'one-pan',
  'batch-cook',
  'freezer-friendly',
  'bbq',
  'sunday',
] as const;
export type Tag = (typeof TAGS)[number];

export const UNITS = [
  'g',
  'kg',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'pcs',
  'clove',
  'slice',
  'can',
  'pack',
  'pinch',
  'handful',
] as const;
export type Unit = (typeof UNITS)[number];

export const AISLES = [
  'produce',
  'meat-fish',
  'dairy-eggs',
  'bakery',
  'pantry',
  'frozen',
  'spices',
  'drinks',
  'household',
] as const;
export type Aisle = (typeof AISLES)[number];

// Same list as The Table (src/lib/members-schema.ts ALLERGY_PRESETS) — kept
// as one alias so the two can never drift apart.
export const ALLERGENS = ALLERGY_PRESETS;
export type Allergen = (typeof ALLERGENS)[number];

// Re-exported for engine/compat.ts, which reasons about member restrictions
// using the same preset list The Table validates against.
export const RESTRICTIONS = RESTRICTION_PRESETS;
export type Restriction = (typeof RESTRICTIONS)[number];

// Slice 3: how a plate came back. See docs/slices/03-engine.md.
export const VERDICTS = ['clean', 'half', 'left'] as const;
export type Verdict = (typeof VERDICTS)[number];
