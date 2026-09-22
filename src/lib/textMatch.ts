// Shared word-boundary, singular/plural-tolerant text matching — used
// anywhere a free-text term (a member's custom allergy, a like/dislike) is
// matched against a dish's name or ingredient list. One implementation so
// engine/compat.ts and engine/score.ts can never drift on what counts as a
// match. QA (Slice 3, second pass): score.ts's like/dislike matching used to
// be plain word-boundary only, so "mushrooms" as a dislike didn't match a
// recipe's singular "mushroom" ingredient — this fixes that by reusing
// compat.ts's already-correct singular/plural rule everywhere.

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a case-insensitive, word-boundary regex for `term` that also
 * tolerates a trailing "s" either way: a trailing "s" on `term` itself is
 * stripped first, then an optional trailing "s" is allowed back on the
 * match, so "mushroom" <-> "mushrooms" and "kiwi" <-> "kiwis" all match each
 * other regardless of which form the term or the haystack uses. Returns
 * null for an empty/whitespace-only term (nothing to match).
 */
export function wordBoundaryPattern(term: string): RegExp | null {
  const normalized = term.trim().toLowerCase().replace(/s$/, '');
  if (!normalized) return null;
  return new RegExp(`\\b${escapeRegExp(normalized)}s?\\b`, 'i');
}

/** True when `term` (singular/plural tolerant, word-boundary safe) appears anywhere in `haystack`. */
export function wordBoundaryMatch(haystack: string, term: string): boolean {
  const pattern = wordBoundaryPattern(term);
  return pattern ? pattern.test(haystack) : false;
}
