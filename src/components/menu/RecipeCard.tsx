'use client';

import Link from 'next/link';
import { Star, AlertTriangle } from 'lucide-react';
import { Ticket } from '@/components/ui/Ticket';
import { Chip } from '@/components/ui/Chip';
import { Stamp } from '@/components/ui/Stamp';
import type { Recipe } from '@/hooks/useRecipes';

interface RecipeCardProps {
  recipe: Recipe;
  onToggleFavourite: (favourite: boolean) => void;
}

function notForLabel(conflicts: { memberName: string }[]): string {
  const names = Array.from(new Set(conflicts.map((c) => c.memberName)));
  if (names.length === 0) return '';
  if (names.length === 1) return `NOT FOR ${names[0].toUpperCase()}`;
  return `NOT FOR ${names[0].toUpperCase()} +${names.length - 1}`;
}

export function RecipeCard({ recipe, onToggleFavourite }: RecipeCardProps) {
  const header = `${recipe.meal_types.map((m) => m.toUpperCase()).join('/')} · ${recipe.totalMinutes} MIN · SERVES ${recipe.servings}`;
  const visibleTags = recipe.tags.slice(0, 3);

  return (
    <Ticket header={header} className={recipe.archived ? 'opacity-50' : ''}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/menu/${recipe.id}`} className="min-w-0">
            <h3 className="truncate font-display text-3xl uppercase leading-none tracking-wide text-ink hover:underline">
              {recipe.name}
            </h3>
          </Link>
          <button
            type="button"
            onClick={() => onToggleFavourite(!recipe.favourite)}
            aria-label={recipe.favourite ? `Remove ${recipe.name} from favourites` : `Add ${recipe.name} to favourites`}
            aria-pressed={recipe.favourite}
            className="shrink-0 text-ink-soft transition-colors hover:text-pass"
          >
            <Star size={20} aria-hidden="true" fill={recipe.favourite ? 'currentColor' : 'none'} className={recipe.favourite ? 'text-pass' : ''} />
          </button>
        </div>

        {recipe.description && <p className="text-sm text-ink-soft">{recipe.description}</p>}

        {(recipe.allergens.length > 0 || visibleTags.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.allergens.map((allergen) => (
              <Chip key={allergen} variant="allergen">
                {allergen}
              </Chip>
            ))}
            {visibleTags.map((tag) => (
              <Chip key={tag} variant="outline">
                {tag}
              </Chip>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {recipe.archived && <Stamp variant="eightysix">86&apos;D</Stamp>}
          {!recipe.compat.safe && (
            <Stamp variant="eightysix">
              <AlertTriangle size={12} aria-hidden="true" className="mr-1 inline" />
              {notForLabel(recipe.compat.conflicts)}
            </Stamp>
          )}
        </div>
      </div>
    </Ticket>
  );
}
