'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { RecipeForm } from '@/components/menu/RecipeForm';
import { useRecipes, type RecipeInput } from '@/hooks/useRecipes';

export default function NewRecipePage() {
  const router = useRouter();
  const { createRecipe } = useRecipes();

  async function handleSubmit(input: RecipeInput) {
    const created = await createRecipe(input);
    if (created) router.push(`/menu/${created.id}`);
  }

  return (
    <div>
      <PageHeader kicker="NEW DISH" title="Write a Menu Card" />
      <RecipeForm onSubmit={handleSubmit} onCancel={() => router.push('/menu')} submitLabel="Save dish" />
    </div>
  );
}
