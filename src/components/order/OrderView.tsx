'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Flame, Share2, Copy, Trash2, Plus, ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Field, FieldSelect } from '@/components/ui/Field';
import { OrderLine } from './OrderLine';
import { OrderSkeleton } from './OrderSkeleton';
import { useOrder, type OrderItem } from '@/hooks/useOrder';
import { usePlan } from '@/hooks/usePlan';
import { AISLE_ORDER, STAPLES, toPlainText, type ShoppingLine } from '@/lib/order';
import { addDays, formatDateTimeStamp, formatWeekKicker, startOfWeek, todayISO } from '@/lib/dates';
import { AISLES, UNITS, type Aisle, type Unit } from '@/lib/vocab';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isStaple(name: string): boolean {
  return STAPLES.includes(name.toLowerCase());
}

function toShoppingLines(items: OrderItem[]): ShoppingLine[] {
  return items.map((i) => ({
    key: i.key,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    aisle: i.aisle,
    checked: i.checked,
    manual: i.manual,
    optional: i.optional,
    staple: isStaple(i.name),
    overridden: i.overridden,
    sources: i.sources,
  }));
}

/** The Order: the shopping list, rendered as a thermal-printed supplier order. See docs/VISION.md and docs/slices/04-order.md. */
export function OrderView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = todayISO();

  const weekParam = searchParams.get('week');
  const weekStart = startOfWeek(weekParam && ISO_DATE_RE.test(weekParam) ? weekParam : today);

  const { data, loading, generate, addLine, patchItem, removeItem, clearChecked } = useOrder(weekStart);
  // Only used to tell the two empty states apart (see the Screen section of
  // docs/slices/04-order.md): "NOTHING ON ORDER" + "Open the pass" when
  // there's nothing planned to shop for at all, vs. "Print the order" when
  // the pass has planned dishes but nobody has generated the list yet.
  const { data: planEntries, loading: planLoading } = usePlan(weekStart, addDays(weekStart, 6));
  const hasPlannedDishes = planEntries.some((e) => e.status === 'planned' && e.recipe_id !== null);
  // QA (second pass): show the skeleton until BOTH the order and the plan
  // have loaded — deciding between the two empty states from a still-empty
  // `planEntries` (usePlan's own fetch still in flight) could otherwise
  // flash "Nothing on order" for a real week that does have dishes planned.
  const showSkeleton = loading || planLoading;

  const [addingLine, setAddingLine] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnit, setNewUnit] = useState<Unit | ''>('');
  const [newAisle, setNewAisle] = useState<Aisle>('pantry');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  function goToWeek(nextStart: string) {
    router.push(`/order?week=${nextStart}`);
  }

  // toPlainText (Copy as text / Share) wants every line, manual and
  // generated alike, in one aisle-grouped list.
  const lines = useMemo(() => toShoppingLines(data.items), [data.items]);
  // The on-screen aisle blocks and STAPLES block only ever render GENERATED
  // lines (they're looked up by `key`, which a manual line doesn't have) —
  // manual lines get their own dedicated block below, so they're excluded
  // here. Without this, a manual line's aisle would print an aisle heading
  // with nothing rendered under it (the item lookup by key would miss).
  const generatedLines = lines.filter((l) => !l.manual);
  const nonStapleLines = generatedLines.filter((l) => !l.staple);
  const stapleLines = generatedLines.filter((l) => l.staple);
  const itemsById = useMemo(() => new Map(data.items.map((i) => [i.key ?? `manual-${i.id}`, i])), [data.items]);

  const grouped = AISLE_ORDER.map((aisle) => ({
    aisle,
    lines: nonStapleLines.filter((l) => l.aisle === aisle),
  })).filter((g) => g.lines.length > 0);

  async function handleGenerate() {
    setGenerating(true);
    await generate();
    setGenerating(false);
  }

  // "Undo edit" (QA, second pass): clears `overridden`, then regenerates —
  // clearing the flag alone doesn't recompute anything by itself, per
  // order-db.ts's patchOrderItem doc comment.
  async function handleUndo(itemId: number) {
    await patchItem(itemId, { overridden: false });
    await generate();
  }

  async function handleCopy() {
    const text = toPlainText(lines, formatWeekKicker(weekStart));
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied or unavailable — nothing more we can do.
    }
  }

  async function handleShare() {
    const text = toPlainText(lines, formatWeekKicker(weekStart));
    try {
      await navigator.share({ title: 'The Rice Kitchen — Supplier Order', text });
    } catch {
      // User cancelled the share sheet — not an error.
    }
  }

  async function handleClear() {
    await clearChecked();
    setConfirmingClear(false);
  }

  async function handleAddLine(e: FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const created = await addLine({
      name: trimmed,
      quantity: newQuantity.trim() === '' ? null : Number(newQuantity),
      unit: newUnit === '' ? null : newUnit,
      aisle: newAisle,
    });
    if (created) {
      setNewName('');
      setNewQuantity('');
      setNewUnit('');
      setNewAisle('pantry');
      setAddingLine(false);
    }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div>
      <PageHeader
        kicker="SUPPLIER ORDER"
        title="The Order"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToWeek(addDays(weekStart, -7))}
              aria-label="Previous week"
              className="flex h-11 w-11 items-center justify-center rounded-sm border border-steel text-chalk-soft hover:text-chalk"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => goToWeek(startOfWeek(today))}
              className="flex h-11 items-center rounded-sm border border-steel px-3 font-mono text-xs uppercase tracking-wide text-chalk-soft hover:text-chalk"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => goToWeek(addDays(weekStart, 7))}
              aria-label="Next week"
              className="flex h-11 w-11 items-center justify-center rounded-sm border border-steel text-chalk-soft hover:text-chalk"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        }
      />

      {showSkeleton && <OrderSkeleton />}

      {!showSkeleton && data.items.length === 0 && !hasPlannedDishes && (
        <EmptyState
          stampLabel="Empty"
          copy="Nothing on order. Fire some dishes on the pass first."
          action={
            <Link href="/">
              <Button variant="pass">Open the pass</Button>
            </Link>
          }
        />
      )}

      {!showSkeleton && data.items.length === 0 && hasPlannedDishes && (
        <EmptyState
          stampLabel="Ready"
          copy="The pass has dishes planned this week, but nothing's been printed yet."
          action={
            <Button variant="pass" onClick={handleGenerate} disabled={generating}>
              <ClipboardList size={16} aria-hidden="true" />
              {generating ? 'Printing…' : 'Print the order'}
            </Button>
          }
        />
      )}

      {!showSkeleton && data.items.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            <Button variant="ink" onClick={handleGenerate} disabled={generating}>
              <Flame size={16} aria-hidden="true" />
              {generating ? 'Regenerating…' : 'Regenerate from the pass'}
            </Button>
            {confirmingClear ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-widest text-chalk-soft">Clear ticked lines?</span>
                <Button variant="danger" onClick={handleClear}>
                  Confirm
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingClear(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmingClear(true)}>
                <Trash2 size={16} aria-hidden="true" />
                Clear ticked
              </Button>
            )}
            <Button variant="ghost" onClick={handleCopy}>
              <Copy size={16} aria-hidden="true" />
              {copied ? 'Copied' : 'Copy as text'}
            </Button>
            {canShare && (
              <Button variant="ghost" onClick={handleShare}>
                <Share2 size={16} aria-hidden="true" />
                Share
              </Button>
            )}
          </div>

          <div className="rk-receipt">
            <div className="rk-receipt__paper px-5 pb-4 font-mono text-ink">
              <div className="flex flex-col items-center gap-1 pb-3 text-center">
                <p className="font-display text-2xl uppercase tracking-widest">The Rice Kitchen</p>
                <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">Supplier Order</p>
                <p className="text-xs uppercase tracking-widest">{formatWeekKicker(weekStart)}</p>
                {data.generatedAt && (
                  <p className="text-[10px] uppercase tracking-widest text-ink-soft">
                    Printed {formatDateTimeStamp(data.generatedAt)}
                  </p>
                )}
              </div>
              <div className="rk-receipt__dashed mb-3" />

              <div className="mb-4">
                <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-ink-soft">
                  <span>
                    {data.checked}/{data.total} lines ticked
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-2">
                  <div
                    className="h-full rounded-full bg-pass transition-[width]"
                    style={{ width: data.total === 0 ? '0%' : `${Math.round((data.checked / data.total) * 100)}%` }}
                  />
                </div>
              </div>

              {grouped.map(({ aisle, lines: aisleLines }) => (
                <div key={aisle} className="mb-4">
                  <p className="mb-1 text-xs uppercase tracking-widest text-ink-soft">{aisle}</p>
                  <div className="rk-receipt__dashed" />
                  {aisleLines.map((l) => {
                    const item = l.key ? itemsById.get(l.key) : undefined;
                    if (!item) return null;
                    return (
                      <OrderLine
                        key={item.id}
                        item={item}
                        onToggle={() => patchItem(item.id, { checked: !item.checked }, true)}
                        onSave={(input) => patchItem(item.id, input)}
                        onDelete={() => removeItem(item.id)}
                        onUndo={() => handleUndo(item.id)}
                      />
                    );
                  })}
                </div>
              ))}

              {stapleLines.length > 0 && (
                <div className="mb-4">
                  <p className="mb-1 text-xs uppercase tracking-widest text-ink-soft">Staples</p>
                  <div className="rk-receipt__dashed" />
                  {stapleLines.map((l) => {
                    const item = l.key ? itemsById.get(l.key) : undefined;
                    if (!item) return null;
                    return (
                      <OrderLine
                        key={item.id}
                        item={item}
                        onToggle={() => patchItem(item.id, { checked: !item.checked }, true)}
                        onSave={(input) => patchItem(item.id, input)}
                        onDelete={() => removeItem(item.id)}
                        onUndo={() => handleUndo(item.id)}
                      />
                    );
                  })}
                </div>
              )}

              {/* Manual lines have no key, so they're not part of the aisle
                  blocks above (which look items up by key) — they always
                  get their own trailing block instead, regardless of the
                  aisle picked for them. */}
              {data.items.some((i) => i.manual) && (
                <div className="mb-4">
                  <p className="mb-1 text-xs uppercase tracking-widest text-ink-soft">Added</p>
                  <div className="rk-receipt__dashed" />
                  {data.items
                    .filter((i) => i.manual)
                    .map((item) => (
                      <OrderLine
                        key={item.id}
                        item={item}
                        onToggle={() => patchItem(item.id, { checked: !item.checked }, true)}
                        onSave={(input) => patchItem(item.id, input)}
                        onDelete={() => removeItem(item.id)}
                      />
                    ))}
                </div>
              )}

              <div className="rk-receipt__dashed mt-2 mb-3" />

              {addingLine ? (
                <form onSubmit={handleAddLine} className="mb-3 flex flex-col gap-2">
                  <Field label="Add a line" mono value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus placeholder="e.g. Kitchen roll" />
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Qty" mono type="number" value={newQuantity} onChange={(e) => setNewQuantity(e.target.value)} />
                    <FieldSelect label="Unit" mono value={newUnit} onChange={(e) => setNewUnit(e.target.value as Unit | '')}>
                      <option value="">—</option>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </FieldSelect>
                    <FieldSelect label="Aisle" mono value={newAisle} onChange={(e) => setNewAisle(e.target.value as Aisle)}>
                      {AISLES.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </FieldSelect>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" variant="pass" className="flex-1">
                      Add
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setAddingLine(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingLine(true)}
                  className="mb-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-sm border border-dashed border-steel font-mono text-xs uppercase tracking-widest text-ink-soft hover:border-pass hover:text-pass"
                >
                  <Plus size={14} aria-hidden="true" />
                  Add a line
                </button>
              )}

              <div className="rk-receipt__dashed mb-2" />
              <div className="pb-2 text-center text-xs uppercase tracking-widest text-ink-soft">
                <p>
                  {data.total} lines · {data.checked} ticked
                </p>
                <p>Thank you for your order</p>
              </div>
            </div>
            <div className="rk-receipt__torn" aria-hidden="true" />
          </div>
        </>
      )}
    </div>
  );
}
