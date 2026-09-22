'use client';

import { ClipboardEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Field, FieldSelect, FieldTextarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Ticket } from '@/components/ui/Ticket';
import { ChipToggle } from '@/components/ui/ChipToggle';
import { inferAisle, inferAllergens } from '@/lib/allergens';
import { tagConflicts } from '@/lib/recipes';
import { MEAL_TYPES, TAGS, UNITS, AISLES, ALLERGENS, type MealType, type Tag, type Unit, type Aisle, type Allergen } from '@/lib/vocab';
import type { Recipe, RecipeInput, RecipeIngredientInput } from '@/hooks/useRecipes';

interface RecipeFormProps {
  initial?: Recipe;
  onSubmit: (input: RecipeInput) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

interface IngredientRowState {
  key: string;
  name: string;
  quantity: string;
  unit: Unit | '';
  aisle: Aisle;
  allergens: Allergen[];
  optional: boolean;
  note: string;
  aisleTouched: boolean;
  allergensTouched: boolean;
}

let rowKeySeq = 0;
function newRowKey(): string {
  rowKeySeq += 1;
  return `row-${rowKeySeq}-${Date.now()}`;
}

function emptyRow(): IngredientRowState {
  return {
    key: newRowKey(),
    name: '',
    quantity: '',
    unit: '',
    aisle: 'pantry',
    allergens: [],
    optional: false,
    note: '',
    aisleTouched: false,
    allergensTouched: false,
  };
}

function rowsFromRecipe(recipe?: Recipe): IngredientRowState[] {
  if (!recipe || recipe.ingredients.length === 0) return [emptyRow()];
  return recipe.ingredients.map((i) => ({
    key: newRowKey(),
    name: i.name,
    quantity: i.quantity === null ? '' : String(i.quantity),
    unit: i.unit ?? '',
    aisle: i.aisle,
    allergens: i.allergens,
    optional: i.optional,
    note: i.note ?? '',
    // Existing ingredients (loaded from the server) already have a
    // deliberate aisle/allergen choice — treat them as touched so editing
    // an unrelated field never silently overwrites what's saved.
    aisleTouched: true,
    allergensTouched: true,
  }));
}

/** Shared editor for /menu/new and /menu/[id]/edit. One long Ticket form. */
export function RecipeForm({ initial, onSubmit, onCancel, submitLabel }: RecipeFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [mealTypes, setMealTypes] = useState<MealType[]>(initial?.meal_types ?? ['dinner']);
  const [tags, setTags] = useState<Tag[]>(initial?.tags ?? []);
  const [servings, setServings] = useState(initial?.servings ?? 4);
  const [prepMinutes, setPrepMinutes] = useState(initial?.prep_minutes ?? 0);
  const [cookMinutes, setCookMinutes] = useState(initial?.cook_minutes ?? 0);
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? '');
  const [ingredients, setIngredients] = useState<IngredientRowState[]>(() => rowsFromRecipe(initial));
  const [method, setMethod] = useState<string[]>(initial && initial.method.length > 0 ? initial.method : ['']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);
  const nameInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (pendingFocusIndex !== null) {
      nameInputRefs.current[pendingFocusIndex]?.focus();
      // Focusing a freshly-added ingredient row's name field is a genuine
      // side effect (moving focus), and clearing the one-shot trigger
      // afterwards is what stops this effect from re-firing — there's no
      // way to express "focus, then reset" without a setState here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingFocusIndex(null);
    }
  }, [pendingFocusIndex]);

  function toggleMealType(mealType: MealType) {
    setMealTypes((prev) => (prev.includes(mealType) ? prev.filter((m) => m !== mealType) : [...prev, mealType]));
  }

  function toggleTag(tag: Tag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function updateRow(key: string, patch: Partial<IngredientRowState>) {
    setIngredients((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function handleNameBlur(key: string) {
    setIngredients((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const patch: Partial<IngredientRowState> = {};
        if (!row.aisleTouched && row.name.trim()) patch.aisle = inferAisle(row.name);
        if (!row.allergensTouched && row.name.trim()) patch.allergens = inferAllergens(row.name);
        return { ...row, ...patch };
      })
    );
  }

  function addRow(afterIndex?: number) {
    setIngredients((prev) => {
      const next = [...prev];
      const insertAt = afterIndex === undefined ? next.length : afterIndex + 1;
      next.splice(insertAt, 0, emptyRow());
      setPendingFocusIndex(insertAt);
      return next;
    });
  }

  function removeRow(key: string) {
    setIngredients((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.key !== key)));
  }

  function moveRow(index: number, direction: -1 | 1) {
    setIngredients((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateStep(index: number, value: string) {
    setMethod((prev) => prev.map((step, i) => (i === index ? value : step)));
  }

  function addStep(afterIndex?: number) {
    setMethod((prev) => {
      const next = [...prev];
      next.splice(afterIndex === undefined ? next.length : afterIndex + 1, 0, '');
      return next;
    });
  }

  function removeStep(index: number) {
    setMethod((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setMethod((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleStepPaste(index: number, event: ClipboardEvent<HTMLTextAreaElement>) {
    const current = method[index];
    if (current.trim() !== '') return; // only split-on-paste into an empty step
    const pasted = event.clipboardData.getData('text');
    const lines = pasted
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length <= 1) return; // let the default single-line paste happen
    event.preventDefault();
    setMethod((prev) => {
      const next = [...prev];
      next.splice(index, 1, ...lines);
      return next;
    });
  }

  const conflictIngredients = useMemo(
    () =>
      ingredients
        .filter((row) => row.name.trim())
        .map((row) => ({ name: row.name.trim(), aisle: row.aisle, allergens: row.allergens, optional: row.optional })),
    [ingredients]
  );
  const kitchenCheck = useMemo(() => tagConflicts(tags, conflictIngredients), [tags, conflictIngredients]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (mealTypes.length === 0) {
      setError('At least one meal type is required.');
      return;
    }
    const payloadIngredients: RecipeIngredientInput[] = ingredients
      .filter((row) => row.name.trim())
      .map((row) => ({
        name: row.name.trim(),
        quantity: row.quantity.trim() === '' ? null : Number(row.quantity),
        unit: row.unit === '' ? null : row.unit,
        aisle: row.aisle,
        allergens: row.allergens,
        optional: row.optional,
        note: row.note.trim() === '' ? null : row.note.trim(),
      }));
    if (payloadIngredients.length === 0) {
      setError('At least one ingredient is required.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payloadMethod = method.map((step) => step.trim()).filter((step) => step.length > 0);

      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        meal_types: mealTypes,
        tags,
        servings,
        prep_minutes: prepMinutes,
        cook_minutes: cookMinutes,
        method: payloadMethod,
        source_url: sourceUrl.trim() === '' ? null : sourceUrl.trim(),
        favourite: initial?.favourite ?? false,
        ingredients: payloadIngredients,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Ticket header="DISH">
        <div className="flex flex-col gap-4">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error ?? undefined} required />
          <FieldTextarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-widest text-chalk-soft">Meal types</p>
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPES.map((mealType) => (
                <ChipToggle
                  key={mealType}
                  label={mealType}
                  pressed={mealTypes.includes(mealType)}
                  onToggle={() => toggleMealType(mealType)}
                  variant="outline"
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-widest text-chalk-soft">Tags</p>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((tag) => (
                <ChipToggle key={tag} label={tag} pressed={tags.includes(tag)} onToggle={() => toggleTag(tag)} />
              ))}
            </div>
          </div>
        </div>
      </Ticket>

      <Ticket header="NUMBERS">
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Servings"
            mono
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(Number(e.target.value) || 1)}
          />
          <Field
            label="Prep (min)"
            mono
            type="number"
            min={0}
            value={prepMinutes}
            onChange={(e) => setPrepMinutes(Number(e.target.value) || 0)}
          />
          <Field
            label="Cook (min)"
            mono
            type="number"
            min={0}
            value={cookMinutes}
            onChange={(e) => setCookMinutes(Number(e.target.value) || 0)}
          />
        </div>
      </Ticket>

      <Ticket header="INGREDIENTS">
        <div className="flex flex-col gap-4">
          {ingredients.map((row, index) => (
            <div key={row.key} className="rounded-sm border border-steel p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                <div className="col-span-2 sm:col-span-2">
                  <Field
                    label="Name"
                    value={row.name}
                    ref={(el) => {
                      nameInputRefs.current[index] = el;
                    }}
                    onChange={(e) => updateRow(row.key, { name: e.target.value })}
                    onBlur={() => handleNameBlur(row.key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addRow(index);
                      }
                    }}
                  />
                </div>
                <Field
                  label="Qty"
                  mono
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  placeholder="to taste"
                />
                <FieldSelect label="Unit" mono value={row.unit} onChange={(e) => updateRow(row.key, { unit: e.target.value as Unit | '' })}>
                  <option value="">—</option>
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </FieldSelect>
                <FieldSelect
                  label="Aisle"
                  value={row.aisle}
                  onChange={(e) => updateRow(row.key, { aisle: e.target.value as Aisle, aisleTouched: true })}
                >
                  {AISLES.map((aisle) => (
                    <option key={aisle} value={aisle}>
                      {aisle}
                    </option>
                  ))}
                </FieldSelect>
                <Field label="Note" value={row.note} onChange={(e) => updateRow(row.key, { note: e.target.value })} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {ALLERGENS.map((allergen) => (
                  <ChipToggle
                    key={allergen}
                    label={allergen}
                    variant="allergen"
                    pressed={row.allergens.includes(allergen)}
                    onToggle={() =>
                      updateRow(row.key, {
                        allergensTouched: true,
                        allergens: row.allergens.includes(allergen)
                          ? row.allergens.filter((a) => a !== allergen)
                          : [...row.allergens, allergen],
                      })
                    }
                  />
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => updateRow(row.key, { optional: !row.optional })}
                  aria-pressed={row.optional}
                  aria-label={`Mark ${row.name || 'this ingredient'} optional`}
                  className={`min-h-[36px] rounded-sm border px-3 font-mono text-xs uppercase tracking-wide transition-colors ${
                    row.optional ? 'border-pass text-pass' : 'border-steel text-ink-soft hover:bg-paper-2'
                  }`}
                >
                  Optional
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveRow(index, -1)}
                    disabled={index === 0}
                    aria-label="Move ingredient up"
                    className="flex h-8 w-8 items-center justify-center rounded-sm border border-steel text-ink-soft hover:bg-paper-2 disabled:opacity-30"
                  >
                    <ChevronUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRow(index, 1)}
                    disabled={index === ingredients.length - 1}
                    aria-label="Move ingredient down"
                    className="flex h-8 w-8 items-center justify-center rounded-sm border border-steel text-ink-soft hover:bg-paper-2 disabled:opacity-30"
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    disabled={ingredients.length <= 1}
                    aria-label={`Remove ${row.name || 'ingredient'}`}
                    className="flex h-8 w-8 items-center justify-center rounded-sm border border-steel text-ink-soft hover:bg-paper-2 disabled:opacity-30"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="ghost" onClick={() => addRow()}>
            <Plus size={14} aria-hidden="true" /> Add ingredient
          </Button>
        </div>
      </Ticket>

      <Ticket header="METHOD">
        <div className="flex flex-col gap-3">
          {method.map((step, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="mt-2 w-6 shrink-0 font-mono text-sm text-ink-soft">{String(index + 1).padStart(2, '0')}</span>
              <textarea
                value={step}
                onChange={(e) => updateStep(index, e.target.value)}
                onPaste={(e) => handleStepPaste(index, e)}
                rows={2}
                aria-label={`Step ${index + 1}`}
                className="min-h-[44px] flex-1 rounded-sm border border-steel bg-paper px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-pass"
              />
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => moveStep(index, -1)}
                  disabled={index === 0}
                  aria-label="Move step up"
                  className="flex h-7 w-7 items-center justify-center rounded-sm border border-steel text-ink-soft hover:bg-paper-2 disabled:opacity-30"
                >
                  <ChevronUp size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(index, 1)}
                  disabled={index === method.length - 1}
                  aria-label="Move step down"
                  className="flex h-7 w-7 items-center justify-center rounded-sm border border-steel text-ink-soft hover:bg-paper-2 disabled:opacity-30"
                >
                  <ChevronDown size={12} aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeStep(index)}
                disabled={method.length <= 1}
                aria-label={`Remove step ${index + 1}`}
                className="flex h-9 w-9 items-center justify-center rounded-sm border border-steel text-ink-soft hover:bg-paper-2 disabled:opacity-30"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
          <Button type="button" variant="ghost" onClick={() => addStep()}>
            <Plus size={14} aria-hidden="true" /> Add step
          </Button>
        </div>
      </Ticket>

      <Ticket header="SOURCE">
        <Field label="Source URL" type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
      </Ticket>

      {kitchenCheck.length > 0 && (
        <Ticket header="KITCHEN CHECK" variant="warning">
          <ul className="flex flex-col gap-1 text-sm text-ink">
            {kitchenCheck.map((conflict) => (
              <li key={conflict}>{conflict}</li>
            ))}
          </ul>
        </Ticket>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="pass" disabled={submitting}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
