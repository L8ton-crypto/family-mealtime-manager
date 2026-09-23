// Pure stepping logic for keyboard drag on The Pass (docs/slices/06 "Part B"
// Keyboard). dnd-kit's KeyboardSensor needs a `coordinateGetter` that returns
// viewport pixel coordinates, not a semantic day/slot — the glue that turns
// this into pixel coordinates (reading droppable rects off dnd-kit's
// SensorContext) lives in useKeyboardDragCoordinateGetter.ts, next to the
// DndContext that owns it. This file holds only the part worth unit-testing
// in isolation: given a current rail position, which rail does one arrow
// press move to, clamped at the edges of the days in view (no wraparound —
// pressing Left on Monday, or Up on breakfast, is a no-op).

import { MEAL_TYPES, type MealType } from './vocab';

export type ArrowDirection = 'up' | 'down' | 'left' | 'right';

export interface RailPosition {
  day: string;
  slot: MealType;
}

/**
 * Steps a rail position by one day (left/right) or one slot (up/down).
 * `days` is the ordered list of days currently offered as drop targets —
 * the full 7-day week on desktop, or just the selected day on mobile (where
 * left/right are then no-ops, since only one day's rails are droppable).
 * Returns `current` unchanged if it isn't found in `days`/MEAL_TYPES at all.
 */
export function stepRailPosition(current: RailPosition, direction: ArrowDirection, days: readonly string[]): RailPosition {
  const dayIndex = days.indexOf(current.day);
  const slotIndex = MEAL_TYPES.indexOf(current.slot);
  if (dayIndex === -1 || slotIndex === -1) return current;

  switch (direction) {
    case 'left':
      return { day: days[Math.max(0, dayIndex - 1)], slot: current.slot };
    case 'right':
      return { day: days[Math.min(days.length - 1, dayIndex + 1)], slot: current.slot };
    case 'up':
      return { day: current.day, slot: MEAL_TYPES[Math.max(0, slotIndex - 1)] as MealType };
    case 'down':
      return { day: current.day, slot: MEAL_TYPES[Math.min(MEAL_TYPES.length - 1, slotIndex + 1)] as MealType };
    default:
      return current;
  }
}

/** Maps a KeyboardEvent.code from dnd-kit's KeyboardSensor to an ArrowDirection, or null for any other key. */
export function directionForKeyCode(code: string): ArrowDirection | null {
  switch (code) {
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    default:
      return null;
  }
}

/** The subset of DOMRect/ClientRect the keyboard coordinate maths needs. */
export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The keyboard coordinateGetter's actual coordinate maths, pulled out as a
 * pure function so it's unit-testable without a live dnd-kit SensorContext:
 * the top-left position that CENTERS `draggedRect` inside `targetRect`.
 * dnd-kit diffs whatever a coordinateGetter returns against its own running
 * `currentCoordinates`, which is the dragged item's top-left corner, not its
 * center — so this must return a top-left position too, not `targetRect`'s
 * own center, or every step silently overshoots by about half a rail (see
 * docs/slices/06's QA fixes for the bug this exact shape fixed).
 */
export function centerRectInTarget(draggedRect: RectLike, targetRect: RectLike): { x: number; y: number } {
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  return {
    x: targetCenterX - draggedRect.width / 2,
    y: targetCenterY - draggedRect.height / 2,
  };
}
