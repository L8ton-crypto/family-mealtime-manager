'use client';

import Link from 'next/link';
import { Stamp } from '@/components/ui/Stamp';
import { Ticket } from '@/components/ui/Ticket';
import type { MealType } from '@/lib/vocab';

interface DraftTicketProps {
  slot: MealType;
  name: string;
  headline: string;
  canSwap: boolean;
  onSwap: () => void;
  /** Names of the planned entries this draft would replace if fired — keepExisting=false ("REPLACE") only. See docs/slices/03-engine.md's QA fixes. */
  replaces?: string[];
}

/** A proposed-but-not-yet-fired dish from "Fire the week" — yellow `note` ticket, DRAFT stamp, headline reason, Swap. See docs/slices/03-engine.md. */
export function DraftTicket({ slot, name, headline, canSwap, onSwap, replaces }: DraftTicketProps) {
  return (
    <Ticket header={`${slot.toUpperCase()} · DRAFT`} variant="note">
      <div className="flex flex-col gap-2">
        <Stamp variant="new">Draft</Stamp>
        <h2 className="line-clamp-2 font-display text-2xl uppercase leading-tight tracking-wide text-ink">{name}</h2>
        {headline && <p className="text-xs italic text-ink-soft">{headline}</p>}
        {replaces && replaces.length > 0 && (
          <p className="font-mono text-[10px] uppercase tracking-widest text-ink-soft">
            Replaces {replaces.join(', ')}
          </p>
        )}
        {canSwap && (
          <button
            type="button"
            onClick={onSwap}
            className="self-start rounded-sm font-mono text-xs uppercase tracking-widest text-ink underline decoration-dotted underline-offset-2 hover:text-pass"
          >
            Swap
          </button>
        )}
      </div>
    </Ticket>
  );
}

/** A "Fire the week" slot the engine couldn't safely fill — red-ruled warning ticket with a link to The Menu. */
export function GapTicket({ slot }: { slot: MealType }) {
  return (
    <Ticket header={`${slot.toUpperCase()} · GAP`} variant="warning">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink">No safe dish for these covers</p>
        <Link href="/menu" className="self-start font-mono text-xs uppercase tracking-widest text-eightysix underline">
          Open The Menu
        </Link>
      </div>
    </Ticket>
  );
}
