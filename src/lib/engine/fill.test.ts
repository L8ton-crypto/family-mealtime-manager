import { describe, expect, it } from 'vitest';
import { fillWeek, type ExistingSlotEntry, type FillParams } from './fill';
import type { EngineMember, EngineRecipe } from './score';

function existingEntry(overrides: Partial<ExistingSlotEntry> & Pick<ExistingSlotEntry, 'day' | 'slot'>): ExistingSlotEntry {
  return { entryId: 1, name: 'Existing Dish', status: 'planned', ...overrides };
}

function recipe(overrides: Partial<EngineRecipe> = {}): EngineRecipe {
  return {
    id: 1,
    name: 'Dish',
    tags: [],
    mealTypes: ['dinner'],
    ingredients: [{ name: 'rice', aisle: 'pantry', allergens: [], optional: false }],
    prepMinutes: 10,
    cookMinutes: 10,
    favourite: false,
    archived: false,
    ...overrides,
  };
}

function member(overrides: Partial<EngineMember> = {}): EngineMember {
  return {
    id: 1,
    name: 'Ada',
    ageGroup: 'adult',
    likes: [],
    dislikes: [],
    restrictions: [],
    allergies: [],
    ...overrides,
  };
}

function baseParams(overrides: Partial<FillParams> = {}): FillParams {
  return {
    days: ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'],
    slots: ['dinner'],
    recipes: [],
    members: [member()],
    attendeesByDefault: [1],
    history: [],
    ratings: [],
    seed: 'fill-test-seed',
    keepExisting: true,
    existing: [],
    // Matches the earliest day most tests' own `days` array starts on, so
    // setting this default doesn't silently filter anything out of any
    // existing test — see the dedicated "skips days before today" tests below.
    today: '2026-09-21',
    ...overrides,
  };
}

