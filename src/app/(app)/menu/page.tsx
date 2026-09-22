'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Field, FieldSelect } from '@/components/ui/Field';
import { ChipToggle } from '@/components/ui/ChipToggle';
import { RecipeCard } from '@/components/menu/RecipeCard';
import { useRecipes } from '@/hooks/useRecipes';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { MEAL_TYPES, TAGS, type MealType, type Tag } from '@/lib/vocab';

type SortMode = 'az' | 'newest' | 'quickest';

export default function MenuPage() {
  const { data: recipes, loading, toggleFavourite } = useRecipes();

  const [search, setSearch] = useState('');
  const [mealTypeFilter, setMealTypeFilter] = useState<MealType | null>(null);
  const [tagFilters, setTagFilters] = useState<Tag[]>([]);
  const [safeOnly, setSafeOnly] = useState(false);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<SortMode>('az');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search — see docs/slices/05-service.md's Keyboard scope.
  // Also opens the mobile filter panel (hidden by default below md, since
  // the search field lives inside it there) — requestAnimationFrame defers
  // the .focus() call to the next paint, after that panel's `hidden` class
  // has actually been removed from the DOM; calling .focus() on a
  // still-`display: none` element in the same tick as the setState that
  // reveals it is a silent no-op in every browser.
  useKeyboardShortcuts({
    '/': () => {
      setFiltersOpen(true);
      requestAnimationFrame(() => searchRef.current?.focus());
    },
  });

  function toggleTagFilter(tag: Tag) {
    setTagFilters((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function clearFilters() {
    setSearch('');
    setMealTypeFilter(null);
    setTagFilters([]);
    setSafeOnly(false);
    setFavouritesOnly(false);
    setShowArchived(false);
  }

  const activeFilterCount =
    (search ? 1 : 0) +
    (mealTypeFilter ? 1 : 0) +
    tagFilters.length +
    (safeOnly ? 1 : 0) +
    (favouritesOnly ? 1 : 0) +
    (showArchived ? 1 : 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = recipes.filter((r) => (showArchived ? true : !r.archived));
    if (q) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || r.ingredients.some((i) => i.name.toLowerCase().includes(q))
      );
    }
    if (mealTypeFilter) {
      list = list.filter((r) => r.meal_types.includes(mealTypeFilter));
    }
    if (tagFilters.length > 0) {
      list = list.filter((r) => tagFilters.every((t) => r.tags.includes(t)));
    }
    if (safeOnly) {
      list = list.filter((r) => r.compat.safe);
    }
    if (favouritesOnly) {
      list = list.filter((r) => r.favourite);
    }

    const sorted = [...list];
    if (sort === 'az') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'newest') {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      sorted.sort((a, b) => a.totalMinutes - b.totalMinutes);
    }
    return sorted;
  }, [recipes, search, mealTypeFilter, tagFilters, safeOnly, favouritesOnly, showArchived, sort]);

  const dishCount = recipes.filter((r) => !r.archived).length;
  const favouriteCount = recipes.filter((r) => !r.archived && r.favourite).length;
  const archivedCount = recipes.filter((r) => r.archived).length;

  return (
    <div>
      <PageHeader
        kicker={`${dishCount} DISHES · ${favouriteCount} FAVOURITES · ${archivedCount} 86'D`}
        title="The Menu"
        actions={
          <Link href="/menu/new">
            <Button variant="pass">
              <Plus size={16} aria-hidden="true" /> New dish
            </Button>
          </Link>
        }
      />

      <div className="mb-3 md:hidden">
        <Button variant="ghost" onClick={() => setFiltersOpen((v) => !v)}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-pass px-1 text-xs text-pass-ink">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      <div className={`${filtersOpen ? 'flex' : 'hidden'} mb-6 flex-col gap-4 md:flex`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            ref={searchRef}
            label="Search"
            placeholder="Name or ingredient…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <FieldSelect
            label="Sort"
            mono
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
          >
            <option value="az">A–Z</option>
            <option value="newest">Newest</option>
            <option value="quickest">Quickest</option>
          </FieldSelect>
        </div>

        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-widest text-chalk-soft">Meal type</p>
          <div className="flex flex-wrap gap-2">
            {MEAL_TYPES.map((mealType) => (
              <ChipToggle
                key={mealType}
                label={mealType}
                pressed={mealTypeFilter === mealType}
                onToggle={() => setMealTypeFilter((prev) => (prev === mealType ? null : mealType))}
                variant="outline"
                onCounter
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-widest text-chalk-soft">Tags</p>
          <div className="flex flex-wrap gap-2">
            {TAGS.map((tag) => (
              <ChipToggle
                key={tag}
                label={tag}
                pressed={tagFilters.includes(tag)}
                onToggle={() => toggleTagFilter(tag)}
                onCounter
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ChipToggle label="Safe for everyone" pressed={safeOnly} onToggle={() => setSafeOnly((v) => !v)} variant="outline" onCounter />
          <ChipToggle label="Favourites" pressed={favouritesOnly} onToggle={() => setFavouritesOnly((v) => !v)} variant="outline" onCounter />
          <ChipToggle label="Show 86'd" pressed={showArchived} onToggle={() => setShowArchived((v) => !v)} variant="outline" onCounter />
        </div>
      </div>

      {!loading && recipes.length === 0 && (
        <EmptyState
          stampLabel="The menu is blank"
          copy="Nothing's on the menu yet. Write the first dish."
          action={
            <Link href="/menu/new">
              <Button variant="pass">New dish</Button>
            </Link>
          }
        />
      )}

      {!loading && recipes.length > 0 && filtered.length === 0 && (
        <EmptyState
          stampLabel="Nothing on the menu"
          copy="No dish matches those filters."
          action={
            <Button variant="pass" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onToggleFavourite={(favourite) => toggleFavourite(recipe.id, favourite)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
