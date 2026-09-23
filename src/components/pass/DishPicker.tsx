'use client';

import { RefObject, useEffect, useMemo, useState } from 'react';
import { ChefHat } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { ChipToggle } from '@/components/ui/ChipToggle';
import { Chip } from '@/components/ui/Chip';
import { Field } from '@/components/ui/Field';
import { compatibility, type CompatMember, type CompatResult } from '@/lib/engine/compat';
import { MEAL_TYPES, type MealType } from '@/lib/vocab';
import type { Recipe } from '@/hooks/useRecipes';
import type { Member } from '@/hooks/useMembers';

interface ChefsPick {
  recipe: { id: number; name: string; totalMinutes: number };
  headline: string;
}

interface DishPickerProps {
  open: boolean;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
  /** The service date this picker is choosing for — drives Chef's picks. */
  day: string;
  slot: MealType;
  recipes: Recipe[];
  members: Member[];
  /** The plan entry's current (or default) attendees — what "Safe for these covers" checks against. */
  attendeeIds: number[];
  onChooseRecipe: (recipe: Recipe) => Promise<boolean>;
  onChooseCustom: (name: string) => Promise<boolean>;
}

const QUICK_CUSTOM = ['Leftovers', 'Takeaway', 'Eating out'];

function notForLabel(conflicts: CompatResult['conflicts']): string {
  const names = Array.from(new Set(conflicts.map((c) => c.memberName)));
  if (names.length === 0) return '';
  if (names.length === 1) return `NOT FOR ${names[0].toUpperCase()}`;
  return `NOT FOR ${names[0].toUpperCase()} +${names.length - 1}`;
}

/** Search + filter + "safe for these covers" picker, used to fire a dish onto an empty slot or swap an existing one. */
export function DishPicker({
  open,
  onClose,
  anchorRef,
  day,
  slot,
  recipes,
  members,
  attendeeIds,
  onChooseRecipe,
  onChooseCustom,
}: DishPickerProps) {
  const [query, setQuery] = useState('');
  const [mealTypeFilters, setMealTypeFilters] = useState<MealType[]>([slot]);
  const [safeOnly, setSafeOnly] = useState(true);
  const [customName, setCustomName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chefsPicks, setChefsPicks] = useState<ChefsPick[]>([]);

  useEffect(() => {
    let cancelled = false;
    const attendeesParam = attendeeIds.join(',');
    fetch(`/api/suggest?date=${day}&slot=${slot}&attendees=${attendeesParam}&limit=3`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { recipe: { id: number; name: string; totalMinutes: number }; headline: string }[]) => {
        if (!cancelled) setChefsPicks(data.map((d) => ({ recipe: d.recipe, headline: d.headline })));
      })
      .catch(() => {
        if (!cancelled) setChefsPicks([]);
      });
    return () => {
      cancelled = true;
    };
    // attendeeIds is a fresh array identity every render of PassView; join()
    // above turns it into a stable primitive for this effect's own deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, slot, attendeeIds.join(',')]);

  async function handleChooseChefsPick(pick: ChefsPick) {
    const recipe = recipes.find((r) => r.id === pick.recipe.id);
    if (!recipe) return;
    await handleChooseRecipe(recipe);
  }

  const attendeeMembers: CompatMember[] = useMemo(
    () => members.filter((m) => attendeeIds.includes(m.id)),
    [members, attendeeIds]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes
      .filter((r) => !r.archived)
      .filter((r) => mealTypeFilters.length === 0 || r.meal_types.some((mt) => mealTypeFilters.includes(mt)))
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .map((r) => ({
        recipe: r,
        compat: compatibility({ tags: r.tags, ingredients: r.ingredients }, attendeeMembers),
      }))
      .filter((r) => !safeOnly || r.compat.safe);
  }, [recipes, mealTypeFilters, query, safeOnly, attendeeMembers]);

  function toggleMealType(mt: MealType) {
    setMealTypeFilters((prev) => (prev.includes(mt) ? prev.filter((m) => m !== mt) : [...prev, mt]));
  }

  async function handleChooseRecipe(recipe: Recipe) {
    setBusy(true);
    setError(null);
    const ok = await onChooseRecipe(recipe);
    setBusy(false);
    if (ok) onClose();
    else setError('Could not fire that — try again.');
  }

  async function handleChooseCustom(name: string) {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const ok = await onChooseCustom(name.trim());
    setBusy(false);
    if (ok) onClose();
    else setError('Could not fire that — try again.');
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Fire something"
      anchorRef={anchorRef}
      size="roomy"
      footer={
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">Something else</p>
          <div className="flex flex-wrap items-end gap-2">
            {QUICK_CUSTOM.map((label) => (
              <Button key={label} variant="ink" onClick={() => handleChooseCustom(label)} disabled={busy}>
                {label}
              </Button>
            ))}
            <Field
              label="Or type your own"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="min-w-[160px] flex-1"
            />
            <Button variant="pass" onClick={() => handleChooseCustom(customName)} disabled={busy || !customName.trim()}>
              Fire it
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Sticky under the header: search + meal-type chips + the safe-only toggle, on one row per docs/slices/06. The -mx-4/px-4 pair bleeds this block to the sheet body's own edges so its background covers the results scrolling underneath it. */}
        <div className="sticky top-0 -mx-4 z-10 flex flex-col gap-3 border-b border-steel bg-paper px-4 pb-3 pt-3">
          <Field
            label="Search"
            placeholder="Search the menu…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {MEAL_TYPES.map((mt) => (
              <ChipToggle
                key={mt}
                label={mt.toUpperCase()}
                pressed={mealTypeFilters.includes(mt)}
                onToggle={() => toggleMealType(mt)}
              />
            ))}
            <ChipToggle label="Safe for these covers" pressed={safeOnly} onToggle={() => setSafeOnly((v) => !v)} />
          </div>
        </div>

        {chefsPicks.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-ink-soft">
              <ChefHat size={13} aria-hidden="true" /> Chef&apos;s picks
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {chefsPicks.map((pick) => (
                <button
                  key={pick.recipe.id}
                  type="button"
                  onClick={() => handleChooseChefsPick(pick)}
                  disabled={busy}
                  className="flex flex-col gap-0.5 rounded-sm border border-pass bg-paper-2 p-3 text-left transition-colors hover:bg-paper disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-display text-xl uppercase leading-none tracking-wide text-ink">
                      {pick.recipe.name}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-ink-soft">{pick.recipe.totalMinutes} MIN</span>
                  </div>
                  <span className="text-xs italic text-ink-soft">{pick.headline}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-eightysix">{error}</p>}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {results.length === 0 && <p className="text-sm text-ink-soft">No dishes match.</p>}
          {results.map(({ recipe, compat }) => (
            <button
              type="button"
              key={recipe.id}
              onClick={() => handleChooseRecipe(recipe)}
              disabled={busy}
              className="flex flex-col gap-1 rounded-sm border border-steel bg-paper-2 p-3 text-left transition-colors hover:border-pass disabled:opacity-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-display text-xl uppercase leading-none tracking-wide text-ink">
                  {recipe.name}
                </span>
                <span className="shrink-0 font-mono text-xs text-ink-soft">{recipe.totalMinutes} MIN</span>
              </div>
              {(recipe.allergens.length > 0 || !compat.safe) && (
                <div className="flex flex-wrap gap-1.5">
                  {recipe.allergens.map((a) => (
                    <Chip key={a} variant="allergen">
                      {a}
                    </Chip>
                  ))}
                  {!compat.safe && <Chip variant="allergen">{notForLabel(compat.conflicts)}</Chip>}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
