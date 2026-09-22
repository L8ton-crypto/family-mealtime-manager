import { describe, expect, it } from 'vitest';
import { comparePlanEntries, comparePlanEntriesForHistory, mealSlotIndex } from './planOrder';
import { MEAL_TYPES } from './vocab';

describe('mealSlotIndex', () => {
  it('orders breakfast < lunch < dinner < snack, not alphabetically', () => {
    expect(mealSlotIndex('breakfast')).toBeLessThan(mealSlotIndex('lunch'));
    expect(mealSlotIndex('lunch')).toBeLessThan(mealSlotIndex('dinner'));
    expect(mealSlotIndex('dinner')).toBeLessThan(mealSlotIndex('snack'));
  });

  it('matches MEAL_TYPES order exactly', () => {
    MEAL_TYPES.forEach((slot, i) => expect(mealSlotIndex(slot)).toBe(i));
  });
});

describe('comparePlanEntries', () => {
  it('sorts four same-day entries into breakfast, lunch, dinner, snack order, not alphabetical', () => {
    const entries = [
      { service_date: '2026-09-22', slot: 'snack' as const, position: 0, id: 4 },
      { service_date: '2026-09-22', slot: 'dinner' as const, position: 0, id: 3 },
      { service_date: '2026-09-22', slot: 'breakfast' as const, position: 0, id: 1 },
      { service_date: '2026-09-22', slot: 'lunch' as const, position: 0, id: 2 },
    ];
    const sorted = [...entries].sort(comparePlanEntries);
    expect(sorted.map((e) => e.slot)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
  });

  it('sorts by service_date first, before slot', () => {
    const entries = [
      { service_date: '2026-09-23', slot: 'breakfast' as const, position: 0, id: 2 },
      { service_date: '2026-09-22', slot: 'snack' as const, position: 0, id: 1 },
    ];
    const sorted = [...entries].sort(comparePlanEntries);
    expect(sorted.map((e) => e.id)).toEqual([1, 2]);
  });

  it('sorts by position within the same day and slot (several tickets per slot)', () => {
    const entries = [
      { service_date: '2026-09-22', slot: 'dinner' as const, position: 2, id: 3 },
      { service_date: '2026-09-22', slot: 'dinner' as const, position: 0, id: 1 },
      { service_date: '2026-09-22', slot: 'dinner' as const, position: 1, id: 2 },
    ];
    const sorted = [...entries].sort(comparePlanEntries);
    expect(sorted.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('falls back to id when service_date, slot and position are all equal', () => {
    const entries = [
      { service_date: '2026-09-22', slot: 'dinner' as const, position: 0, id: 9 },
      { service_date: '2026-09-22', slot: 'dinner' as const, position: 0, id: 5 },
    ];
    const sorted = [...entries].sort(comparePlanEntries);
    expect(sorted.map((e) => e.id)).toEqual([5, 9]);
  });
});

describe('comparePlanEntriesForHistory', () => {
  it('sorts by service_date DESCENDING (newest first)', () => {
    const entries = [
      { service_date: '2026-09-20', slot: 'dinner' as const, position: 0, id: 1 },
      { service_date: '2026-09-22', slot: 'dinner' as const, position: 0, id: 2 },
      { service_date: '2026-09-21', slot: 'dinner' as const, position: 0, id: 3 },
    ];
    const sorted = [...entries].sort(comparePlanEntriesForHistory);
    expect(sorted.map((e) => e.service_date)).toEqual(['2026-09-22', '2026-09-21', '2026-09-20']);
  });

  it('still orders each day\'s own entries breakfast..snack (ascending), not alphabetically, within the newest-first list', () => {
    const entries = [
      { service_date: '2026-09-22', slot: 'snack' as const, position: 0, id: 4 },
      { service_date: '2026-09-22', slot: 'breakfast' as const, position: 0, id: 1 },
      { service_date: '2026-09-22', slot: 'dinner' as const, position: 0, id: 3 },
      { service_date: '2026-09-22', slot: 'lunch' as const, position: 0, id: 2 },
    ];
    const sorted = [...entries].sort(comparePlanEntriesForHistory);
    expect(sorted.map((e) => e.slot)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
  });
});
