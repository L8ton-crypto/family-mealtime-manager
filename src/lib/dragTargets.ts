// Pure id builders/parsers for The Pass's dnd-kit drag-and-drop (docs/slices/06
// "Part B"). dnd-kit identifies draggables and droppables by an opaque
// `UniqueIdentifier` (string | number) — these are the single source of
// truth for that string shape, so DraggableTicket/DroppableRail/DroppableDayChip
// and PassView's onDragEnd all agree on the same format without duplicating
// regexes. Kept dependency-free (no dnd-kit imports) so they're trivially
// unit-testable.

import { MEAL_TYPES, type MealType } from './vocab';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLOT_ALTERNATION = MEAL_TYPES.join('|');
const RAIL_RE = new RegExp(`^rail:(\\d{4}-\\d{2}-\\d{2}):(${SLOT_ALTERNATION})$`);
const DAY_CHIP_RE = /^daychip:(\d{4}-\d{2}-\d{2})$/;
const TICKET_RE = /^ticket:(\d+)$/;

export interface RailTarget {
  day: string;
  slot: MealType;
}

/** Drop-target id for a slot rail (desktop: every rail; mobile: the selected day's 4 rails). */
export function railId(day: string, slot: MealType): string {
  return `rail:${day}:${slot}`;
}

/** Parses a rail id back into its day/slot, or null if it isn't one (or the date/slot is malformed). */
export function parseRailId(id: string): RailTarget | null {
  const match = RAIL_RE.exec(id);
  if (!match) return null;
  const [, day, slot] = match;
  if (!ISO_DATE_RE.test(day)) return null;
  return { day, slot: slot as MealType };
}

/** Drop-target id for a day chip in the mobile day strip. */
export function dayChipId(day: string): string {
  return `daychip:${day}`;
}

/** Parses a day-chip id back into its day, or null if it isn't one. */
export function parseDayChipId(id: string): { day: string } | null {
  const match = DAY_CHIP_RE.exec(id);
  if (!match) return null;
  const [, day] = match;
  if (!ISO_DATE_RE.test(day)) return null;
  return { day };
}

/** Draggable id for a plan entry's ticket. */
export function ticketId(entryId: number): string {
  return `ticket:${entryId}`;
}

/** Parses a ticket id back into the entry's numeric id, or null if it isn't one. */
export function parseTicketId(id: string): number | null {
  const match = TICKET_RE.exec(id);
  if (!match) return null;
  const entryId = Number(match[1]);
  return Number.isInteger(entryId) && entryId > 0 ? entryId : null;
}
