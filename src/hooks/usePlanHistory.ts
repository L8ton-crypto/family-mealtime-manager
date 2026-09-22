'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlanEntry } from './usePlan';

interface UsePlanHistoryResult {
  data: PlanEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Data access for the plated-history view of fm_plan_entries (GET /api/plan/history). */
export function usePlanHistory(limit = 50): UsePlanHistoryResult {
  const [data, setData] = useState<PlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/plan/history?limit=${limit}`);
      if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
      const entries = (await res.json()) as PlanEntry[];
      setData(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
