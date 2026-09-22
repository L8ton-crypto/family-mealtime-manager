'use client';

import { useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import type { OrderItem, PatchOrderItemInput } from '@/hooks/useOrder';
import { formatQuantity } from '@/lib/recipes';
import { AISLES, UNITS, type Aisle, type Unit } from '@/lib/vocab';
import { Field, FieldSelect } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

interface OrderLineProps {
  item: OrderItem;
  onToggle: () => void;
  onSave: (input: PatchOrderItemInput) => void;
  onDelete: () => void;
  /** Clears `overridden` and regenerates, restoring this line's computed values — see docs/slices/04-order.md's QA fixes (second pass). Only ever called for a generated, overridden line. */
  onUndo?: () => void;
}

function displayQuantity(item: OrderItem): string {
  if (item.quantity === null) return 'TO TASTE';
  return formatQuantity(item.quantity, item.unit ?? '').toUpperCase();
}

/** One tap-target (44px) line on the receipt: a tick box, the name (+ sources), quantity right-aligned. Long-press/Edit opens an inline edit row. */
export function OrderLine({ item, onToggle, onSave, onDelete, onUndo }: OrderLineProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity === null ? '' : String(item.quantity));
  const [unit, setUnit] = useState<Unit | ''>(item.unit ?? '');
  const [aisle, setAisle] = useState<Aisle>(item.aisle);

  const recipeNames = Array.from(new Set(item.sources.map((s) => s.recipeName)));

  function startEdit() {
    setName(item.name);
    setQuantity(item.quantity === null ? '' : String(item.quantity));
    setUnit(item.unit ?? '');
    setAisle(item.aisle);
    setEditing(true);
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      name: trimmed,
      quantity: quantity.trim() === '' ? null : Number(quantity),
      unit: unit === '' ? null : unit,
      aisle,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 border-b border-dashed border-steel py-3">
        <Field label="Name" mono value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Qty" mono type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <FieldSelect label="Unit" mono value={unit} onChange={(e) => setUnit(e.target.value as Unit | '')}>
            <option value="">—</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </FieldSelect>
        </div>
        <FieldSelect label="Aisle" mono value={aisle} onChange={(e) => setAisle(e.target.value as Aisle)}>
          {AISLES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </FieldSelect>
        <div className="flex gap-2">
          <Button variant="pass" onClick={save} className="flex-1">
            Save
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setEditing(false);
              onDelete();
            }}
            aria-label="Delete line"
          >
            <Trash2 size={16} aria-hidden="true" />
          </Button>
        </div>
        {/* Only a generated (overridden) line has computed values to go back
            to — a manual line's onUndo is never wired up (see OrderView). */}
        {item.overridden && onUndo && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              onUndo();
            }}
            className="self-start font-mono text-xs uppercase tracking-widest text-ink-soft underline decoration-dotted underline-offset-2 hover:text-pass"
          >
            Undo edit
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="group flex items-stretch gap-1 border-b border-dashed border-steel last:border-b-0">
      {/* The whole line is one 44px tap target — tapping the name, the
          checkbox glyph or the quantity all tick/untick it, per
          docs/slices/04-order.md's Screen section ("Each line is one tap
          target (44px)"). Edit/Delete are separate, smaller controls. */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={item.checked}
        aria-label={item.checked ? `Untick ${item.name}` : `Tick ${item.name}`}
        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 py-2 text-left"
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border-2 border-ink"
        >
          {item.checked && <span className="h-3 w-3 rounded-[1px] bg-ink" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className={`block truncate font-mono text-sm ${item.checked ? 'rk-strike text-ink-soft' : 'text-ink'}`}>
            {item.name}
            {item.optional && <span className="text-ink-soft"> (optional)</span>}
            {item.overridden && (
              <span className="ml-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-pass">Edited</span>
            )}
          </span>
          {recipeNames.length > 0 && (
            <span className="block truncate font-mono text-[10px] uppercase tracking-widest text-ink-soft">
              for {recipeNames.join(', ')}
            </span>
          )}
        </span>

        <span className={`shrink-0 whitespace-nowrap font-mono text-xs ${item.checked ? 'text-ink-soft' : 'text-ink'}`}>
          {displayQuantity(item)}
        </span>
      </button>

      {/* Always present (not hover-only — VISION.md: "No hover-only
          affordances", since a touchscreen has no hover) at low emphasis,
          full opacity on hover/focus/touch. */}
      <button
        type="button"
        onClick={startEdit}
        aria-label={`Edit ${item.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-ink-soft opacity-40 transition-opacity hover:opacity-100 hover:text-ink focus-visible:opacity-100"
      >
        <Pencil size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${item.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-ink-soft opacity-40 transition-opacity hover:opacity-100 hover:text-eightysix focus-visible:opacity-100"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
