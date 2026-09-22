'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronUp, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { Ticket } from '@/components/ui/Ticket';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import type { Member } from '@/hooks/useMembers';

interface CleanPlate {
  recipeId: number;
  recipeName: string;
}

interface MemberCardProps {
  member: Member;
  seatNumber: number;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onRemove: () => Promise<boolean>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** e.g. "TUE DINNER · CHICKEN FAJITAS" — this member's earliest upcoming plan entry, if any. Purely informational. */
  nextService?: string | null;
  /** Slice 3: up to 3 dishes this member's plate has come back clean for the most, most-recent tie-break first. */
  cleanPlates?: CleanPlate[];
}

export function MemberCard({
  member,
  seatNumber,
  isFirst,
  isLast,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  nextService,
  cleanPlates = [],
}: MemberCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleConfirmRemove() {
    setRemoving(true);
    const ok = await onRemove();
    setRemoving(false);
    if (!ok) setConfirming(false);
  }

  const seatLabel = String(seatNumber).padStart(2, '0');

  return (
    <Ticket header={`SEAT ${seatLabel} · ${member.age_group.toUpperCase()}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-lg text-pass-ink"
            style={{ backgroundColor: member.colour }}
            aria-hidden="true"
          >
            {member.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="truncate font-display text-3xl uppercase leading-none tracking-wide text-ink">
            {member.name}
          </h2>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="Move up"
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-steel text-ink-soft transition-colors hover:bg-paper-2 disabled:opacity-30"
          >
            <ChevronUp size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="Move down"
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-steel text-ink-soft transition-colors hover:bg-paper-2 disabled:opacity-30"
          >
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {nextService && (
        <p className="mt-3 font-mono text-xs uppercase tracking-wide text-ink-soft">NEXT SERVICE: {nextService}</p>
      )}

      {cleanPlates.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs uppercase tracking-wide text-ink-soft">CLEAN PLATES:</span>
          {cleanPlates.map((plate) => (
            <Link key={plate.recipeId} href={`/menu/${plate.recipeId}`}>
              <Chip variant="soft">{plate.recipeName}</Chip>
            </Link>
          ))}
        </div>
      )}

      {(member.likes.length > 0 || member.dislikes.length > 0 || member.restrictions.length > 0 || member.allergies.length > 0) && (
        <div className="mt-4 flex flex-col gap-3">
          {member.likes.length > 0 && (
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-ink-soft">Likes</p>
              <div className="flex flex-wrap gap-1.5">
                {member.likes.map((tag) => (
                  <Chip key={`like-${tag}`} variant="plain">
                    {tag}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {member.dislikes.length > 0 && (
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-ink-soft">Dislikes</p>
              <div className="flex flex-wrap gap-1.5">
                {member.dislikes.map((tag) => (
                  <Chip key={`dislike-${tag}`} variant="dislike">
                    {tag}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {member.restrictions.length > 0 && (
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-ink-soft">Restrictions</p>
              <div className="flex flex-wrap gap-1.5">
                {member.restrictions.map((tag) => (
                  <Chip key={`restriction-${tag}`} variant="outline">
                    {tag}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {member.allergies.length > 0 && (
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-ink-soft">Allergies</p>
              <div className="flex flex-wrap gap-1.5">
                {member.allergies.map((tag) => (
                  <Chip key={`allergy-${tag}`} variant="allergen">
                    {tag}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" /> Edit
        </Button>
        {!confirming ? (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            <Trash2 size={14} aria-hidden="true" /> Remove
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="danger" onClick={handleConfirmRemove} disabled={removing}>
              Really 86 them?
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={removing}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </Ticket>
  );
}
