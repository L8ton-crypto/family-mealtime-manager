'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { RecipeForm } from '@/components/menu/RecipeForm';
import { useRecipes, type RecipeInput } from '@/hooks/useRecipes';

export default function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const recipeId = Number(id);
  const router = useRouter();
  const { data: recipes, loading, updateRecipe } = useRecipes();
  const recipe = recipes.find((r) => r.id === recipeId);

  async function handleSubmit(input: RecipeInput) {
    const updated = await updateRecipe(recipeId, input);
    if (updated) router.push(`/menu/${recipeId}`);
  }

  if (loading && !recipe) {
    return (
      <div>
        <PageHeader kicker="EDIT DISH" title="Loading…" />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div>
        <PageHeader kicker="EDIT DISH" title="Not found" />
        <p className="text-chalk-soft">That dish isn&apos;t on the menu.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader kicker={`EDIT · ${recipe.name.toUpperCase()}`} title="Edit Menu Card" />
      <RecipeForm
        initial={recipe}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/menu/${recipeId}`)}
        submitLabel="Save changes"
      />
    </div>
  );
}
