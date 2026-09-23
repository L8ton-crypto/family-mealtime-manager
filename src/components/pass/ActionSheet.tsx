'use client';

import { RefObject, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { ChipToggle } from '@/components/ui/ChipToggle';
import { Field, FieldTextarea } from '@/components/ui/Field';
import { PlateCheck, PlateCheckFooter } from './PlateCheck';
import { MEAL_TYPES, type MealType } from '@/lib/vocab';
import type { PatchPlanEntryInput, PlanEntry } from '@/hooks/usePlan';
import type { Member } from '@/hooks/useMembers';

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
  entry: PlanEntry;
  members: Member[];
  onPatch: (input: PatchPlanEntryInput, optimistic?: boolean) => Promise<PlanEntry | null>;
  onRemove: () => Promise<boolean>;
  onSwap: () => void;
  /** Called after a rating saves in Plate check, so the caller can refresh entries. */
  onRatingSaved?: () => void;
}

type Section = 'none' | 'covers' | 'move' | 'notes' | 'remove';
type View = 'actions' | 'plateCheck';

/** Tap-a-ticket action sheet: every action the pass spec lists, in one panel. */
export function ActionSheet({ open, onClose, anchorRef, entry, members, onPatch, onRemove, onSwap, onRatingSaved }: ActionSheetProps) {
  const [section, setSection] = useState<Section>('none');
  const [view, setView] = useState<View>('actions');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveDate, setMoveDate] = useState(entry.service_date);
  const [moveSlot, setMoveSlot] = useState<MealType>(entry.slot);
  const [notesDraft, setNotesDraft] = useState(entry.notes ?? '');

  const dishName = entry.recipe ? entry.recipe.name : (entry.custom_name ?? 'Untitled');

  function toggleSection(next: Section) {
    setError(null);
    setSection((prev) => (prev === next ? 'none' : next));
  }

  async function togglePlated() {
    setError(null);
    const wasPlated = entry.status === 'plated';
    const nextStatus = wasPlated ? 'planned' : 'plated';
    // Plating (not un-plating) a dish with a real recipe swaps this sheet
    // straight to Plate check — see docs/slices/03-engine.md. A custom
    // entry ("Takeaway") has nothing to rate, so it just flips status.
    //
    // QA fix 4 (docs/slices/06's Build notes): switch the VIEW optimistically
    // too, in the same tick as the optimistic data patch below (`onPatch`'s
    // `optimistic=true`) — not after awaiting the PATCH+refresh round trip.
    // If the PATCH then fails, roll the view back to `actions` alongside the
    // data's own optimistic rollback (already handled by usePlan), so the
    // household never sits looking at a Plate check for a dish that, per the
    // server, was never actually plated.
    const willSwitchToPlateCheck = !wasPlated && Boolean(entry.recipe);
    if (willSwitchToPlateCheck) setView('plateCheck');
    const result = await onPatch({ status: nextStatus }, true);
    if (!result) {
      setError('Could not update — try again.');
      if (willSwitchToPlateCheck) setView('actions');
    }
  }

  async function toggleEightysixed() {
    setError(null);
    const nextStatus = entry.status === 'eightysixed' ? 'planned' : 'eightysixed';
    const result = await onPatch({ status: nextStatus }, true);
    if (!result) setError('Could not update — try again.');
  }

  async function toggleAttendee(memberId: number) {
    setError(null);
    const has = entry.attendees.includes(memberId);
    const next = has ? entry.attendees.filter((id) => id !== memberId) : [...entry.attendees, memberId];
    const result = await onPatch({ attendees: next }, true);
    if (!result) setError('Could not update covers — try again.');
  }

  async function saveMove() {
    setBusy(true);
    setError(null);
    const result = await onPatch({ service_date: moveDate, slot: moveSlot });
    setBusy(false);
    if (result) setSection('none');
    else setError('Could not move it — try again.');
  }

  async function saveNotes() {
    setBusy(true);
    setError(null);
    const result = await onPatch({ notes: notesDraft.trim() === '' ? null : notesDraft.trim() });
    setBusy(false);
    if (result) setSection('none');
    else setError('Could not save notes — try again.');
  }

  async function confirmRemove() {
    setBusy(true);
    setError(null);
    const ok = await onRemove();
    setBusy(false);
    if (ok) onClose();
    else setError('Could not remove it — try again.');
  }

  if (view === 'plateCheck' && entry.recipe) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={dishName}
        anchorRef={anchorRef}
        size="roomy"
        footer={<PlateCheckFooter onDone={() => setView('actions')} onSkip={() => setView('actions')} />}
      >
        <PlateCheck entry={entry} members={members} onSaved={onRatingSaved} />
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={dishName} anchorRef={anchorRef} size="compact">
      <div className="flex flex-col gap-4">
        {entry.compat && !entry.compat.safe && (
          <div className="rounded-sm border-l-4 border-eightysix bg-paper-2 p-3">
            <p className="mb-1 font-mono text-xs uppercase tracking-widest text-eightysix">Check</p>
            <ul className="flex flex-col gap-1 text-sm text-ink">
              {entry.compat.conflicts.map((conflict, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-eightysix" />
                  <span>{conflict.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-eightysix">{error}</p>}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="ink" onClick={togglePlated}>
            {entry.status === 'plated' ? 'Un-plate' : 'Plate it'}
          </Button>
          <Button variant="ink" onClick={toggleEightysixed}>
            {entry.status === 'eightysixed' ? 'Bring it back' : "86 it"}
          </Button>
          <Button variant="ink" onClick={() => toggleSection('covers')}>
            Covers ({entry.attendees.length})
          </Button>
          <Button variant="ink" onClick={() => toggleSection('move')}>
            Move
          </Button>
          <Button variant="ink" onClick={onSwap}>
            Swap dish
          </Button>
          <Button variant="ink" onClick={() => toggleSection('notes')}>
            Notes
          </Button>
          {entry.status === 'plated' && entry.recipe && (
            <Button variant="ink" onClick={() => setView('plateCheck')} className="col-span-2">
              Plate check
              {entry.ratings.length >= entry.attendees.length && entry.attendees.length > 0 && (
                <span className="text-plated"> · done</span>
              )}
            </Button>
          )}
        </div>

        {section === 'covers' && (
          <div className="flex flex-wrap gap-1.5 border-t border-steel pt-3">
            {members.map((member) => (
              <ChipToggle
                key={member.id}
                label={member.name}
                pressed={entry.attendees.includes(member.id)}
                onToggle={() => toggleAttendee(member.id)}
              />
            ))}
          </div>
        )}

        {section === 'move' && (
          <div className="flex flex-col gap-3 border-t border-steel pt-3">
            <Field label="Date" type="date" mono value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
            <div className="flex flex-wrap gap-1.5">
              {MEAL_TYPES.map((mt) => (
                <ChipToggle key={mt} label={mt.toUpperCase()} pressed={moveSlot === mt} onToggle={() => setMoveSlot(mt)} />
              ))}
            </div>
            <Button variant="pass" onClick={saveMove} disabled={busy}>
              Save
            </Button>
          </div>
        )}

        {section === 'notes' && (
          <div className="flex flex-col gap-3 border-t border-steel pt-3">
            <FieldTextarea label="Notes" value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
            <Button variant="pass" onClick={saveNotes} disabled={busy}>
              Save
            </Button>
          </div>
        )}

        <div className="border-t border-steel pt-3">
          {section !== 'remove' ? (
            <Button variant="danger" onClick={() => toggleSection('remove')}>
              Remove
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="danger" onClick={confirmRemove} disabled={busy}>
                Really remove it?
              </Button>
              <Button variant="ghost" onClick={() => setSection('none')} disabled={busy}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
