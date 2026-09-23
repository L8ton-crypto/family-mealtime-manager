import { describe, expect, it } from 'vitest';
import { DragEndGuard } from './dragEndGuard';

describe('DragEndGuard', () => {
  it('allows the first begin() call for an id', () => {
    const guard = new DragEndGuard();
    expect(guard.begin('ticket:65')).toBe(true);
  });

  it('rejects a repeat begin() for the same id before end() releases it', () => {
    const guard = new DragEndGuard();
    expect(guard.begin('ticket:65')).toBe(true);
    expect(guard.begin('ticket:65')).toBe(false);
    expect(guard.begin('ticket:65')).toBe(false); // a third, fourth... call is still rejected — this is the "six identical PATCH calls" bug
  });

  it('allows a new begin() for the same id once end() has run', () => {
    const guard = new DragEndGuard();
    expect(guard.begin('ticket:65')).toBe(true);
    guard.end();
    expect(guard.begin('ticket:65')).toBe(true);
  });

  it('never blocks a DIFFERENT id, even while one is mid-flight', () => {
    const guard = new DragEndGuard();
    expect(guard.begin('ticket:65')).toBe(true);
    expect(guard.begin('ticket:67')).toBe(true);
  });

  it('end() is safe to call when nothing is in flight', () => {
    const guard = new DragEndGuard();
    expect(() => guard.end()).not.toThrow();
    expect(guard.begin('ticket:65')).toBe(true);
  });
});
