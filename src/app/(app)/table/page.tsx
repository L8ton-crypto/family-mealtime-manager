'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Ticket } from '@/components/ui/Ticket';
import { EmptyState } from '@/components/ui/EmptyState';
import { MemberCard } from '@/components/members/MemberCard';
import { MemberForm } from '@/components/members/MemberForm';
import { useMembers, type MemberInput } from '@/hooks/useMembers';
import { usePlan, type PlanEntry } from '@/hooks/usePlan';
import { addDays, formatWeekdayShort, todayISO } from '@/lib/dates';
import { comparePlanEntries } from '@/lib/planOrder';

interface CleanPlate {
  recipeId: number;
  recipeName: string;
}

// A 60-day look-ahead is plenty for a private household's own planning
// horizon and keeps this one bounded range query cheap.
const LOOKAHEAD_DAYS = 60;

function nextServiceLabel(memberId: number, entries: PlanEntry[], today: string): string | null {
  // comparePlanEntries orders by meal chronology (breakfast..snack), not
  // alphabetically — the same shared helper plan-db.ts and /pass/history
  // use, so "next service" can never drift from what The Pass itself shows.
  const upcoming = entries
    .filter((e) => e.status !== 'eightysixed' && e.service_date >= today && e.attendees.includes(memberId))
    .sort(comparePlanEntries);
  const next = upcoming[0];
  if (!next) return null;
  const dish = next.recipe ? next.recipe.name : (next.custom_name ?? '');
  return `${formatWeekdayShort(next.service_date)} ${next.slot.toUpperCase()} · ${dish.toUpperCase()}`;
}

export default function TablePage() {
  const { data: members, loading, createMember, updateMember, removeMember, moveMember } = useMembers();
  const today = todayISO();
  const { data: planEntries } = usePlan(today, addDays(today, LOOKAHEAD_DAYS));
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [cleanPlatesByMember, setCleanPlatesByMember] = useState<Record<number, CleanPlate[]>>({});

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ratings/clean-plates')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (!cancelled) setCleanPlatesByMember(data as Record<number, CleanPlate[]>);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = [...members].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  async function handleCreate(input: MemberInput) {
    const created = await createMember(input);
    if (created) setAdding(false);
  }

  async function handleUpdate(id: number, input: MemberInput) {
    const updated = await updateMember(id, input);
    if (updated) setEditingId(null);
  }

  return (
    <div>
      <PageHeader
        kicker="WHO'S SITTING DOWN"
        title="The Table"
        actions={
          !adding && (
            <Button variant="pass" onClick={() => setAdding(true)}>
              <Plus size={16} aria-hidden="true" /> Seat someone
            </Button>
          )
        }
      />

      {adding && (
        <div className="mb-6">
          <Ticket header="NEW SEAT">
            <MemberForm onSubmit={handleCreate} onCancel={() => setAdding(false)} submitLabel="Seat them" />
          </Ticket>
        </div>
      )}

      {!loading && sorted.length === 0 && !adding && (
        <EmptyState
          stampLabel="No tickets"
          copy="Nobody's seated yet. Add the first person at the table."
          action={
            <Button variant="pass" onClick={() => setAdding(true)}>
              Seat someone
            </Button>
          }
        />
      )}

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        {sorted.map((member, index) =>
          editingId === member.id ? (
            <Ticket key={member.id} header={`EDIT · SEAT ${String(index + 1).padStart(2, '0')}`}>
              <MemberForm
                initial={member}
                onSubmit={(input) => handleUpdate(member.id, input)}
                onCancel={() => setEditingId(null)}
                submitLabel="Save"
              />
            </Ticket>
          ) : (
            <MemberCard
              key={member.id}
              member={member}
              seatNumber={index + 1}
              isFirst={index === 0}
              isLast={index === sorted.length - 1}
              onEdit={() => setEditingId(member.id)}
              onRemove={() => removeMember(member.id)}
              onMoveUp={() => moveMember(member.id, 'up')}
              onMoveDown={() => moveMember(member.id, 'down')}
              nextService={nextServiceLabel(member.id, planEntries, today)}
              cleanPlates={cleanPlatesByMember[member.id] ?? []}
            />
          )
        )}
      </div>
    </div>
  );
}
