import { describe, expect, it } from 'vitest';
import { compatibility } from './compat';

const ada = { id: 1, name: 'Ada', restrictions: [], allergies: ['fish'] };

describe('compatibility', () => {
  it('is unsafe for a member allergic to an ingredient in the dish', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'cod fillets', aisle: 'meat-fish', allergens: ['fish'], optional: false }],
      },
      [ada]
    );
    expect(result.safe).toBe(false);
    expect(result.conflicts).toEqual([{ memberId: 1, memberName: 'Ada', reason: 'Allergic to fish' }]);
  });

  it('is safe when the allergen only appears on an optional ingredient', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [
          { name: 'tuna', aisle: 'meat-fish', allergens: ['fish'], optional: true },
          { name: 'potatoes', aisle: 'produce', allergens: [], optional: false },
        ],
      },
      [ada]
    );
    expect(result.safe).toBe(true);
  });

  it('is safe when nobody has a conflicting allergy or restriction', () => {
    const result = compatibility(
      {
        tags: ['dinner', 'vegetarian'],
        ingredients: [{ name: 'rice', aisle: 'pantry', allergens: [], optional: false }],
      },
      [{ id: 2, name: 'Ben', restrictions: [], allergies: ['nuts'] }]
    );
    expect(result.safe).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it('flags a vegetarian member against an untagged dish with meat', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'chicken thighs', aisle: 'meat-fish', allergens: [], optional: false }],
      },
      [{ id: 3, name: 'Cara', restrictions: ['vegetarian'], allergies: [] }]
    );
    expect(result.safe).toBe(false);
    expect(result.conflicts[0].reason).toMatch(/vegetarian/i);
  });

  it('does not flag a vegetarian member against a dish tagged vegan', () => {
    const result = compatibility(
      {
        tags: ['dinner', 'vegan'],
        ingredients: [{ name: 'lentils', aisle: 'pantry', allergens: [], optional: false }],
      },
      [{ id: 3, name: 'Cara', restrictions: ['vegetarian'], allergies: [] }]
    );
    expect(result.safe).toBe(true);
  });

  it('flags a vegan member against a dish only tagged vegetarian', () => {
    const result = compatibility(
      {
        tags: ['dinner', 'vegetarian'],
        ingredients: [{ name: 'cheese', aisle: 'dairy-eggs', allergens: ['dairy'], optional: false }],
      },
      [{ id: 4, name: 'Dee', restrictions: ['vegan'], allergies: [] }]
    );
    expect(result.safe).toBe(false);
  });

  it('flags a gluten-free member against a dish containing gluten', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'plain flour', aisle: 'bakery', allergens: ['gluten'], optional: false }],
      },
      [{ id: 5, name: 'Eli', restrictions: ['gluten-free'], allergies: [] }]
    );
    expect(result.safe).toBe(false);
  });

  it('flags a dairy-free member against a dish containing dairy', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'butter', aisle: 'dairy-eggs', allergens: ['dairy'], optional: false }],
      },
      [{ id: 6, name: 'Fen', restrictions: ['dairy-free'], allergies: [] }]
    );
    expect(result.safe).toBe(false);
  });

  it('flags a pescatarian member against a dish with non-seafood meat', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'bacon', aisle: 'meat-fish', allergens: [], optional: false }],
      },
      [{ id: 7, name: 'Gus', restrictions: ['pescatarian'], allergies: [] }]
    );
    expect(result.safe).toBe(false);
  });

  it('does not flag a pescatarian member against a dish with fish', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'salmon fillets', aisle: 'meat-fish', allergens: ['fish'], optional: false }],
      },
      [{ id: 7, name: 'Gus', restrictions: ['pescatarian'], allergies: [] }]
    );
    expect(result.safe).toBe(true);
  });

  it('flags a halal member against a dish naming pork', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'pork sausages', aisle: 'meat-fish', allergens: [], optional: false }],
      },
      [{ id: 8, name: 'Hal', restrictions: ['halal'], allergies: [] }]
    );
    expect(result.safe).toBe(false);
  });

  it('flags a kosher member against shellfish', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'king prawns', aisle: 'meat-fish', allergens: ['shellfish'], optional: false }],
      },
      [{ id: 9, name: 'Ivy', restrictions: ['kosher'], allergies: [] }]
    );
    expect(result.safe).toBe(false);
  });

  it('does not flag halal/kosher members against a beef dish', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'beef mince', aisle: 'meat-fish', allergens: [], optional: false }],
      },
      [{ id: 10, name: 'Jae', restrictions: ['halal', 'kosher'], allergies: [] }]
    );
    expect(result.safe).toBe(true);
  });

  // QA fixes (2026-09-22) — custom (non-preset) member allergies.
  it('flags a custom allergy against an ingredient named after it, plural-tolerant', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'kiwi fruit', aisle: 'produce', allergens: [], optional: false }],
      },
      [{ id: 11, name: 'Ada', restrictions: [], allergies: ['kiwi'] }]
    );
    expect(result.safe).toBe(false);
    expect(result.conflicts).toEqual([{ memberId: 11, memberName: 'Ada', reason: 'Ada is allergic to kiwi (in: kiwi fruit)' }]);
  });

  it('flags a custom allergy against the plural form of an ingredient name', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'kiwis', aisle: 'produce', allergens: [], optional: false }],
      },
      [{ id: 11, name: 'Ada', restrictions: [], allergies: ['kiwi'] }]
    );
    expect(result.safe).toBe(false);
  });

  it('flags a custom allergy that exactly matches an ingredient name', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'ground nutmeg', aisle: 'spices', allergens: [], optional: false }],
      },
      [{ id: 12, name: 'Ben', restrictions: [], allergies: ['nutmeg'] }]
    );
    expect(result.safe).toBe(false);
  });

  it('does not let a custom "nut" allergy match nutmeg or coconut (word-boundary aware)', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [
          { name: 'ground nutmeg', aisle: 'spices', allergens: [], optional: false },
          { name: 'coconut milk', aisle: 'pantry', allergens: [], optional: false },
        ],
      },
      [{ id: 13, name: 'Cara', restrictions: [], allergies: ['nut'] }]
    );
    expect(result.safe).toBe(true);
  });

  it('flags a vegetarian member against a dish (even tagged vegetarian) that contains gelatine', () => {
    const result = compatibility(
      {
        tags: ['dinner', 'vegetarian'],
        ingredients: [{ name: 'gelatine', aisle: 'pantry', allergens: [], optional: false }],
      },
      [{ id: 14, name: 'Kai', restrictions: ['vegetarian'], allergies: [] }]
    );
    expect(result.safe).toBe(false);
    expect(result.conflicts.some((c) => c.reason.includes('gelatine'))).toBe(true);
  });

  it('flags a vegan member against a dish containing gelatine or honey', () => {
    const result = compatibility(
      {
        tags: ['dinner', 'vegan'],
        ingredients: [
          { name: 'gelatine', aisle: 'pantry', allergens: [], optional: false },
          { name: 'honey', aisle: 'pantry', allergens: [], optional: false },
        ],
      },
      [{ id: 15, name: 'Lin', restrictions: ['vegan'], allergies: [] }]
    );
    expect(result.safe).toBe(false);
    expect(result.conflicts.some((c) => c.reason.includes('gelatine'))).toBe(true);
    expect(result.conflicts.some((c) => c.reason.includes('honey'))).toBe(true);
  });

  it('does not flag a vegetarian member against a dish containing honey', () => {
    const result = compatibility(
      {
        tags: ['dinner', 'vegetarian'],
        ingredients: [{ name: 'honey', aisle: 'pantry', allergens: [], optional: false }],
      },
      [{ id: 16, name: 'Moe', restrictions: ['vegetarian'], allergies: [] }]
    );
    expect(result.safe).toBe(true);
  });

  it('does not flag a custom allergy that only appears on an optional ingredient', () => {
    const result = compatibility(
      {
        tags: ['dinner'],
        ingredients: [{ name: 'kiwi fruit', aisle: 'produce', allergens: [], optional: true }],
      },
      [{ id: 11, name: 'Ada', restrictions: [], allergies: ['kiwi'] }]
    );
    expect(result.safe).toBe(true);
  });
});
