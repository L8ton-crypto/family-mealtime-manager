'use client';

import { Stamp } from '@/components/ui/Stamp';
import { Ticket } from '@/components/ui/Ticket';
import type { PlanEntry } from '@/hooks/usePlan';
import type { Member } from '@/hooks/useMembers';

interface PassTicketProps {
  entry: PlanEntry;
  members: Member[];
  onOpen: (triggerEl: HTMLElement) => void;
  spikeIn?: boolean;
}

function headerMeta(entry: PlanEntry): string {
  const slotLabel = entry.slot.toUpperCase();
  if (entry.recipe) {
    const covers = entry.attendees.length;
    return `${slotLabel} · ${entry.recipe.totalMinutes} MIN · ${covers} COVER${covers === 1 ? '' : 'S'}`;
  }
  return `${slotLabel} · ${(entry.custom_name ?? '').toUpperCase()}`;
}

/** A single ticket on The Pass rail. Tap opens the action sheet for this entry. */
export function PassTicket({ entry, members, onOpen, spikeIn = true }: PassTicketProps) {
  const dishName = entry.recipe ? entry.recipe.name : (entry.custom_name ?? 'Untitled');
  const attendeeMembers = entry.attendees
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is Member => Boolean(m));
  const unsafe = entry.compat ? !entry.compat.safe : false;
  const ticketVariant = entry.status === 'plated' ? 'plated' : 'default';

  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      className="block w-full rounded-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-pass"
    >
      <Ticket
        header={headerMeta(entry)}
        variant={ticketVariant}
        spikeIn={spikeIn}
        className={entry.status === 'eightysixed' ? 'opacity-60' : ''}
      >
        <div className="flex flex-col gap-2">
          {(entry.status === 'plated' || entry.status === 'eightysixed' || unsafe) && (
            <div className="flex flex-wrap gap-1.5">
              {entry.status === 'plated' && <Stamp variant="plated">Plated</Stamp>}
              {entry.status === 'eightysixed' && <Stamp variant="eightysix">86&apos;d</Stamp>}
              {unsafe && <Stamp variant="eightysix">Check</Stamp>}
            </div>
          )}
          <h2
            className={`line-clamp-2 font-display text-2xl uppercase leading-tight tracking-wide text-ink ${
              entry.status === 'eightysixed' ? 'line-through' : ''
            }`}
          >
            {dishName}
          </h2>
          {attendeeMembers.length > 0 && (
            <div className="flex -space-x-1.5" aria-hidden="true">
              {attendeeMembers.map((member) => (
                <div
                  key={member.id}
                  title={member.name}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-paper font-display text-[11px] text-pass-ink"
                  style={{ backgroundColor: member.colour }}
                >
                  {member.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          )}
          {entry.notes && <p className="truncate text-xs italic text-ink-soft">{entry.notes}</p>}
        </div>
      </Ticket>
    </button>
  );
}
