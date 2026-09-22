'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Allergen, MealType, Verdict } from '@/lib/vocab';

export type PlanStatus = 'planned' | 'plated' | 'eightysixed';

export interface PlanRecipeSummary {
  id: number;
  name: string;
  totalMinutes: number;
  allergens: Allergen[];
  mealTypes: MealType[];
}

export interface PlanCompatConflict {
  memberId: number;
  memberName: string;
  reason: string;
}

export interface PlanCompatResult {
  safe: boolean;
  conflicts: PlanCompatConflict[];
}

export interface PlanEntryRating {
  memberId: number;
  verdict: Verdict;
  note: string | null;
}

export interface PlanEntry {
  id: number;
  service_date: string;
  slot: MealType;
  recipe_id: number | null;
  custom_name: string | null;
  servings: number | null;
  status: PlanStatus;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  attendees: number[];
  recipe: PlanRecipeSummary | null;
  compat: PlanCompatResult | null;
  ratings: PlanEntryRating[];
}

export interface CreatePlanEntryInput {
  service_date: string;
  slot: MealType;
  recipe_id?: number | null;
  custom_name?: string | null;
  attendees?: number[];
  servings?: number | null;
  notes?: string | null;
}

export type PatchPlanEntryInput = Partial<{
  service_date: string;
  slot: MealType;
  recipe_id: number | null;
  custom_name: string | null;
  attendees: number[];
  servings: number | null;
  status: PlanStatus;
  notes: string | null;
  position: number;
}>;

interface UsePlanResult {
  data: PlanEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createEntry: (input: CreatePlanEntryInput) => Promise<PlanEntry | null>;
  patchEntry: (id: number, input: PatchPlanEntryInput, optimistic?: boolean) => Promise<PlanEntry | null>;
  removeEntry: (id: number) => Promise<boolean>;
}

/**
 * Data access for fm_plan_entries within a [from, to] YYYY-MM-DD range
 * (inclusive on both ends). Re-fetches whenever `from`/`to` change (e.g.
 * week navigation).
 */
export function usePlan(from: string, to: string): UsePlanResult {
  const [data, setData] = useState<PlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/plan?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(`Failed to load the pass (${res.status})`);
      const entries = (await res.json()) as PlanEntry[];
      setData(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the pass');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    // Fetch-on-mount (and on from/to change): this hook's whole job is to
    // load fm_plan_entries for the range in view from the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Creates are pessimistic per ARCHITECTURE: wait for the server, then
  // refresh so the new ticket carries its real id, recipe summary and
  // attendee-scoped compat.
  const createEntry = useCallback(
    async (input: CreatePlanEntryInput) => {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const entry = (await res.json()) as PlanEntry;
      await refresh();
      return entry;
    },
    [refresh]
  );

  // Plate/un-plate/86/bring-back/covers are check/uncheck-style actions:
  // called with optimistic=true, they apply the patch to local state
  // immediately and roll back to the pre-patch snapshot (visibly — the
  // ticket/chip flips straight back) if the server rejects it. Move/swap/
  // notes/remove call this with optimistic=false (the default), closer to
  // a create/delete than a toggle: nothing changes on screen until the
  // server confirms.
  const patchEntry = useCallback(
    async (id: number, input: PatchPlanEntryInput, optimistic = false) => {
      const previous = data;
      if (optimistic) {
        setData((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...input } as PlanEntry) : e)));
      }
      const res = await fetch(`/api/plan/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        if (optimistic) setData(previous);
        return null;
      }
      const entry = (await res.json()) as PlanEntry;
      await refresh();
      return entry;
    },
    [data, refresh]
  );

  const removeEntry = useCallback(
    async (id: number) => {
      const res = await fetch(`/api/plan/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      await refresh();
      return true;
    },
    [refresh]
  );

  return { data, loading, error, refresh, createEntry, patchEntry, removeEntry };
}
