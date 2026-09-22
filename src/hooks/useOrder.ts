'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Aisle, Unit } from '@/lib/vocab';

export interface OrderItemSource {
  entryId: number;
  recipeId: number;
  recipeName: string;
  quantity: number | null;
  unit: Unit | null;
}

export interface OrderItem {
  id: number;
  week_start: string;
  key: string | null;
  name: string;
  quantity: number | null;
  unit: Unit | null;
  aisle: Aisle;
  checked: boolean;
  manual: boolean;
  optional: boolean;
  /** True when a generated line's content was hand-edited and is preserved verbatim across regeneration. Always false for a manual line. */
  overridden: boolean;
  sources: OrderItemSource[];
  created_at: string;
  updated_at: string;
}

export interface OrderSummary {
  items: OrderItem[];
  total: number;
  checked: number;
  generatedAt: string | null;
}

export interface ManualLineInput {
  name: string;
  quantity?: number | null;
  unit?: Unit | null;
  aisle?: Aisle;
}

export type PatchOrderItemInput = Partial<{
  checked: boolean;
  name: string;
  quantity: number | null;
  unit: Unit | null;
  aisle: Aisle;
  /** Only `false` is ever meaningful here — "Undo edit". See order-db.ts's patchOrderItem doc comment. */
  overridden: false;
}>;

interface UseOrderResult {
  data: OrderSummary;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  generate: () => Promise<boolean>;
  addLine: (input: ManualLineInput) => Promise<OrderItem | null>;
  patchItem: (id: number, input: PatchOrderItemInput, optimistic?: boolean) => Promise<OrderItem | null>;
  removeItem: (id: number) => Promise<boolean>;
  clearChecked: () => Promise<boolean>;
}

const EMPTY_SUMMARY: OrderSummary = { items: [], total: 0, checked: 0, generatedAt: null };

/** Data access for fm_shopping_items within a given week (its Monday). Re-fetches whenever `week` changes. */
export function useOrder(week: string): UseOrderResult {
  const [data, setData] = useState<OrderSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/order?week=${week}`);
      if (!res.ok) throw new Error(`Failed to load the order (${res.status})`);
      const summary = (await res.json()) as OrderSummary;
      setData(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the order');
    } finally {
      setLoading(false);
    }
  }, [week]);

  useEffect(() => {
    // Fetch-on-mount (and on week change): this hook's whole job is to load
    // fm_shopping_items for the week in view from the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Regenerating is pessimistic — it rebuilds the whole generated set
  // server-side, so there's nothing sensible to show optimistically.
  const generate = useCallback(async () => {
    const res = await fetch('/api/order/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week }),
    });
    if (!res.ok) return false;
    const summary = (await res.json()) as OrderSummary;
    setData(summary);
    return true;
  }, [week]);

  const addLine = useCallback(
    async (input: ManualLineInput) => {
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, ...input }),
      });
      if (!res.ok) return null;
      const item = (await res.json()) as OrderItem;
      await refresh();
      return item;
    },
    [week, refresh]
  );

  // Ticking a line is a check/uncheck-style action: optimistic when asked,
  // rolling back to the pre-patch snapshot on failure, matching usePlan's
  // pattern. Editing a line's content (name/quantity/unit/aisle) is
  // pessimistic by default — the server may convert it to manual, which the
  // client can't predict locally.
  const patchItem = useCallback(
    async (id: number, input: PatchOrderItemInput, optimistic = false) => {
      const previous = data;
      if (optimistic) {
        setData((prev) => ({
          ...prev,
          items: prev.items.map((i) => (i.id === id ? { ...i, ...input } : i)),
          checked: prev.items.filter((i) => (i.id === id ? (input.checked ?? i.checked) : i.checked)).length,
        }));
      }
      const res = await fetch(`/api/order/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        if (optimistic) setData(previous);
        return null;
      }
      const item = (await res.json()) as OrderItem;
      await refresh();
      return item;
    },
    [data, refresh]
  );

  const removeItem = useCallback(
    async (id: number) => {
      const res = await fetch(`/api/order/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      await refresh();
      return true;
    },
    [refresh]
  );

  const clearChecked = useCallback(async () => {
    const res = await fetch('/api/order/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week, checkedOnly: true }),
    });
    if (!res.ok) return false;
    const summary = (await res.json()) as OrderSummary;
    setData(summary);
    return true;
  }, [week]);

  return { data, loading, error, refresh, generate, addLine, patchItem, removeItem, clearChecked };
}
