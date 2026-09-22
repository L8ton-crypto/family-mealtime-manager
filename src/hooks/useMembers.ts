'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AgeGroup } from '@/lib/members-schema';

export interface Member {
  id: number;
  name: string;
  age_group: AgeGroup;
  colour: string;
  likes: string[];
  dislikes: string[];
  restrictions: string[];
  allergies: string[];
  sort_order: number;
  created_at: string;
}

export interface MemberInput {
  name: string;
  age_group: AgeGroup;
  colour: string;
  likes: string[];
  dislikes: string[];
  restrictions: string[];
  allergies: string[];
}

interface UseMembersResult {
  data: Member[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createMember: (input: MemberInput) => Promise<Member | null>;
  updateMember: (id: number, input: Partial<MemberInput>) => Promise<Member | null>;
  removeMember: (id: number) => Promise<boolean>;
  moveMember: (id: number, direction: 'up' | 'down') => Promise<boolean>;
}

/** Data access for fm_members. One hook per resource, per ARCHITECTURE conventions. */
export function useMembers(): UseMembersResult {
  const [data, setData] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/members');
      if (!res.ok) throw new Error(`Failed to load members (${res.status})`);
      const members = (await res.json()) as Member[];
      setData(members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount: this hook's entire job is to load fm_members from the
    // server, so the effect necessarily calls setState (via refresh) once
    // mounted. There's no server-side data here to seed initial state with.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Creates and deletes are pessimistic: wait for the server before changing
  // what's on screen.
  const createMember = useCallback(
    async (input: MemberInput) => {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const member = (await res.json()) as Member;
      await refresh();
      return member;
    },
    [refresh]
  );

  const updateMember = useCallback(
    async (id: number, input: Partial<MemberInput>) => {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const member = (await res.json()) as Member;
      await refresh();
      return member;
    },
    [refresh]
  );

  const removeMember = useCallback(
    async (id: number) => {
      const res = await fetch(`/api/members/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      await refresh();
      return true;
    },
    [refresh]
  );

  // Reorder is a check/uncheck-style action: optimistic swap of sort_order,
  // then confirm with the server. The whole ordering is sent in one PUT so
  // the server can apply it atomically (see /api/members/order) rather than
  // two independent PATCHes that could interleave with another writer.
  const moveMember = useCallback(
    async (id: number, direction: 'up' | 'down') => {
      const sorted = [...data].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const index = sorted.findIndex((m) => m.id === id);
      if (index === -1) return false;
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= sorted.length) return false;

      const reordered = [...sorted];
      [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
      const ids = reordered.map((m) => m.id);

      setData((prev) => {
        const nextSortOrder = new Map(ids.map((memberId, i) => [memberId, i]));
        return prev.map((m) =>
          nextSortOrder.has(m.id) ? { ...m, sort_order: nextSortOrder.get(m.id)! } : m
        );
      });

      const res = await fetch('/api/members/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      const ok = res.ok;
      await refresh();
      return ok;
    },
    [data, refresh]
  );

  return { data, loading, error, refresh, createMember, updateMember, removeMember, moveMember };
}
