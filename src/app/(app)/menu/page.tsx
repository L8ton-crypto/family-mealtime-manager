'use client';

import { useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import Link from 'next/link';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Field, FieldSelect } from '@/components/ui/Field';
import { ChipToggle } from '@/components/ui/ChipToggle';
import { Sheet } from '@/components/ui/Sheet';
import { RecipeCard } from '@/components/menu/RecipeCard';
import { useRecipes } from '@/hooks/useRecipes';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { MEAL_TYPES, TAGS, type MealType, type Tag } from '@/lib/vocab';

type SortMode = 'az' | 'newest' | 'quickest';

// The breakpoint below which the filter panel collapses behind the
// "Filter" button and opens as a roomy bottom sheet instead — matches this
// page's own `md:hidden` / `md:flex` split further down (deliberately NOT
// Sheet's own 1024px desktop/mobile split: this page's inline panel is
// already visible from 768px up, so the sheet only needs to exist below
// that, and Sheet's internal breakpoint independently decides how IT
// renders once mounted).
const FILTERS_COLLAPSE_BREAKPOINT = 768;

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
  // A separate ref for the Sheet's own copy of the search field (below
  // FILTERS_COLLAPSE_BREAKPOINT the panel lives inside a Sheet — a portal to
  // document.body, a physically different DOM subtree from the always-mounted
  // desktop panel below, so the two Fields can never share one ref).
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search — see docs/slices/05-service.md's Keyboard scope.
  // Below the collapse breakpoint the search field lives inside the Filters
  // sheet, so "/" opens that sheet too; requestAnimationFrame defers the
  // .focus() call to the next paint, after the sheet has actually mounted —
  // calling .focus() on an element in the same tick as the setState that
  // mounts it is a silent no-op in every browser. Above the breakpoint the
  // panel (and its Field) are already visible, so "/" only focuses it.
  useKeyboardShortcuts({
    '/': () => {
      const collapsed = window.innerWidth < FILTERS_COLLAPSE_BREAKPOINT;
      if (collapsed) setFiltersOpen(true);
      requestAnimationFrame(() => (collapsed ? mobileSearchRef : searchRef).current?.focus());
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
        <Button variant="ghost" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-pass px-1 text-xs text-pass-ink">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Desktop/tablet (>= 768px): always visible, inline, sitting on the counter background. */}
      <div className="mb-6 hidden flex-col gap-4 md:flex">
        <FilterFields
          searchRef={searchRef}
          onCounter
          search={search}
          setSearch={setSearch}
          sort={sort}
          setSort={setSort}
          mealTypeFilter={mealTypeFilter}
          setMealTypeFilter={setMealTypeFilter}
          tagFilters={tagFilters}
          toggleTagFilter={toggleTagFilter}
          safeOnly={safeOnly}
          setSafeOnly={setSafeOnly}
          favouritesOnly={favouritesOnly}
          setFavouritesOnly={setFavouritesOnly}
          showArchived={showArchived}
          setShowArchived={setShowArchived}
        />
      </div>

      {/* Below 768px: collapsed behind the Filter button above, opening as a roomy bottom sheet — docs/slices/06's "The Menu filters (mobile)". Its own copy of the fields sits on the sheet's paper background, so onCounter is off. */}
      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        size="roomy"
        footer={
          <Button variant="pass" onClick={() => setFiltersOpen(false)} className="w-full">
            Show {filtered.length} dish{filtered.length === 1 ? '' : 'es'}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <FilterFields
            searchRef={mobileSearchRef}
            onCounter={false}
            search={search}
            setSearch={setSearch}
            sort={sort}
            setSort={setSort}
            mealTypeFilter={mealTypeFilter}
            setMealTypeFilter={setMealTypeFilter}
            tagFilters={tagFilters}
            toggleTagFilter={toggleTagFilter}
            safeOnly={safeOnly}
            setSafeOnly={setSafeOnly}
            favouritesOnly={favouritesOnly}
            setFavouritesOnly={setFavouritesOnly}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
          />
        </div>
      </Sheet>

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

interface FilterFieldsProps {
  searchRef: RefObject<HTMLInputElement | null>;
  /** True sitting directly on the counter background (the desktop inline panel); false on a Sheet's paper background (the mobile Filters sheet). See Chip's own onCounter doc comment. */
  onCounter: boolean;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  sort: SortMode;
  setSort: Dispatch<SetStateAction<SortMode>>;
  mealTypeFilter: MealType | null;
  setMealTypeFilter: Dispatch<SetStateAction<MealType | null>>;
  tagFilters: Tag[];
  toggleTagFilter: (tag: Tag) => void;
  safeOnly: boolean;
  setSafeOnly: Dispatch<SetStateAction<boolean>>;
  favouritesOnly: boolean;
  setFavouritesOnly: Dispatch<SetStateAction<boolean>>;
  showArchived: boolean;
  setShowArchived: Dispatch<SetStateAction<boolean>>;
}

/**
 * The Menu's search/sort/meal-type/tags/toggles controls — shared between
 * the always-visible desktop panel and the mobile Filters sheet's own copy
 * (two physically separate DOM subtrees; see the Sheet's doc comment in
 * MenuPage for why they can't be one shared element), so the two never drift
 * out of sync. `searchRef`/`onCounter` are the only two things that differ
 * per caller.
 */
function FilterFields({
  searchRef,
  onCounter,
  search,
  setSearch,
  sort,
  setSort,
  mealTypeFilter,
  setMealTypeFilter,
  tagFilters,
  toggleTagFilter,
  safeOnly,
  setSafeOnly,
  favouritesOnly,
  setFavouritesOnly,
  showArchived,
  setShowArchived,
}: FilterFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          ref={searchRef}
          label="Search"
          placeholder="Name or ingredient…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FieldSelect label="Sort" mono value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
          <option value="az">A–Z</option>
          <option value="newest">Newest</option>
          <option value="quickest">Quickest</option>
        </FieldSelect>
      </div>

      <div>
        <p className={`mb-1 font-mono text-xs uppercase tracking-widest ${onCounter ? 'text-chalk-soft' : 'text-ink-soft'}`}>Meal type</p>
        <div className="flex flex-wrap gap-2">
          {MEAL_TYPES.map((mealType) => (
            <ChipToggle
              key={mealType}
              label={mealType}
              pressed={mealTypeFilter === mealType}
              onToggle={() => setMealTypeFilter((prev) => (prev === mealType ? null : mealType))}
              variant="outline"
              onCounter={onCounter}
            />
          ))}
        </div>
      </div>

      <div>
        <p className={`mb-1 font-mono text-xs uppercase tracking-widest ${onCounter ? 'text-chalk-soft' : 'text-ink-soft'}`}>Tags</p>
        <div className="flex flex-wrap gap-2">
          {TAGS.map((tag) => (
            <ChipToggle key={tag} label={tag} pressed={tagFilters.includes(tag)} onToggle={() => toggleTagFilter(tag)} onCounter={onCounter} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <ChipToggle label="Safe for everyone" pressed={safeOnly} onToggle={() => setSafeOnly((v) => !v)} variant="outline" onCounter={onCounter} />
        <ChipToggle
          label="Favourites"
          pressed={favouritesOnly}
          onToggle={() => setFavouritesOnly((v) => !v)}
          variant="outline"
          onCounter={onCounter}
        />
        <ChipToggle
          label="Show 86'd"
          pressed={showArchived}
          onToggle={() => setShowArchived((v) => !v)}
          variant="outline"
          onCounter={onCounter}
        />
      </div>
    </>
  );
}
