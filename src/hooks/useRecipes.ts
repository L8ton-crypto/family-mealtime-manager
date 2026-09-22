'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MealType, Tag, Unit, Aisle, Allergen } from '@/lib/vocab';

export interface RecipeIngredient {
  id: number;
  name: string;
  quantity: number | null;
  unit: Unit | null;
  aisle: Aisle;
  allergens: Allergen[];
  optional: boolean;
  note: string | null;
}

export interface RecipeIngredientInput {
  name: string;
  quantity: number | null;
  unit: Unit | null;
  aisle: Aisle;
  allergens: Allergen[];
  optional: boolean;
  note: string | null;
}

export interface CompatConflict {
  memberId: number;
  memberName: string;
  reason: string;
}

export interface Recipe {
  id: number;
  name: string;
  description: string;
  meal_types: MealType[];
  tags: Tag[];
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
  method: string[];
  source_url: string | null;
  favourite: boolean;
  archived: boolean;
  seeded: boolean;
  created_at: string;
  updated_at: string;
  ingredients: RecipeIngredient[];
  allergens: Allergen[];
  ingredientCount: number;
  totalMinutes: number;
  compat: { safe: boolean; conflicts: CompatConflict[] };
}

export interface RecipeInput {
  name: string;
  description: string;
  meal_types: MealType[];
  tags: Tag[];
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
  method: string[];
  source_url: string | null;
  favourite: boolean;
  ingredients: RecipeIngredientInput[];
}

export type RecipePatchInput = Partial<RecipeInput> & { archived?: boolean };

interface UseRecipesResult {
  data: Recipe[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createRecipe: (input: RecipeInput) => Promise<Recipe | null>;
  updateRecipe: (id: number, input: RecipePatchInput) => Promise<Recipe | null>;
  archiveRecipe: (id: number) => Promise<boolean>;
  restoreRecipe: (id: number) => Promise<Recipe | null>;
  toggleFavourite: (id: number, favourite: boolean) => Promise<void>;
}

/** Data access for fm_recipes / fm_recipe_ingredients. Always fetches with archived dishes included; screens filter client-side. */
export function useRecipes(): UseRecipesResult {
  const [data, setData] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recipes?archived=1');
      if (!res.ok) throw new Error(`Failed to load recipes (${res.status})`);
      const recipes = (await res.json()) as Recipe[];
      setData(recipes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recipes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount, same pattern as useMembers: this hook's whole job is
    // to load fm_recipes from the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Creates are pessimistic (wait for the server) per ARCHITECTURE.
  const createRecipe = useCallback(
    async (input: RecipeInput) => {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const recipe = (await res.json()) as Recipe;
      await refresh();
      return recipe;
    },
    [refresh]
  );

  const updateRecipe = useCallback(
    async (id: number, input: RecipePatchInput) => {
      const res = await fetch(`/api/recipes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const recipe = (await res.json()) as Recipe;
      await refresh();
      return recipe;
    },
    [refresh]
  );

  const archiveRecipe = useCallback(
    async (id: number) => {
      const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      await refresh();
      return true;
    },
    [refresh]
  );

  const restoreRecipe = useCallback(
    async (id: number) => {
      return updateRecipe(id, { archived: false });
    },
    [updateRecipe]
  );

  // Favouriting is a check/uncheck-style action: optimistic, then confirmed.
  const toggleFavourite = useCallback(
    async (id: number, favourite: boolean) => {
      setData((prev) => prev.map((r) => (r.id === id ? { ...r, favourite } : r)));
      const res = await fetch(`/api/recipes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favourite }),
      });
      if (!res.ok) {
        // Roll back on failure.
        setData((prev) => prev.map((r) => (r.id === id ? { ...r, favourite: !favourite } : r)));
        return;
      }
      await refresh();
    },
    [refresh]
  );

  return { data, loading, error, refresh, createRecipe, updateRecipe, archiveRecipe, restoreRecipe, toggleFavourite };
}
