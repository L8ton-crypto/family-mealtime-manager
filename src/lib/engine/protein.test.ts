import { describe, expect, it } from 'vitest';
import { primaryProtein } from './protein';

function ing(name: string, aisle = 'meat-fish', optional = false) {
  return { name, aisle, optional };
}

describe('primaryProtein', () => {
  it('is veg when there is no meat-fish ingredient at all', () => {
    expect(primaryProtein([ing('rice', 'pantry'), ing('chickpeas', 'pantry')])).toBe('veg');
  });

  it('is veg when the only meat-fish ingredient is optional', () => {
    expect(primaryProtein([ing('tuna', 'meat-fish', true), ing('rice', 'pantry')])).toBe('veg');
  });

  it('matches the first non-optional meat-fish ingredient, not any later one', () => {
    // "smoked bacon" (meat-fish) comes before "chicken thighs" — the FIRST
    // one wins, even though chicken is earlier alphabetically/in the keyword list.
    expect(primaryProtein([ing('smoked bacon'), ing('chicken thighs')])).toBe('bacon');
  });

  it('skips an optional meat-fish ingredient to find the first real one', () => {
    expect(primaryProtein([ing('garnish prawns', 'meat-fish', true), ing('chicken breast')])).toBe('chicken');
  });

  it.each([
    ['chicken breast', 'chicken'],
    ['beef mince', 'beef'],
    ['pork shoulder', 'pork'],
    ['lamb shanks', 'lamb'],
    ['turkey breast', 'turkey'],
    ['salmon fillets', 'salmon'],
    ['cod loin', 'cod'],
    ['tuna steak', 'tuna'],
    ['king prawns', 'prawns'],
    ['sausages', 'sausage'],
    ['smoked bacon', 'bacon'],
  ])('maps %s -> %s', (name, expected) => {
    expect(primaryProtein([ing(name)])).toBe(expected);
  });

  it('maps bare "mince" to beef', () => {
    expect(primaryProtein([ing('mince')])).toBe('beef');
  });

  it('maps "lamb mince" to lamb, not beef', () => {
    expect(primaryProtein([ing('lamb mince')])).toBe('lamb');
  });

  it('maps "turkey mince" to turkey, not beef', () => {
    expect(primaryProtein([ing('turkey mince')])).toBe('turkey');
  });

  it('falls back to "other" for an unrecognised meat-fish ingredient', () => {
    expect(primaryProtein([ing('duck breast')])).toBe('other');
  });
});
