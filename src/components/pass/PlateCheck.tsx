'use client';

import { useState } from 'react';
import { CircleCheck, CircleDot, CircleX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { PlanEntry, PlanEntryRating } from '@/hooks/usePlan';
import type { Member } from '@/hooks/useMembers';
import type { Verdict } from '@/lib/vocab';

interface PlateCheckProps {
  entry: PlanEntry;
  members: Member[];
  /** Called after every successful save, so the caller can refresh entries (keeps /pass/history's "complete" tick and the menu card's Kitchen record in sync). */
  onSaved?: () => void;
}

const VERDICT_OPTIONS: { verdict: Verdict; label: string; icon: typeof CircleCheck }[] = [
  { verdict: 'clean', label: 'Clean', icon: CircleCheck },
  { verdict: 'half', label: 'Half', icon: CircleDot },
  { verdict: 'left', label: 'Left', icon: CircleX },
];

/**
 * "HOW DID THE PLATES COME BACK?" — one row per attendee, a segmented
 * Clean/Half/Left control that saves immediately, and an optional one-line
 * note per member. Lives inside a Sheet (see ActionSheet's plate-check view,
 * a plated ticket's own Plate check button, and /pass/history rows).
 */
export function PlateCheck({ entry, members, onSaved }: PlateCheckProps) {
  const byMember = new Map(entry.ratings.map((r) => [r.memberId, r]));
  const [ratings, setRatings] = useState<Map<number, PlanEntryRating>>(byMember);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>(
    Object.fromEntries(entry.ratings.map((r) => [r.memberId, r.note ?? '']))
  );
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attendeeMembers = entry.attendees.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => Boolean(m));

  async function saveRating(memberId: number, verdict: Verdict, note: string) {
    setSaving(memberId);
    setError(null);
    try {
      const res = await fetch('/api/ratings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id: entry.id, member_id: memberId, verdict, note: note.trim() === '' ? null : note.trim() }),
      });
      if (!res.ok) {
        setError('Could not save that verdict — try again.');
        return;
      }
      setRatings((prev) => {
        const next = new Map(prev);
        next.set(memberId, { memberId, verdict, note: note.trim() === '' ? null : note.trim() });
        return next;
      });
      onSaved?.();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">How did the plates come back?</p>

      {error && <p className="text-sm text-eightysix">{error}</p>}

      <div className="flex flex-col gap-4">
        {attendeeMembers.map((member) => {
          const current = ratings.get(member.id);
          return (
            <div key={member.id} className="flex flex-col gap-2 border-b border-steel pb-3 last:border-b-0">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm text-pass-ink"
                  style={{ backgroundColor: member.colour }}
                  aria-hidden="true"
                >
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-body text-sm font-medium text-ink">{member.name}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {VERDICT_OPTIONS.map(({ verdict, label, icon: Icon }) => {
                  const pressed = current?.verdict === verdict;
                  return (
                    <button
                      key={verdict}
                      type="button"
                      aria-pressed={pressed}
                      disabled={saving === member.id}
                      onClick={() => saveRating(member.id, verdict, notesDraft[member.id] ?? '')}
                      className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-sm border px-2 py-2 font-mono text-[11px] uppercase tracking-wide transition-colors disabled:opacity-50 ${
                        pressed ? 'border-pass bg-pass text-pass-ink' : 'border-steel bg-paper-2 text-ink-soft hover:border-pass'
                      }`}
                    >
                      <Icon size={16} aria-hidden="true" />
                      {label}
                    </button>
                  );
                })}
              </div>
              {current && (
                <input
                  type="text"
                  value={notesDraft[member.id] ?? ''}
                  onChange={(e) => setNotesDraft((prev) => ({ ...prev, [member.id]: e.target.value }))}
                  onBlur={() => saveRating(member.id, current.verdict, notesDraft[member.id] ?? '')}
                  placeholder="One-line note (optional)"
                  className="w-full rounded-sm border border-steel bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-pass"
                />
              )}
            </div>
          );
        })}
        {attendeeMembers.length === 0 && <p className="text-sm text-ink-soft">Nobody&apos;s down as a cover for this one.</p>}
      </div>
    </div>
  );
}

interface PlateCheckFooterProps {
  onDone: () => void;
  onSkip: () => void;
}

/**
 * Plate check's primary action, `Done`/`Skip` — rendered by the caller as
 * the enclosing roomy Sheet's sticky `footer` (see ActionSheet and
 * /pass/history), not inside PlateCheck's own (scrollable) body, so it's
 * always reachable per docs/slices/06's "the primary action ... sits in a
 * sticky footer" rule.
 */
export function PlateCheckFooter({ onDone, onSkip }: PlateCheckFooterProps) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="pass" onClick={onDone}>
        Done
      </Button>
      <Button variant="ghost" onClick={onSkip}>
        Skip
      </Button>
    </div>
  );
}
