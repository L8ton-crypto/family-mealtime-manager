import { MEAL_TYPES, type MealType } from './vocab';

// Postgres's own `ORDER BY slot ASC` is alphabetical — breakfast, dinner,
// lunch, snack — which is NOT a day's actual service order. This is the
// single source of truth for the correct chronological order, used
// everywhere a flat (cross-slot) list of plan entries needs to be sorted:
// plan-db.ts's list queries, /pass/history's per-day grouping, and The
// Table's "next service" lookup. The week grid itself doesn't need this —
// it buckets entries into one rail per slot, so ordering across slots never
// comes up there.

/** A slot's position in a day's service order: breakfast=0, lunch=1, dinner=2, snack=3. */
export function mealSlotIndex(slot: MealType): number {
  const index = MEAL_TYPES.indexOf(slot);
  return index === -1 ? MEAL_TYPES.length : index;
}

export interface OrderablePlanEntry {
  service_date: string;
  slot: MealType;
  position: number;
  id: number;
}

/**
 * Canonical ascending order for a flat list of plan entries: earliest
 * service_date first, then meal chronology within a day (not alphabetical),
 * then position (ticket order within a slot), then id as a final tie-break.
 */
export function comparePlanEntries(a: OrderablePlanEntry, b: OrderablePlanEntry): number {
  if (a.service_date !== b.service_date) return a.service_date < b.service_date ? -1 : 1;
  const slotDiff = mealSlotIndex(a.slot) - mealSlotIndex(b.slot);
  if (slotDiff !== 0) return slotDiff;
  if (a.position !== b.position) return a.position - b.position;
  return a.id - b.id;
}

/**
 * Same as comparePlanEntries but newest service_date first — for
 * /pass/history, which lists plated entries newest-first while still
 * keeping each day's own entries in service order (breakfast..snack), not
 * alphabetical.
 */
export function comparePlanEntriesForHistory(a: OrderablePlanEntry, b: OrderablePlanEntry): number {
  if (a.service_date !== b.service_date) return a.service_date < b.service_date ? 1 : -1;
  const slotDiff = mealSlotIndex(a.slot) - mealSlotIndex(b.slot);
  if (slotDiff !== 0) return slotDiff;
  if (a.position !== b.position) return a.position - b.position;
  return b.id - a.id;
}
