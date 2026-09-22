// Slice 3's "primary protein" concept, used by score.ts to penalise the same
// protein turning up on consecutive days. See docs/slices/03-engine.md,
// "Variety" — "Primary protein = first meat-fish aisle ingredient's
// keyword... vegetarian recipes have protein `veg` and are exempt from the
// alternation penalty."

export const PROTEINS = [
  'chicken',
  'beef',
  'pork',
  'lamb',
  'turkey',
  'salmon',
  'cod',
  'tuna',
  'prawns',
  'sausage',
  'bacon',
  // A meat-fish ingredient that doesn't match any named keyword below (e.g.
  // "duck breast") still isn't vegetarian — it gets this catch-all rather
  // than being silently treated as 'veg' (which would wrongly exempt it
  // from the alternation penalty).
  'other',
  'veg',
] as const;
export type Protein = (typeof PROTEINS)[number];

export interface ProteinIngredientLike {
  name: string;
  aisle: string;
  optional: boolean;
}

// Checked in order — "lamb mince"/"turkey mince" must be tested before the
// bare "mince" -> beef fallback, and before the bare "lamb"/"turkey" checks
// so "lamb mince" doesn't fall through to plain "lamb" first (same result
// here, but keeps the mapping unambiguous for ingredients that might one day
// read e.g. "minced lamb").
const PROTEIN_KEYWORDS: [RegExp, Protein][] = [
  [/\blamb mince\b/i, 'lamb'],
  [/\bturkey mince\b/i, 'turkey'],
  [/\bchicken\b/i, 'chicken'],
  [/\bbeef\b/i, 'beef'],
  [/\bpork\b/i, 'pork'],
  [/\blamb\b/i, 'lamb'],
  [/\bturkey\b/i, 'turkey'],
  [/\bsalmon\b/i, 'salmon'],
  [/\bcod\b/i, 'cod'],
  [/\btuna\b/i, 'tuna'],
  [/\bprawns?\b/i, 'prawns'],
  [/\bsausages?\b/i, 'sausage'],
  [/\bbacon\b/i, 'bacon'],
  [/\bmince\b/i, 'beef'],
];

/**
 * The dish's primary protein: the keyword matched on the FIRST non-optional
 * meat-fish-aisle ingredient (by list position), not a scan of every
 * ingredient for a known keyword. A recipe with no meat-fish ingredient at
 * all is 'veg' (exempt from the same-protein-as-yesterday penalty); one with
 * a meat-fish ingredient whose name matches none of the known keywords is
 * 'other' (still a penalisable protein, just an unnamed one).
 */
export function primaryProtein(ingredients: ProteinIngredientLike[]): Protein {
  const first = ingredients.find((i) => !i.optional && i.aisle === 'meat-fish');
  if (!first) return 'veg';
  for (const [pattern, protein] of PROTEIN_KEYWORDS) {
    if (pattern.test(first.name)) return protein;
  }
  return 'other';
}
