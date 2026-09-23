'use client';

import { useDraggable } from '@dnd-kit/core';
import { PassTicket } from './PassTicket';
import { ticketId } from '@/lib/dragTargets';
import type { PlanEntry } from '@/hooks/usePlan';
import type { Member } from '@/hooks/useMembers';

interface DraggableTicketProps {
  entry: PlanEntry;
  members: Member[];
  onOpen: (triggerEl: HTMLElement) => void;
  /** Inert while drafts are showing or a sheet is open — see PassView's DndContext doc comment. */
  disabled: boolean;
}

/**
 * Wraps a planned/plated/86'd PassTicket with dnd-kit's `useDraggable`, per
 * docs/slices/06's Part B ("Every planned, plated or 86'd ticket on The Pass
 * is draggable. Draft tickets are not."). `attributes`/`listeners`/`setNodeRef`
 * go onto PassTicket's OWN button (via its forwarded ref and prop spread),
 * not a wrapping div — see PassTicket's doc comment on why a second
 * interactive wrapper is an accessibility fault. The actual moving visual is
 * PassView's <DragOverlay> (a portal-rendered clone at pointer position),
 * not this node — a transform-translated original fights the 7-column CSS
 * grid's own layout in ways a floating overlay clone doesn't, and the
 * overlay also gets the "spikes onto the new rail" re-entry for free since
 * it unmounts and the real ticket re-spikes in its new slot. While isDragging,
 * the original stays in place at reduced opacity as a placeholder for where
 * it came from.
 */
export function DraggableTicket({ entry, members, onOpen, disabled }: DraggableTicketProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticketId(entry.id),
    data: { entryId: entry.id, day: entry.service_date, slot: entry.slot },
    disabled,
  });

  // QA fix 2 (docs/slices/06's Build notes) investigated whether Space/Enter
  // on a focused native <button> was ALSO queuing the browser's own
  // "activate this button" click for the following keyup (Space/Enter both
  // lift AND drop a keyboard drag via dnd-kit's KeyboardSensor start/end
  // codes) as one of two suspects behind a single drop sending several
  // identical PATCH requests. Verified against dnd-kit's own source
  // (core.esm.js): its KeyboardSensor activator calls `event.preventDefault()`
  // for the Space/Enter "start" keydown, and its `handleEnd` calls
  // `event.preventDefault()` for the Space/Enter "end" (drop) keydown too —
  // so the native click is already suppressed by dnd-kit itself and no
  // extra app-level guard belongs here. (An earlier attempt at one — first
  // wrapping `listeners.onKeyDown`, then a separate capture-phase listener
  // on the button — both ended up breaking dnd-kit's own activation
  // entirely instead, for reasons that weren't fully pinned down; removed.)
  // The actual, verified fix for the multiple-PATCH symptom is
  // PassView's `DragEndGuard` idempotency guard on `onDragEnd`.
  return (
    <PassTicket
      ref={setNodeRef}
      entry={entry}
      members={members}
      onOpen={onOpen}
      spikeIn={!isDragging}
      className={isDragging ? 'opacity-30' : undefined}
      {...attributes}
      {...listeners}
    />
  );
}
