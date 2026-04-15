'use client';

import { useState, useEffect, useCallback } from 'react';
import { getFamilyCode, setFamilyCode as storeFamilyCode } from '@/lib/familyCode';

export interface Member {
  id: number;
  family_code: string;
  name: string;
  age_group: string;
  avatar_color: string;
  likes: string[];
  dislikes: string[];
  restrictions: string[];
  allergies: string[];
  created_at: string;
}

export interface Meal {
  id: number;
  family_code: string;
  name: string;
  meal_type: string;
  meal_date: string;
  rating: number | null;
  notes: string | null;
  created_at: string;
}

export function useFamily() {
  const [familyCode, setFamilyCode] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const code = getFamilyCode();
    setFamilyCode(code);
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!familyCode) return;
    try {
      const res = await fetch(`/api/members?familyCode=${familyCode}`);
      const data = await res.json();
      setMembers(data);
    } catch (e) {
      console.error('Failed to fetch members:', e);
    }
  }, [familyCode]);

  const fetchMeals = useCallback(async () => {
    if (!familyCode) return;
    try {
      const res = await fetch(`/api/meals?familyCode=${familyCode}`);
      const data = await res.json();
      setMeals(data);
    } catch (e) {
      console.error('Failed to fetch meals:', e);
    }
  }, [familyCode]);

  useEffect(() => {
    if (familyCode) {
      setLoading(true);
      Promise.all([fetchMembers(), fetchMeals()]).finally(() => setLoading(false));
    }
  }, [familyCode, fetchMembers, fetchMeals]);

  const addMember = async (member: Partial<Member>) => {
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...member, familyCode }),
    });
    if (res.ok) await fetchMembers();
    return res.ok;
  };

  const updateMember = async (member: Partial<Member>) => {
    const res = await fetch('/api/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(member),
    });
    if (res.ok) await fetchMembers();
    return res.ok;
  };

  const deleteMember = async (id: number) => {
    const res = await fetch(`/api/members?id=${id}`, { method: 'DELETE' });
    if (res.ok) await fetchMembers();
    return res.ok;
  };

  const addMeal = async (meal: Partial<Meal>) => {
    const res = await fetch('/api/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...meal, familyCode }),
    });
    if (res.ok) await fetchMeals();
    return res.ok;
  };

  const deleteMeal = async (id: number) => {
    const res = await fetch(`/api/meals?id=${id}`, { method: 'DELETE' });
    if (res.ok) await fetchMeals();
    return res.ok;
  };

  const joinFamily = (code: string) => {
    storeFamilyCode(code);
    setFamilyCode(code);
  };

  return {
    familyCode, members, meals, loading,
    addMember, updateMember, deleteMember,
    addMeal, deleteMeal, joinFamily,
    refreshMembers: fetchMembers, refreshMeals: fetchMeals,
  };
}