describe('fillWeek', () => {
  it('proposes a distinct dish for every day when there are enough safe candidates, never repeating one', () => {
    const recipes = Array.from({ length: 10 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
    const proposals = fillWeek(baseParams({ recipes }));
    expect(proposals).toHaveLength(7);
    const ids = proposals.map((p) => p.recipeId).filter((id): id is number => id !== undefined);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7); // never the same recipe twice in one run
    for (const p of proposals) {
      if (p.recipeId !== undefined) {
        expect(p.headline).toBeTruthy();
      }
    }
  });

  it('respects keepExisting: skips a day/slot that already has a planned entry', () => {
    const recipes = Array.from({ length: 10 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
    const proposals = fillWeek(
      baseParams({
        recipes,
        keepExisting: true,
        existing: [
          existingEntry({ day: '2026-09-21', slot: 'dinner' }),
          existingEntry({ day: '2026-09-24', slot: 'dinner' }),
        ],
      })
    );
    // 7 days, 2 already occupied -> 5 proposals
    expect(proposals).toHaveLength(5);
    expect(proposals.some((p) => p.day === '2026-09-21')).toBe(false);
    expect(proposals.some((p) => p.day === '2026-09-24')).toBe(false);
  });

  describe('keepExisting=false — REPLACE semantics (QA, second pass)', () => {
    it('proposes for a slot that only holds a PLANNED entry, and the proposal lists it in `replaces`', () => {
      const recipes = Array.from({ length: 10 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
      const proposals = fillWeek(
        baseParams({
          recipes,
          days: ['2026-09-22'],
          keepExisting: false,
          existing: [existingEntry({ day: '2026-09-22', slot: 'dinner', entryId: 29, name: 'Chicken Fajitas' })],
        })
      );
      expect(proposals).toHaveLength(1);
      expect(proposals[0].recipeId).toBeDefined();
      expect(proposals[0].replaces).toEqual([{ entryId: 29, name: 'Chicken Fajitas' }]);
    });

    it('lists every planned entry in a slot when several share it', () => {
      const recipes = Array.from({ length: 10 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
      const proposals = fillWeek(
        baseParams({
          recipes,
          days: ['2026-09-22'],
          keepExisting: false,
          existing: [
            existingEntry({ day: '2026-09-22', slot: 'dinner', entryId: 1, name: 'Leftovers' }),
            existingEntry({ day: '2026-09-22', slot: 'dinner', entryId: 2, name: 'Takeaway' }),
          ],
        })
      );
      expect(proposals[0].replaces).toEqual([
        { entryId: 1, name: 'Leftovers' },
        { entryId: 2, name: 'Takeaway' },
      ]);
    });

    it('NEVER replaces a PLATED entry — that slot is skipped entirely, even with keepExisting off', () => {
      const recipes = Array.from({ length: 10 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
      const proposals = fillWeek(
        baseParams({
          recipes,
          days: ['2026-09-22'],
          keepExisting: false,
          existing: [existingEntry({ day: '2026-09-22', slot: 'dinner', status: 'plated' })],
        })
      );
      expect(proposals).toHaveLength(0);
    });

    it('NEVER replaces an EIGHTYSIXED entry — that slot is skipped entirely, even with keepExisting off', () => {
      const recipes = Array.from({ length: 10 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
      const proposals = fillWeek(
        baseParams({
          recipes,
          days: ['2026-09-22'],
          keepExisting: false,
          existing: [existingEntry({ day: '2026-09-22', slot: 'dinner', status: 'eightysixed' })],
        })
      );
      expect(proposals).toHaveLength(0);
    });

    it('proposes for an empty slot with no `replaces` field at all', () => {
      const recipes = Array.from({ length: 10 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
      const proposals = fillWeek(baseParams({ recipes, days: ['2026-09-22'], keepExisting: false, existing: [] }));
      expect(proposals[0].replaces).toBeUndefined();
    });
  });

  it('applies protein alternation across its OWN proposals within the run', () => {
    // Day 1: chickenA wins clearly (favourite + quick bonuses dominate any
    // possible jitter spread). Day 2: chickenB (same protein as chickenA,
    // which day 1 just proposed) is penalised -10 for repeating yesterday's
    // protein, so vegDish should win instead — even though chickenB and
    // vegDish would otherwise tie exactly.
    const chickenA = recipe({
      id: 1,
      name: 'Chicken A',
      favourite: true,
      tags: ['quick'],
      ingredients: [{ name: 'chicken breast', aisle: 'meat-fish', allergens: [], optional: false }],
    });
    const chickenB = recipe({
      id: 2,
      name: 'Chicken B',
      ingredients: [{ name: 'chicken thighs', aisle: 'meat-fish', allergens: [], optional: false }],
    });
    const vegDish = recipe({ id: 3, name: 'Veg Dish', ingredients: [{ name: 'lentils', aisle: 'pantry', allergens: [], optional: false }] });

    const proposals = fillWeek(
      baseParams({
        days: ['2026-09-22', '2026-09-23'], // Tuesday, Wednesday
        recipes: [chickenA, chickenB, vegDish],
      })
    );

    expect(proposals[0].recipeId).toBe(1); // chickenA
    expect(proposals[1].recipeId).toBe(3); // vegDish, not chickenB
  });

  it('emits a gap when nothing is safe for the covers', () => {
    const fishPie = recipe({ ingredients: [{ name: 'cod', aisle: 'meat-fish', allergens: ['fish'], optional: false }] });
    const ada = member({ name: 'Ada', allergies: ['fish'] });
    const proposals = fillWeek(
      baseParams({
        days: ['2026-09-22'],
        recipes: [fishPie],
        members: [ada],
        attendeesByDefault: [1],
      })
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].gap).toBe('No safe dish for these covers');
    expect(proposals[0].recipeId).toBeUndefined();
  });

  it('emits a gap when there are no candidate recipes at all', () => {
    const proposals = fillWeek(baseParams({ days: ['2026-09-22'], recipes: [] }));
    expect(proposals[0].gap).toBe('No safe dish for these covers');
  });

  // Slice 4 carry-over fix: Fire the week must never propose a dish for a
  // day that's already in the past — not even a gap ticket for it.
  describe('never proposes for a day before today', () => {
    it('skips a past day entirely (no proposal, not even a gap)', () => {
      const recipes = Array.from({ length: 5 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
      const proposals = fillWeek(
        baseParams({
          recipes,
          days: ['2026-09-19', '2026-09-20', '2026-09-21'], // Sat, Sun, Mon
          today: '2026-09-21', // Monday — Saturday and Sunday are already past
        })
      );
      expect(proposals).toHaveLength(1);
      expect(proposals[0].day).toBe('2026-09-21');
    });

    it('proposes for today itself — "today" is not skipped, only days strictly before it', () => {
      const recipes = Array.from({ length: 5 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
      const proposals = fillWeek(
        baseParams({ recipes, days: ['2026-09-20', '2026-09-21'], today: '2026-09-21' })
      );
      expect(proposals).toHaveLength(1);
      expect(proposals[0].day).toBe('2026-09-21');
    });

    it('returns no proposals at all when every requested day is in the past', () => {
      const recipes = Array.from({ length: 5 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
      const proposals = fillWeek(
        baseParams({ recipes, days: ['2026-09-18', '2026-09-19', '2026-09-20'], today: '2026-09-21' })
      );
      expect(proposals).toHaveLength(0);
    });
  });

  it('is deterministic: the same seed produces the same sequence of picks', () => {
    const recipes = Array.from({ length: 6 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
    const a = fillWeek(baseParams({ recipes, seed: 'same-seed' }));
    const b = fillWeek(baseParams({ recipes, seed: 'same-seed' }));
    expect(a.map((p) => p.recipeId)).toEqual(b.map((p) => p.recipeId));
  });

  it('a different seed can produce a different sequence (jitter breaks otherwise-tied scores)', () => {
    // 6 dishes, all scoring identically apart from jitter -> the day-1 winner
    // depends on which seed's jitter favours which id.
    const recipes = Array.from({ length: 6 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
    const days = ['2026-09-22'];
    const winners = new Set(
      Array.from({ length: 15 }, (_, i) => fillWeek(baseParams({ recipes, days, seed: `seed-${i}` }))[0].recipeId)
    );
    expect(winners.size).toBeGreaterThan(1);
  });

  it('alternatives list up to 4 of the next-best scored recipes, excluding the winner', () => {
    const recipes = Array.from({ length: 8 }, (_, i) => recipe({ id: i + 1, name: `Dish ${i + 1}` }));
    const proposals = fillWeek(baseParams({ recipes, days: ['2026-09-22'] }));
    const [first] = proposals;
    expect(first.recipeId).toBeDefined();
    if (first.recipeId !== undefined) {
      expect(first.alternatives.length).toBeLessThanOrEqual(4);
      expect(first.alternatives.every((a) => a.recipeId !== first.recipeId)).toBe(true);
    }
  });
});
