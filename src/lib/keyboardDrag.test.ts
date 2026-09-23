import { describe, expect, it } from 'vitest';
import { centerRectInTarget, directionForKeyCode, stepRailPosition } from './keyboardDrag';

const WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];

describe('stepRailPosition', () => {
  it('steps right to the next day, same slot', () => {
    expect(stepRailPosition({ day: '2026-09-22', slot: 'lunch' }, 'right', WEEK)).toEqual({
      day: '2026-09-23',
      slot: 'lunch',
    });
  });

  it('steps left to the previous day, same slot', () => {
    expect(stepRailPosition({ day: '2026-09-23', slot: 'dinner' }, 'left', WEEK)).toEqual({
      day: '2026-09-22',
      slot: 'dinner',
    });
  });

  it('steps down to the next slot (breakfast -> lunch -> dinner -> snack), same day', () => {
    expect(stepRailPosition({ day: '2026-09-23', slot: 'breakfast' }, 'down', WEEK)).toEqual({
      day: '2026-09-23',
      slot: 'lunch',
    });
    expect(stepRailPosition({ day: '2026-09-23', slot: 'dinner' }, 'down', WEEK)).toEqual({
      day: '2026-09-23',
      slot: 'snack',
    });
  });

  it('steps up to the previous slot, same day', () => {
    expect(stepRailPosition({ day: '2026-09-23', slot: 'dinner' }, 'up', WEEK)).toEqual({
      day: '2026-09-23',
      slot: 'lunch',
    });
  });

  it('clamps at the left edge (Monday) instead of wrapping', () => {
    expect(stepRailPosition({ day: WEEK[0], slot: 'lunch' }, 'left', WEEK)).toEqual({ day: WEEK[0], slot: 'lunch' });
  });

  it('clamps at the right edge (Sunday) instead of wrapping', () => {
    const last = WEEK[WEEK.length - 1];
    expect(stepRailPosition({ day: last, slot: 'lunch' }, 'right', WEEK)).toEqual({ day: last, slot: 'lunch' });
  });

  it('clamps at breakfast (top) instead of wrapping', () => {
    expect(stepRailPosition({ day: WEEK[0], slot: 'breakfast' }, 'up', WEEK)).toEqual({
      day: WEEK[0],
      slot: 'breakfast',
    });
  });

  it('clamps at snack (bottom) instead of wrapping', () => {
    expect(stepRailPosition({ day: WEEK[0], slot: 'snack' }, 'down', WEEK)).toEqual({
      day: WEEK[0],
      slot: 'snack',
    });
  });

  it('is a no-op (single-day list) for left/right on mobile, where only the selected day is droppable', () => {
    const mobileDays = ['2026-09-23'];
    expect(stepRailPosition({ day: '2026-09-23', slot: 'lunch' }, 'right', mobileDays)).toEqual({
      day: '2026-09-23',
      slot: 'lunch',
    });
  });

  it('returns the position unchanged if the day is not in the offered list', () => {
    expect(stepRailPosition({ day: '2099-01-01', slot: 'lunch' }, 'right', WEEK)).toEqual({
      day: '2099-01-01',
      slot: 'lunch',
    });
  });
});

describe('directionForKeyCode', () => {
  it('maps the four arrow key codes', () => {
    expect(directionForKeyCode('ArrowLeft')).toBe('left');
    expect(directionForKeyCode('ArrowRight')).toBe('right');
    expect(directionForKeyCode('ArrowUp')).toBe('up');
    expect(directionForKeyCode('ArrowDown')).toBe('down');
  });

  it('returns null for any other key code', () => {
    expect(directionForKeyCode('Space')).toBeNull();
    expect(directionForKeyCode('Escape')).toBeNull();
    expect(directionForKeyCode('KeyA')).toBeNull();
  });
});

describe('centerRectInTarget', () => {
  it('centers a smaller dragged rect inside a larger target rect', () => {
    const dragged = { left: 0, top: 0, width: 100, height: 50 };
    const target = { left: 200, top: 300, width: 140, height: 254 };
    // target center: (270, 427); minus half the dragged rect's own size.
    expect(centerRectInTarget(dragged, target)).toEqual({ x: 220, y: 402 });
  });

  it('returns the target rect unchanged when the dragged rect is the same size', () => {
    const dragged = { left: 999, top: 999, width: 92, height: 130 };
    const target = { left: 50, top: 60, width: 92, height: 130 };
    expect(centerRectInTarget(dragged, target)).toEqual({ x: 50, y: 60 });
  });

  it('is independent of the dragged rect\'s own left/top — only its width/height matter', () => {
    const target = { left: 10, top: 20, width: 80, height: 40 };
    const a = centerRectInTarget({ left: 0, top: 0, width: 20, height: 10 }, target);
    const b = centerRectInTarget({ left: 500, top: 500, width: 20, height: 10 }, target);
    expect(a).toEqual(b);
  });

  it('handles a target taller/wider than usual (e.g. a rail already holding several tickets) the same as a small one', () => {
    const dragged = { left: 0, top: 0, width: 92, height: 130 };
    const shortTarget = { left: 100, top: 100, width: 92, height: 48 };
    const tallTarget = { left: 100, top: 100, width: 92, height: 400 };
    expect(centerRectInTarget(dragged, shortTarget)).toEqual({ x: 100, y: 100 + 24 - 65 });
    expect(centerRectInTarget(dragged, tallTarget)).toEqual({ x: 100, y: 100 + 200 - 65 });
  });
});
