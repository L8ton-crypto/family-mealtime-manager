import { describe, expect, it } from 'vitest';
import { wordBoundaryMatch, wordBoundaryPattern } from './textMatch';

describe('wordBoundaryMatch', () => {
  it('matches a plural term against a singular haystack word', () => {
    expect(wordBoundaryMatch('cream of mushroom soup', 'mushrooms')).toBe(true);
  });

  it('matches a singular term against a plural haystack word', () => {
    expect(wordBoundaryMatch('roasted mushrooms', 'mushroom')).toBe(true);
  });

  it('matches "kiwi" against "kiwis" and vice versa', () => {
    expect(wordBoundaryMatch('kiwis', 'kiwi')).toBe(true);
    expect(wordBoundaryMatch('kiwi fruit', 'kiwis')).toBe(true);
  });

  it('is word-boundary safe — "nut" does not match "nutmeg" or "coconut"', () => {
    expect(wordBoundaryMatch('a pinch of nutmeg', 'nut')).toBe(false);
    expect(wordBoundaryMatch('coconut milk', 'nut')).toBe(false);
  });

  it('is word-boundary safe — "ham" does not match "shame"', () => {
    expect(wordBoundaryMatch('what a shame', 'ham')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(wordBoundaryMatch('Chicken Curry', 'CHICKEN')).toBe(true);
  });

  it('returns false for an empty or whitespace-only term', () => {
    expect(wordBoundaryMatch('anything', '')).toBe(false);
    expect(wordBoundaryMatch('anything', '   ')).toBe(false);
  });

  it('trims the term before matching', () => {
    expect(wordBoundaryMatch('roasted mushrooms', '  mushroom  ')).toBe(true);
  });
});

describe('wordBoundaryPattern', () => {
  it('returns null for an empty term', () => {
    expect(wordBoundaryPattern('')).toBeNull();
  });

  it('escapes regex-special characters in the term', () => {
    const pattern = wordBoundaryPattern('mac+cheese');
    expect(pattern).not.toBeNull();
    expect(pattern!.test('a mac+cheese bake')).toBe(true);
  });
});
