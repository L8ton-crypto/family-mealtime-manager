'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Star, Pencil, Archive, RotateCcw, Minus, Plus, AlertTriangle, ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Ticket } from '@/components/ui/Ticket';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Stamp } from '@/components/ui/Stamp';
import { DayChooser } from '@/components/pass/DayChooser';
import { scaleQuantity, formatQuantity } from '@/lib/recipes';
import { startOfWeek, formatDayLong } from '@/lib/dates';
import type { MealType } from '@/lib/vocab';
import { useRecipes } from '@/hooks/useRecipes';
import { useMembers } from '@/hooks/useMembers';

interface RecipeRecordByMember {
  memberId: number;
  clean: number;
  half: number;
  left: number;
}

interface RecipeRecord {
  timesPlated: number;
  lastPlated: string | null;
  byMember: RecipeRecordByMember[];
}

function verdictLabel(tally: RecipeRecordByMember): string {
  if (tally.clean === 0 && tally.half === 0 && tally.left === 0) return 'Untested';
  if (tally.left >= 2) return "Won't touch it";
  if (tally.clean >= 2 && tally.left === 0) return 'Loves it';
  return 'Mixed';
}

export default function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const recipeId = Number(id);
  const { data: recipes, loading, toggleFavourite, archiveRecipe, restoreRecipe } = useRecipes();
  const { data: members } = useMembers();
  const recipe = recipes.find((r) => r.id === recipeId);

  // The Kitchen record (Slice 3) lives only on GET /api/recipes/[id], not
  // the list endpoint useRecipes() fetches from — a dedicated small fetch
  // here, rather than adding N+1 rating queries to every list load.
  const [record, setRecord] = useState<RecipeRecord | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/recipes/${recipeId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.record) setRecord(data.record as RecipeRecord);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  // No effect needed to seed this from recipe.servings: every reader below
  // already falls back to `servings ?? recipe.servings`, so the very first
  // render (before the recipe has loaded) and every stepper click both
  // resolve to the right number without a synchronising effect.
  const [servings, setServings] = useState<number | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassChooser, setShowPassChooser] = useState(false);
  const [firedWeek, setFiredWeek] = useState<string | null>(null);
  const passAnchorRef = useRef<HTMLElement | null>(null);

  async function handlePutOnPass(serviceDate: string, slot: MealType) {
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_date: serviceDate, slot, recipe_id: recipe!.id }),
    });
    if (res.ok) {
      setFiredWeek(startOfWeek(serviceDate));
      setTimeout(() => setFiredWeek(null), 2000);
    }
    return res.ok;
  }

  if (loading && !recipe) {
    return (
      <div>
        <PageHeader kicker="MENU CARD" title="Loading…" />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div>
        <PageHeader kicker="MENU CARD" title="Not found" />
        <p className="text-chalk-soft">That dish isn&apos;t on the menu.</p>
        <Link href="/menu">
          <Button variant="ink" className="mt-4">
            Back to The Menu
          </Button>
        </Link>
      </div>
    );
  }

  const activeServings = servings ?? recipe.servings;
  const mealMeta = recipe.meal_types.map((m) => m.toUpperCase()).join('/');

  async function handleArchiveToggle() {
    setBusy(true);
    if (recipe!.archived) {
      await restoreRecipe(recipe!.id);
    } else {
      await archiveRecipe(recipe!.id);
    }
    setBusy(false);
    setConfirmingArchive(false);
  }

  return (
    <div>
      <PageHeader
        kicker={`${mealMeta} · PREP ${recipe.prep_minutes} · COOK ${recipe.cook_minutes} · SERVES ${recipe.servings}`}
        title={recipe.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => toggleFavourite(recipe.id, !recipe.favourite)}
              aria-label={recipe.favourite ? `Remove ${recipe.name} from favourites` : `Add ${recipe.name} to favourites`}
              aria-pressed={recipe.favourite}
              className="flex h-11 w-11 items-center justify-center rounded-sm border border-steel text-chalk-soft transition-colors hover:text-pass"
            >
              <Star size={18} aria-hidden="true" fill={recipe.favourite ? 'currentColor' : 'none'} className={recipe.favourite ? 'text-pass' : ''} />
            </button>
            {/* An archived ("86'd") dish is off the menu and can't be planned —
                the existing 86'D stamp below the header already communicates
                that state, so Put on the pass is simply omitted rather than
                shown disabled. */}
            {!recipe.archived &&
              (!firedWeek ? (
                <Button
                  variant="pass"
                  onClick={(e) => {
                    passAnchorRef.current = e.currentTarget;
                    setShowPassChooser(true);
                  }}
                >
                  <ClipboardList size={14} aria-hidden="true" /> Put on the pass
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Stamp variant="plated">On the pass</Stamp>
                  <Link href={`/?week=${firedWeek}`} className="font-mono text-xs uppercase tracking-wide text-pass underline">
                    View week
                  </Link>
                </div>
              ))}
            <Link href={`/menu/${recipe.id}/edit`}>
              <Button variant="ink">
                <Pencil size={14} aria-hidden="true" /> Edit
              </Button>
            </Link>
            {!confirmingArchive ? (
              <Button variant="ghost" onClick={() => (recipe.archived ? handleArchiveToggle() : setConfirmingArchive(true))} disabled={busy}>
                {recipe.archived ? (
                  <>
                    <RotateCcw size={14} aria-hidden="true" /> Bring it back
                  </>
                ) : (
                  <>
                    <Archive size={14} aria-hidden="true" /> 86 it
                  </>
                )}
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="danger" onClick={handleArchiveToggle} disabled={busy}>
                  Really 86 it?
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingArchive(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        }
      />

      {recipe.archived && (
        <div className="mb-4">
          <Stamp variant="eightysix">86&apos;D</Stamp>
        </div>
      )}

      {!recipe.compat.safe && (
        <div className="mb-6">
          <Ticket header="KITCHEN WARNING" variant="warning">
            <ul className="flex flex-col gap-1 text-sm text-ink">
              {recipe.compat.conflicts.map((conflict, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-eightysix" />
                  <span>
                    <strong>{conflict.memberName}:</strong> {conflict.reason}
                  </span>
                </li>
              ))}
            </ul>
          </Ticket>
        </div>
      )}

      {recipe.description && <p className="mb-4 text-chalk-soft">{recipe.description}</p>}

      {(recipe.allergens.length > 0 || recipe.tags.length > 0) && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {recipe.allergens.map((allergen) => (
            <Chip key={allergen} variant="allergen" onCounter>
              {allergen}
            </Chip>
          ))}
          {recipe.tags.map((tag) => (
            <Chip key={tag} variant="outline" onCounter>
              {tag}
            </Chip>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Ticket header="INGREDIENTS">
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setServings((s) => Math.max(1, (s ?? recipe.servings) - 1))}
              aria-label="Decrease servings"
              className="flex h-9 w-9 items-center justify-center rounded-sm border border-ink text-ink hover:bg-paper-2"
            >
              <Minus size={16} aria-hidden="true" />
            </button>
            <span className="min-w-[2ch] text-center font-mono text-lg text-ink">{activeServings}</span>
            <button
              type="button"
              onClick={() => setServings((s) => (s ?? recipe.servings) + 1)}
              aria-label="Increase servings"
              className="flex h-9 w-9 items-center justify-center rounded-sm border border-ink text-ink hover:bg-paper-2"
            >
              <Plus size={16} aria-hidden="true" />
            </button>
            <span className="font-mono text-xs uppercase tracking-widest text-ink-soft">servings</span>
          </div>
          <ul className="flex flex-col gap-2">
            {recipe.ingredients.map((ingredient) => {
              const scaled = scaleQuantity(ingredient.quantity, ingredient.unit ?? '', recipe.servings, activeServings);
              const formatted = ingredient.unit ? formatQuantity(scaled, ingredient.unit) : scaled !== null ? String(scaled) : '';
              return (
                <li key={ingredient.id} className="flex items-baseline justify-between gap-3 border-b border-steel/50 pb-2 text-sm">
                  <span className="text-ink">
                    {ingredient.name}
                    {ingredient.optional && <span className="text-ink-soft"> (optional)</span>}
                    {ingredient.note && <span className="block text-xs text-ink-soft">{ingredient.note}</span>}
                  </span>
                  {formatted && <span className="shrink-0 font-mono text-ink">{formatted}</span>}
                </li>
              );
            })}
          </ul>
        </Ticket>

        <Ticket header="METHOD">
          <ol className="flex flex-col gap-3">
            {recipe.method.map((step, index) => (
              <li key={index} className="flex gap-3 text-sm text-ink">
                <span className="shrink-0 font-mono text-ink-soft">{String(index + 1).padStart(2, '0')}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Ticket>
      </div>

      {record && (record.timesPlated > 0 || record.byMember.length > 0) && (
        <div className="mt-4">
          <Ticket
            header={`PLATED ${record.timesPlated} TIME${record.timesPlated === 1 ? '' : 'S'}${
              record.lastPlated ? ` · LAST ${formatDayLong(record.lastPlated)}` : ''
            }`}
          >
            <p className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-soft">Kitchen record</p>
            {record.byMember.length === 0 ? (
              <p className="text-sm text-ink-soft">Nobody&apos;s plate-checked this one yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-[1fr_repeat(3,3.5rem)] items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-ink-soft">
                  <span />
                  <span className="text-center">Clean</span>
                  <span className="text-center">Half</span>
                  <span className="text-center">Left</span>
                </div>
                {record.byMember.map((tally) => {
                  const memberName = members.find((m) => m.id === tally.memberId)?.name ?? `Member ${tally.memberId}`;
                  return (
                    <div key={tally.memberId} className="grid grid-cols-[1fr_repeat(3,3.5rem)] items-center gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm text-ink">{memberName}</span>
                        <span className="text-xs text-ink-soft">{verdictLabel(tally)}</span>
                      </div>
                      <span className="text-center font-mono text-sm text-ink">{tally.clean}</span>
                      <span className="text-center font-mono text-sm text-ink">{tally.half}</span>
                      <span className="text-center font-mono text-sm text-ink">{tally.left}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Ticket>
        </div>
      )}

      {showPassChooser && (
        <DayChooser
          open
          onClose={() => setShowPassChooser(false)}
          anchorRef={passAnchorRef}
          title="Put on the pass"
          initialSlot={recipe.meal_types[0] ?? 'dinner'}
          onConfirm={handlePutOnPass}
        />
      )}
    </div>
  );
}
