import { describe, expect, it } from 'vitest';
import { deriveAllergens, tagConflicts, scaleQuantity, formatQuantity } from './recipes';
import recipesFixture from '../../db/seed/recipes.json';

describe('deriveAllergens', () => {
  it('unions allergens across non-optional ingredients', () => {
    const result = deriveAllergens([
      { name: 'flour', allergens: ['gluten'], optional: false },
      { name: 'milk', allergens: ['dairy'], optional: false },
    ]);
    expect(result.sort()).toEqual(['dairy', 'gluten']);
  });

  it('excludes optional ingredients', () => {
    const result = deriveAllergens([
      { name: 'prawns', allergens: ['shellfish'], optional: true },
      { name: 'rice', allergens: [], optional: false },
    ]);
    expect(result).toEqual([]);
  });

  it('de-duplicates', () => {
    const result = deriveAllergens([
      { name: 'butter', allergens: ['dairy'], optional: false },
      { name: 'milk', allergens: ['dairy'], optional: false },
    ]);
    expect(result).toEqual(['dairy']);
  });
});

describe('tagConflicts', () => {
  it('flags a vegetarian dish containing meat', () => {
    const conflicts = tagConflicts(['vegetarian'], [
      { name: 'chicken thighs', aisle: 'meat-fish', allergens: [], optional: false },
    ]);
    expect(conflicts).toEqual(['Tagged vegetarian but contains chicken thighs (meat-fish aisle)']);
  });

  it('does not flag an optional meat ingredient', () => {
    const conflicts = tagConflicts(['vegetarian'], [
      { name: 'tuna', aisle: 'meat-fish', allergens: ['fish'], optional: true },
      { name: 'potatoes', aisle: 'produce', allergens: [], optional: false },
    ]);
    expect(conflicts).toEqual([]);
  });

  it('flags a vegan dish containing eggs', () => {
    const conflicts = tagConflicts(['vegan'], [
      { name: 'eggs', aisle: 'dairy-eggs', allergens: ['eggs'], optional: false },
    ]);
    expect(conflicts).toContain('Tagged vegan but contains eggs');
  });

  it('flags a vegan dish containing dairy', () => {
    const conflicts = tagConflicts(['vegan'], [
      { name: 'butter', aisle: 'dairy-eggs', allergens: ['dairy'], optional: false },
    ]);
    expect(conflicts).toContain('Tagged vegan but contains dairy');
  });

  it('flags a vegan dish containing meat', () => {
    const conflicts = tagConflicts(['vegan'], [
      { name: 'beef mince', aisle: 'meat-fish', allergens: [], optional: false },
    ]);
    expect(conflicts).toEqual(['Tagged vegan but contains beef mince (meat-fish aisle)']);
  });

  // QA fixes (2026-09-22) — gelatine/honey.
  it('flags a vegetarian dish containing gelatine', () => {
    const conflicts = tagConflicts(['vegetarian'], [
      { name: 'gelatine', aisle: 'pantry', allergens: [], optional: false },
    ]);
    expect(conflicts).toEqual(['Tagged vegetarian but contains gelatine (gelatine is not vegetarian)']);
  });

  it('flags a vegan dish containing gelatine', () => {
    const conflicts = tagConflicts(['vegan'], [
      { name: 'gelatine', aisle: 'pantry', allergens: [], optional: false },
    ]);
    expect(conflicts).toEqual(['Tagged vegan but contains gelatine (gelatine is not vegan)']);
  });

  it('flags a vegan dish containing honey, but not a vegetarian one', () => {
    const veganConflicts = tagConflicts(['vegan'], [
      { name: 'honey', aisle: 'pantry', allergens: [], optional: false },
    ]);
    expect(veganConflicts).toEqual(['Tagged vegan but contains honey (honey is not vegan)']);

    const vegetarianConflicts = tagConflicts(['vegetarian'], [
      { name: 'honey', aisle: 'pantry', allergens: [], optional: false },
    ]);
    expect(vegetarianConflicts).toEqual([]);
  });

  it('flags a gluten-free dish that carries gluten, naming the ingredient', () => {
    const conflicts = tagConflicts(['gluten-free'], [
      { name: 'plain flour', aisle: 'bakery', allergens: ['gluten'], optional: false },
    ]);
    expect(conflicts).toEqual(['Tagged gluten-free but plain flour carries gluten']);
  });

  it('flags a dairy-free dish that carries dairy, naming the ingredient', () => {
    const conflicts = tagConflicts(['dairy-free'], [
      { name: 'butter', aisle: 'dairy-eggs', allergens: ['dairy'], optional: false },
    ]);
    expect(conflicts).toEqual(['Tagged dairy-free but butter carries dairy']);
  });

  it('flags a pescatarian dish containing non-seafood meat', () => {
    const conflicts = tagConflicts(['pescatarian'], [
      { name: 'bacon', aisle: 'meat-fish', allergens: [], optional: false },
    ]);
    expect(conflicts.length).toBe(1);
  });

  it('does not flag a pescatarian dish containing fish', () => {
    const conflicts = tagConflicts(['pescatarian'], [
      { name: 'salmon', aisle: 'meat-fish', allergens: ['fish'], optional: false },
    ]);
    expect(conflicts).toEqual([]);
  });

  it('returns nothing for a clean match', () => {
    const conflicts = tagConflicts(['vegetarian', 'gluten-free'], [
      { name: 'rice', aisle: 'pantry', allergens: [], optional: false },
    ]);
    expect(conflicts).toEqual([]);
  });

  it('has zero conflicts across every seeded recipe', () => {
    interface SeedIngredient {
      name: string;
      aisle: string;
      allergens: string[];
      optional: boolean;
    }
    interface SeedRecipe {
      name: string;
      tags: string[];
      ingredients: SeedIngredient[];
    }
    const recipes = recipesFixture as SeedRecipe[];
    expect(recipes.length).toBeGreaterThanOrEqual(34);
    for (const recipe of recipes) {
      const conflicts = tagConflicts(recipe.tags, recipe.ingredients);
      expect(conflicts, `${recipe.name}: ${conflicts.join('; ')}`).toEqual([]);
    }
  });

  it('every seeded recipe has at least 3 ingredients and 3 method steps', () => {
    interface SeedRecipe {
      name: string;
      ingredients: unknown[];
      method: unknown[];
    }
    const recipes = recipesFixture as SeedRecipe[];
    for (const recipe of recipes) {
      expect(recipe.ingredients.length, `${recipe.name} ingredients`).toBeGreaterThanOrEqual(3);
      expect(recipe.method.length, `${recipe.name} method`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('scaleQuantity', () => {
  it('scales tsp with quarter-step rounding: 1 tsp at 4 -> ½ (0.5) at 2', () => {
    expect(scaleQuantity(1, 'tsp', 4, 2)).toBe(0.5);
  });

  it('scales pcs with whole-number rounding: 3 pcs at 4 -> 5 pcs at 6', () => {
    expect(scaleQuantity(3, 'pcs', 4, 6)).toBe(5);
  });

  it('scales g in 5-unit steps under 100', () => {
    expect(scaleQuantity(40, 'g', 4, 5)).toBe(50);
  });

  it('scales g in 10-unit steps at 100+', () => {
    expect(scaleQuantity(400, 'g', 4, 5)).toBe(500);
  });

  it('scales kg to 2 decimal places', () => {
    expect(scaleQuantity(1, 'kg', 4, 6)).toBe(1.5);
  });

  it('returns null for a null quantity', () => {
    expect(scaleQuantity(null, 'tsp', 4, 2)).toBeNull();
  });

  it('never rounds a positive quantity down to zero', () => {
    expect(scaleQuantity(1, 'pcs', 8, 1)).toBeGreaterThan(0);
  });

  // QA fixes (2026-09-22) — count units below 1 round to a half-step
  // instead of clamping straight up to a whole "1".
  it('scales a count unit below 0.75 to the nearest half-step: 1 pcs at 4 -> 2 gives 0.5', () => {
    expect(scaleQuantity(1, 'pcs', 4, 2)).toBe(0.5);
  });

  it('scales a count unit at or above 0.75 up to a whole number as usual', () => {
    expect(scaleQuantity(3, 'pcs', 4, 3)).toBe(2); // raw = 2.25 -> round to 2
    expect(scaleQuantity(3, 'can', 4, 1)).toBe(1); // raw = 0.75 -> rounds up to 1
  });

  it('never returns 0.5-stepped 0 for a positive count-unit quantity', () => {
    expect(scaleQuantity(1, 'clove', 16, 1)).toBe(0.5); // raw = 0.0625, well under 0.75
  });

  it('applies the half-step rule to clove, slice, can and pack alike', () => {
    expect(scaleQuantity(1, 'clove', 4, 2)).toBe(0.5);
    expect(scaleQuantity(1, 'slice', 4, 2)).toBe(0.5);
    expect(scaleQuantity(1, 'can', 4, 2)).toBe(0.5);
    expect(scaleQuantity(1, 'pack', 4, 2)).toBe(0.5);
  });

  it('keeps pinch and handful as plain whole-number rounding with a floor of 1', () => {
    expect(scaleQuantity(1, 'pinch', 8, 1)).toBe(1);
    expect(scaleQuantity(1, 'handful', 8, 1)).toBe(1);
  });
});

describe('formatQuantity', () => {
  it('formats a half teaspoon as a vulgar fraction', () => {
    expect(formatQuantity(0.5, 'tsp')).toBe('½ tsp');
  });

  it('formats a quarter and three-quarter cup as vulgar fractions', () => {
    expect(formatQuantity(0.25, 'cup')).toBe('¼ cup');
    expect(formatQuantity(0.75, 'cup')).toBe('¾ cup');
  });

  it('formats a half-step count unit as a vulgar fraction', () => {
    expect(formatQuantity(0.5, 'pcs')).toBe('½ pcs');
    expect(formatQuantity(0.5, 'can')).toBe('½ can');
  });

  it('combines a whole number with a fraction', () => {
    expect(formatQuantity(1.25, 'tsp')).toBe('1¼ tsp');
  });

  it('formats kilograms as a plain decimal', () => {
    expect(formatQuantity(1.5, 'kg')).toBe('1.5 kg');
  });

  it('formats pieces as a plain integer', () => {
    expect(formatQuantity(2, 'pcs')).toBe('2 pcs');
  });

  it('formats a null quantity as an empty string', () => {
    expect(formatQuantity(null, 'pinch')).toBe('');
  });
});
