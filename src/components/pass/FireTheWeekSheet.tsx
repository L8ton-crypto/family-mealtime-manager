'use client';

import { RefObject, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { ChipToggle } from '@/components/ui/ChipToggle';
import { MEAL_TYPES, type MealType } from '@/lib/vocab';
import type { Member } from '@/hooks/useMembers';

export interface FireTheWeekParams {
  slots: MealType[];
  attendees: number[];
  keepExisting: boolean;
  seed?: string;
}

interface FireTheWeekSheetProps {
  open: boolean;
  onClose: () => void;
  members: Member[];
  onFire: (params: FireTheWeekParams) => Promise<boolean>;
  /** The "Fire the week" trigger button — anchors the desktop popover next to it (top right of the header) instead of the viewport's top-left. See docs/slices/04-order.md's carry-over fixes. */
  anchorRef?: RefObject<HTMLElement | null>;
}

/** "Fire the week" — configures a POST /api/plan/fill run; the results land as draft tickets on the rail, not inside this sheet. See docs/slices/03-engine.md. */
export function FireTheWeekSheet({ open, onClose, members, onFire, anchorRef }: FireTheWeekSheetProps) {
  const [slots, setSlots] = useState<MealType[]>(['dinner']);
  const [attendees, setAttendees] = useState<number[]>(members.map((m) => m.id));
  const [keepExisting, setKeepExisting] = useState(true);
  const [seed, setSeed] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSlot(mt: MealType) {
    setSlots((prev) => (prev.includes(mt) ? prev.filter((s) => s !== mt) : [...prev, mt]));
  }
  function toggleAttendee(id: number) {
    setAttendees((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }
  function freshShuffle() {
    setSeed(`shuffle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }

  async function handleFire() {
    setBusy(true);
    setError(null);
    const ok = await onFire({ slots, attendees, keepExisting, seed });
    setBusy(false);
    if (!ok) setError('Could not propose the week — try again.');
  }

  return (
    <Sheet open={open} onClose={onClose} title="Fire the week" anchorRef={anchorRef}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-soft">Services</p>
          <div className="flex flex-wrap gap-1.5">
            {MEAL_TYPES.map((mt) => (
              <ChipToggle key={mt} label={mt.toUpperCase()} pressed={slots.includes(mt)} onToggle={() => toggleSlot(mt)} />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-soft">Covers</p>
          <div className="flex flex-wrap gap-1.5">
            {members.map((member) => (
              <ChipToggle
                key={member.id}
                label={member.name}
                pressed={attendees.includes(member.id)}
                onToggle={() => toggleAttendee(member.id)}
              />
            ))}
          </div>
        </div>

        <div>
          <ChipToggle
            label="Keep what's already on the pass"
            pressed={keepExisting}
            onToggle={() => setKeepExisting((v) => !v)}
          />
          {!keepExisting && (
            <p className="mt-2 text-xs text-ink-soft">
              Planned tickets in those services will be replaced. Plated and 86&apos;d ones stay.
            </p>
          )}
        </div>

        <Button variant="ink" onClick={freshShuffle}>
          Fresh shuffle
        </Button>

        {error && <p className="text-sm text-eightysix">{error}</p>}

        <Button variant="pass" onClick={handleFire} disabled={busy || slots.length === 0}>
          {busy ? 'Firing…' : 'Fire'}
        </Button>
      </div>
    </Sheet>
  );
}
