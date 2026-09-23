'use client';

import { useRef, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { Ticket } from '@/components/ui/Ticket';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { DayChooser } from '@/components/pass/DayChooser';
import { PlateCheck, PlateCheckFooter } from '@/components/pass/PlateCheck';
import { usePlanHistory } from '@/hooks/usePlanHistory';
import { useMembers } from '@/hooks/useMembers';
import { formatDayLong } from '@/lib/dates';
import { comparePlanEntries } from '@/lib/planOrder';
import type { MealType } from '@/lib/vocab';
import type { PlanEntry } from '@/hooks/usePlan';

function groupByDate(entries: PlanEntry[]): [string, PlanEntry[]][] {
  const map = new Map<string, PlanEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.service_date) ?? [];
    list.push(entry);
    map.set(entry.service_date, list);
  }
  // /api/plan/history already orders newest-first with each day in service
  // order (breakfast..snack, not alphabetical) — this re-sorts explicitly
  // rather than trusting insertion order, the same way The Table's
  // NEXT SERVICE lookup (table/page.tsx) re-sorts rather than trusting
  // fetch order, so a future change to the hook or API can't silently
  // un-sort this list.
  const days = Array.from(map.entries());
  days.sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)); // newest date first
  for (const [, dayEntries] of days) {
    dayEntries.sort(comparePlanEntries); // breakfast..snack within the day, not alphabetical
  }
  return days;
}

export default function PassHistoryPage() {
  const { data: entries, loading, refresh } = usePlanHistory(50);
  const { data: members } = useMembers();
  const [chooserEntry, setChooserEntry] = useState<PlanEntry | null>(null);
  const [plateCheckEntry, setPlateCheckEntry] = useState<PlanEntry | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const groups = groupByDate(entries);

  async function handleConfirm(serviceDate: string, slot: MealType) {
    if (!chooserEntry) return false;
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_date: serviceDate,
        slot,
        recipe_id: chooserEntry.recipe?.id ?? null,
        custom_name: chooserEntry.recipe ? null : chooserEntry.custom_name,
      }),
    });
    return res.ok;
  }

  return (
    <div>
      <PageHeader kicker="PAST SERVICES" title="History" />

      {!loading && entries.length === 0 && (
        <EmptyState stampLabel="Nothing plated yet" copy="Once you plate a service, it shows up here." />
      )}

      <div className="flex flex-col gap-6">
        {groups.map(([date, dayEntries]) => (
          <div key={date}>
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-chalk-soft">{formatDayLong(date)}</p>
            <div className="flex flex-col gap-2">
              {dayEntries.map((entry) => (
                <Ticket
                  key={entry.id}
                  header={`${entry.slot.toUpperCase()}${entry.recipe ? ` · ${entry.recipe.totalMinutes} MIN` : ''}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="min-w-0 truncate font-display text-2xl uppercase leading-none tracking-wide text-ink">
                        {entry.recipe ? entry.recipe.name : entry.custom_name}
                      </h3>
                      {entry.attendees.length > 0 && entry.ratings.length >= entry.attendees.length && (
                        <CircleCheck size={16} aria-label="Plate check complete" className="shrink-0 text-plated" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.recipe && (
                        <Button
                          variant="ink"
                          onClick={(e) => {
                            anchorRef.current = e.currentTarget;
                            setPlateCheckEntry(entry);
                          }}
                        >
                          Plate check
                        </Button>
                      )}
                      <Button
                        variant="ink"
                        onClick={(e) => {
                          anchorRef.current = e.currentTarget;
                          setChooserEntry(entry);
                        }}
                      >
                        Plate it again
                      </Button>
                    </div>
                  </div>
                </Ticket>
              ))}
            </div>
          </div>
        ))}
      </div>

      {chooserEntry && (
        <DayChooser
          open
          onClose={() => setChooserEntry(null)}
          anchorRef={anchorRef}
          title={`Plate it again: ${chooserEntry.recipe ? chooserEntry.recipe.name : chooserEntry.custom_name}`}
          initialSlot={chooserEntry.slot}
          onConfirm={handleConfirm}
        />
      )}

      {plateCheckEntry && (
        <Sheet
          open
          onClose={() => setPlateCheckEntry(null)}
          anchorRef={anchorRef}
          title={plateCheckEntry.recipe ? plateCheckEntry.recipe.name : (plateCheckEntry.custom_name ?? '')}
          size="roomy"
          footer={<PlateCheckFooter onDone={() => setPlateCheckEntry(null)} onSkip={() => setPlateCheckEntry(null)} />}
        >
          <PlateCheck entry={plateCheckEntry} members={members} onSaved={refresh} />
        </Sheet>
      )}
    </div>
  );
}
