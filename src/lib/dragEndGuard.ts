// Idempotency guard for The Pass's DndContext `onDragEnd` (docs/slices/06's
// QA fixes). A single logical drop was observed firing `onDragEnd` more than
// once for the same draggable — for a keyboard drop, Space both ends the
// dnd-kit drag AND, unless suppressed, queues the browser's own "activate a
// focused button" click on the following keyup, which reaches PassTicket's
// own onClick; there may also be timing paths where dnd-kit's own callback
// fires more than once for one drop. Whatever the exact cause, a repeated
// call for a drop already being processed must never send a second
// (identical) PATCH. A plain class (not a React ref holding a boolean)
// so the logic is unit-testable without rendering PassView or dnd-kit.

/**
 * Tracks which draggable id (if any) is currently "ending" — i.e. between
 * the first `begin()` call for a drop and the matching `end()` once that
 * drop has fully settled (its PATCH resolved, or it turned out to be a
 * cancelled/no-op drop). Call `begin(id)` at the very top of onDragEnd:
 * only the FIRST call for a given id returns true; every repeat for that
 * SAME id, before `end()` releases it, returns false and must be ignored.
 * A genuinely NEW drag of the same ticket (after `end()` has run) is not
 * blocked — the guard only ever suppresses re-entrant calls for one drop.
 */
export class DragEndGuard {
  private endingId: string | null = null;

  begin(id: string): boolean {
    if (this.endingId === id) return false;
    this.endingId = id;
    return true;
  }

  end(): void {
    this.endingId = null;
  }
}
