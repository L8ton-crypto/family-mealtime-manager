'use client';

import { RefObject, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { ChipToggle } from '@/components/ui/ChipToggle';
import { addDays, formatDayShort, todayISO } from '@/lib/dates';
import { MEAL_TYPES, type MealType } from '@/lib/vocab';

interface DayChooserProps {
  open: boolean;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
  title: string;
  initialSlot: MealType;
  confirmLabel?: string;
  onConfirm: (serviceDate: string, slot: MealType) => Promise<boolean>;
}

function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'TODAY';
  if (iso === addDays(today, 1)) return 'TOMORROW';
  return formatDayShort(iso);
}

/** Next-14-days + slot chooser, shared by "Put on the pass" (The Menu) and "Plate it again" (history). */
export function DayChooser({
  open,
  onClose,
  anchorRef,
  title,
  initialSlot,
  confirmLabel = 'Fire it',
  onConfirm,
}: DayChooserProps) {
  const today = todayISO();
  const [day, setDay] = useState(today);
  const [slot, setSlot] = useState<MealType>(initialSlot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const ok = await onConfirm(day, slot);
    setBusy(false);
    if (ok) onClose();
    else setError('Could not fire it — try again.');
  }

  return (
    <Sheet open={open} onClose={onClose} title={title} anchorRef={anchorRef}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-soft">When</p>
          <div className="flex flex-wrap gap-1.5">
            {days.map((iso) => (
              <ChipToggle key={iso} label={dayLabel(iso, today)} pressed={day === iso} onToggle={() => setDay(iso)} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-soft">Service</p>
          <div className="flex flex-wrap gap-1.5">
            {MEAL_TYPES.map((mt) => (
              <ChipToggle key={mt} label={mt.toUpperCase()} pressed={slot === mt} onToggle={() => setSlot(mt)} />
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-eightysix">{error}</p>}
        <Button variant="pass" onClick={handleConfirm} disabled={busy}>
          {busy ? 'Firing…' : confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
