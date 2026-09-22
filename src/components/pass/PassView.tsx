'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, History, Flame, ShoppingBasket, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonTicket } from '@/components/ui/SkeletonTicket';
import { Ticket } from '@/components/ui/Ticket';
import { PassTicket } from './PassTicket';
import { ActionSheet } from './ActionSheet';
import { DishPicker } from './DishPicker';
import { DraftTicket, GapTicket } from './DraftTicket';
import { FireTheWeekSheet, type FireTheWeekParams } from './FireTheWeekSheet';
import { usePlan, type PlanEntry } from '@/hooks/usePlan';
import { useMembers, type Member } from '@/hooks/useMembers';
import { useRecipes, type Recipe } from '@/hooks/useRecipes';
import { useOrder } from '@/hooks/useOrder';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { OpeningNight } from './OpeningNight';
import {
  addDays,
  formatDayAndMonth,
  formatDayShort,
  formatWeekdayShort,
  formatWeekKicker,
  startOfWeek,
  todayISO,
  weekDays,
} from '@/lib/dates';
import { MEAL_TYPES, type MealType } from '@/lib/vocab';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SheetState =
  | { type: 'none' }
  | { type: 'action'; entryId: number }
  | { type: 'picker'; mode: 'create'; day: string; slot: MealType }
  | { type: 'picker'; mode: 'swap'; entryId: number };

// The raw shape POST /api/plan/fill's proposals come back as — mirrors
// src/lib/engine/fill.ts's Proposal type, minus `reasons` (only the
// headline is shown on a draft ticket).
interface FillApiProposal {
  day: string;
  slot: MealType;
  recipeId?: number;
  score?: number;
  headline?: string;
  alternatives?: { recipeId: number; score: number; headline: string }[];
  /** The planned entries this proposal would replace if fired — only present when keepExisting is false. See fill.ts's Proposal type. */
  replaces?: { entryId: number; name: string }[];
  gap?: string;
}

interface DraftOption {
  recipeId: number;
  recipeName: string;
  score: number;
  headline: string;
}

interface DraftProposal {
  day: string;
  slot: MealType;
  gap?: string;
  options: DraftOption[];
  selectedIndex: number;
  replaces?: { entryId: number; name: string }[];
}

/** The Pass: the weekly planner. Home screen and showpiece — see docs/VISION.md and docs/slices/02-pass.md. */
export function PassView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = todayISO();

  const weekParam = searchParams.get('week');
  const weekStart = startOfWeek(weekParam && ISO_DATE_RE.test(weekParam) ? weekParam : today);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const from = days[0];
  const to = days[6];

  const { data: entries, loading, patchEntry, createEntry, removeEntry, refresh } = usePlan(from, to);
  const { data: members, loading: membersLoading, createMember } = useMembers();
  const { data: recipes, refresh: refreshRecipes } = useRecipes();
  // The Order link's unticked-lines count for the week in view — see
  // docs/slices/04-order.md's Screen section.
  const { data: order } = useOrder(weekStart);
  const uncheckedOrderCount = order.total - order.checked;

  const [selectedDay, setSelectedDay] = useState(() => (days.includes(today) ? today : days[0]));
  useEffect(() => {
    // Default selected day (mobile): today when the week in view contains
    // it, else Monday. Re-derived whenever the week actually changes (URL
    // navigation), not on every render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDay(days.includes(today) ? today : days[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const anchorRef = useRef<HTMLElement | null>(null);
  // Separate from `anchorRef` above (which follows whatever ticket/ghost
  // slot last opened the action sheet or picker) — the "Fire the week"
  // button lives in the page header, not on a ticket, and needs its own
  // stable anchor so the desktop popover opens next to it. See
  // docs/slices/04-order.md's carry-over fixes.
  const fireButtonRef = useRef<HTMLButtonElement | null>(null);
  const [sheet, setSheet] = useState<SheetState>({ type: 'none' });

  // "Fire the week" — proposals land here (as draft tickets on the rail),
  // not inside FireTheWeekSheet itself. Cleared on week navigation, since a
  // draft belongs to the week it was proposed for.
  const [fireSheetOpen, setFireSheetOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftProposal[] | null>(null);
  const [draftAttendees, setDraftAttendees] = useState<number[]>([]);
  // QA (Slice 3, second pass): when a fill run proposes nothing at all
  // (every targeted service already has a ticket), there's nothing to
  // review — show a dismissible note instead of an empty "Fire 0 tickets" bar.
  const [emptyFillNotice, setEmptyFillNotice] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts(null);
    setEmptyFillNotice(false);
  }, [weekStart]);

  // Opening night (see docs/slices/05-service.md and OpeningNight.tsx's own
  // doc comment): entry is state-derived from the household's member count,
  // but derived exactly ONCE, the first time useMembers() resolves — not
  // re-derived on every render, which would bounce back to the normal Pass
  // the moment step 1 seats its first member. `null` means "not decided
  // yet" (still loading); it only ever transitions null -> true/false once.
  const [openingNightActive, setOpeningNightActive] = useState<boolean | null>(null);
  useEffect(() => {
    if (!membersLoading && openingNightActive === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpeningNightActive(members.length === 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersLoading]);

  function goToWeek(nextStart: string) {
    router.push(`/?week=${nextStart}`);
  }

  function goToday() {
    goToWeek(startOfWeek(today));
    setSelectedDay(today);
  }

  // Page-owned keyboard shortcuts (desktop) — see docs/slices/05-service.md's
  // Keyboard scope and useKeyboardShortcuts's own doc comment for why these
  // are safe to register unconditionally (ignored while typing or while a
  // Sheet is open).
  useKeyboardShortcuts({
    '[': () => goToWeek(addDays(weekStart, -7)),
    ']': () => goToWeek(addDays(weekStart, 7)),
    t: goToday,
    f: () => setFireSheetOpen(true),
  });

  function openAction(entryId: number, el: HTMLElement) {
    anchorRef.current = el;
    setSheet({ type: 'action', entryId });
  }
  function openCreatePicker(day: string, slot: MealType, el: HTMLElement) {
    anchorRef.current = el;
    setSheet({ type: 'picker', mode: 'create', day, slot });
  }
  function openSwapPicker(entryId: number) {
    setSheet({ type: 'picker', mode: 'swap', entryId });
  }
  function closeSheet() {
    setSheet({ type: 'none' });
  }

  const activeEntry = sheet.type === 'action' ? (entries.find((e) => e.id === sheet.entryId) ?? null) : null;
  const swapEntry =
    sheet.type === 'picker' && sheet.mode === 'swap' ? (entries.find((e) => e.id === sheet.entryId) ?? null) : null;

  useEffect(() => {
    // If the entry behind an open sheet vanishes (removed elsewhere, or
    // after this tab's own remove), close the sheet instead of showing a
    // stale/blank panel.
    if (sheet.type === 'action' && !activeEntry) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      closeSheet();
    }
    if (sheet.type === 'picker' && sheet.mode === 'swap' && !swapEntry) {
      closeSheet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  async function handleChooseRecipe(recipe: Recipe): Promise<boolean> {
    if (sheet.type !== 'picker') return false;
    if (sheet.mode === 'create') {
      const created = await createEntry({ service_date: sheet.day, slot: sheet.slot, recipe_id: recipe.id });
      return Boolean(created);
    }
    const updated = await patchEntry(sheet.entryId, { recipe_id: recipe.id, custom_name: null });
    return Boolean(updated);
  }

  async function handleChooseCustom(name: string): Promise<boolean> {
    if (sheet.type !== 'picker') return false;
    if (sheet.mode === 'create') {
      const created = await createEntry({ service_date: sheet.day, slot: sheet.slot, recipe_id: null, custom_name: name });
      return Boolean(created);
    }
    const updated = await patchEntry(sheet.entryId, { recipe_id: null, custom_name: name });
    return Boolean(updated);
  }

  async function handleFireTheWeek(params: FireTheWeekParams): Promise<boolean> {
    const res = await fetch('/api/plan/fill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        week: weekStart,
        today,
        slots: params.slots,
        attendees: params.attendees,
        keepExisting: params.keepExisting,
        seed: params.seed,
      }),
    });
    if (!res.ok) return false;
    const { proposals } = (await res.json()) as { proposals: FillApiProposal[] };
    setFireSheetOpen(false);

    // Nothing was proposed at all (every targeted service already had a
    // ticket) — no drafts to review, so don't show an empty sticky bar.
    if (proposals.length === 0) {
      setEmptyFillNotice(true);
      return true;
    }

    const mapped: DraftProposal[] = proposals.map((p) => {
      if (p.gap || p.recipeId === undefined) {
        return { day: p.day, slot: p.slot, gap: p.gap ?? 'No safe dish for these covers', options: [], selectedIndex: 0 };
      }
      const rawOptions = [
        { recipeId: p.recipeId, score: p.score ?? 0, headline: p.headline ?? '' },
        ...(p.alternatives ?? []),
      ];
      const options: DraftOption[] = rawOptions.map((o) => ({
        ...o,
        recipeName: recipes.find((r) => r.id === o.recipeId)?.name ?? 'Unknown dish',
      }));
      return { day: p.day, slot: p.slot, options, selectedIndex: 0, replaces: p.replaces };
    });
    setDrafts(mapped);
    setDraftAttendees(params.attendees);
    return true;
  }

  function swapDraft(day: string, slot: MealType) {
    setDrafts(
      (prev) =>
        prev?.map((d) =>
          d.day === day && d.slot === slot && d.options.length > 1
            ? { ...d, selectedIndex: (d.selectedIndex + 1) % d.options.length }
            : d
        ) ?? null
    );
  }

  function draftFor(day: string, slot: MealType): DraftProposal | undefined {
    return drafts?.find((d) => d.day === day && d.slot === slot);
  }

  const fireableDrafts = drafts?.filter((d) => d.options.length > 0) ?? [];

  async function handleFireDrafts() {
    if (!drafts || fireableDrafts.length === 0) {
      setDrafts(null);
      return;
    }
    const batchEntries = fireableDrafts.map((d) => ({
      service_date: d.day,
      slot: d.slot,
      recipe_id: d.options[d.selectedIndex].recipeId,
      attendees: draftAttendees,
    }));
    // Every entry a fired draft `replaces` (keepExisting=false only — see
    // fill.ts) is deleted server-side in the same transaction as the new
    // entries are inserted.
    const replaceEntryIds = fireableDrafts.flatMap((d) => (d.replaces ?? []).map((r) => r.entryId));
    const res = await fetch('/api/plan/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: batchEntries, ...(replaceEntryIds.length > 0 ? { replaceEntryIds } : {}) }),
    });
    if (res.ok) {
      setDrafts(null);
      await refresh();
    }
  }

  function scrapDrafts() {
    setDrafts(null);
  }

  const entriesByDaySlot = useMemo(() => {
    const map = new Map<string, PlanEntry[]>();
    for (const entry of entries) {
      const key = `${entry.service_date}__${entry.slot}`;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position || a.id - b.id);
    return map;
  }, [entries]);

  function slotEntries(day: string, slot: MealType): PlanEntry[] {
    return entriesByDaySlot.get(`${day}__${slot}`) ?? [];
  }

  const pickerSlot: MealType =
    sheet.type === 'picker' ? (sheet.mode === 'create' ? sheet.slot : (swapEntry?.slot ?? 'dinner')) : 'dinner';
  const pickerDay: string =
    sheet.type === 'picker' ? (sheet.mode === 'create' ? sheet.day : (swapEntry?.service_date ?? today)) : today;
  const pickerAttendeeIds =
    sheet.type === 'picker'
      ? sheet.mode === 'create'
        ? members.map((m) => m.id)
        : (swapEntry?.attendees ?? [])
      : [];

  if (openingNightActive) {
    return (
      <OpeningNight
        members={members}
        createMember={createMember}
        recipes={recipes}
        refreshRecipes={refreshRecipes}
        onFireWeek={handleFireTheWeek}
        onDone={() => setOpeningNightActive(false)}
      />
    );
  }

  return (
    <div>
      <PageHeader
        kicker={formatWeekKicker(weekStart)}
        title="The Pass"
        actions={
          <div className="flex items-center gap-2">
            <button
              ref={fireButtonRef}
              type="button"
              onClick={() => setFireSheetOpen(true)}
              aria-label="Fire the week"
              className="rk-hard-shadow flex h-11 items-center gap-2 rounded-sm border border-ink bg-pass px-3 font-mono text-xs uppercase tracking-wide text-pass-ink"
            >
              <Flame size={16} aria-hidden="true" />
              <span className="hidden sm:inline" aria-hidden="true">
                Fire the week
              </span>
            </button>
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
              onClick={goToday}
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
            <Link
              href="/pass/history"
              aria-label="Past services"
              className="flex h-11 items-center gap-2 rounded-sm border border-steel px-3 font-mono text-xs uppercase tracking-wide text-chalk-soft hover:text-chalk"
            >
              <History size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Past services</span>
            </Link>
            <Link
              href={`/order?week=${weekStart}`}
              aria-label={`Order${uncheckedOrderCount > 0 ? `, ${uncheckedOrderCount} lines unticked` : ''}`}
              className="flex h-11 items-center gap-2 rounded-sm border border-steel px-3 font-mono text-xs uppercase tracking-wide text-chalk-soft hover:text-chalk"
            >
              <ShoppingBasket size={16} aria-hidden="true" />
              <span className="hidden sm:inline" aria-hidden="true">
                Order
              </span>
              {uncheckedOrderCount > 0 && <span aria-hidden="true">{uncheckedOrderCount}</span>}
            </Link>
          </div>
        }
      />

      {/* Desktop: 7-column week grid */}
      <div className="hidden lg:grid lg:grid-cols-7 lg:gap-3">
        {days.map((day) => (
          <DayColumn
            key={day}
            day={day}
            isToday={day === today}
            isPast={day < today}
            members={members}
            slotEntries={slotEntries}
            onOpenAction={openAction}
            onOpenPicker={openCreatePicker}
            loading={loading}
            draftFor={draftFor}
            onSwapDraft={swapDraft}
          />
        ))}
      </div>

      {/* Mobile: day strip + the selected day's slots, stacked */}
      <div className="lg:hidden">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {days.map((day) => {
            const selected = day === selectedDay;
            const isToday = day === today;
            const isPast = day < today;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                aria-current={selected ? 'date' : undefined}
                data-past={(isPast && !selected) || undefined}
                // Used to dim past, unselected days with opacity-50 — a
                // Lighthouse accessibility audit caught that halving
                // opacity against the near-black counter dropped this
                // button's text below the required 4.5:1 contrast ratio
                // (same issue, same fix, as DayColumn's own opacity-60 —
                // see that component's comment). Dropped in favour of the
                // border-only distinction every non-today day already has.
                className={`flex min-w-[60px] shrink-0 flex-col items-center rounded-sm border px-2 py-2 font-mono text-xs uppercase tracking-wide transition-colors ${
                  selected ? 'border-pass bg-pass text-pass-ink' : isToday ? 'border-pass text-pass' : 'border-steel text-chalk-soft'
                }`}
              >
                {formatDayShort(day)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-4">
          {MEAL_TYPES.map((slot) => (
            <SlotRail
              key={slot}
              label={slot}
              entries={slotEntries(selectedDay, slot)}
              members={members}
              onOpenAction={openAction}
              onOpenPicker={(el) => openCreatePicker(selectedDay, slot, el)}
              loading={loading}
              draft={draftFor(selectedDay, slot)}
              onSwapDraft={() => swapDraft(selectedDay, slot)}
            />
          ))}
        </div>
      </div>

      {!loading && entries.length === 0 && !emptyFillNotice && (
        <p className="mt-6 text-center text-sm text-chalk-soft">The pass is empty this week. Tap a slot to fire something.</p>
      )}

      {emptyFillNotice && (
        <div className="mt-6">
          <Ticket variant="note">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink">
                <strong>THE PASS IS FULL</strong> — every service you picked already has a ticket.
              </p>
              <button
                type="button"
                onClick={() => setEmptyFillNotice(false)}
                aria-label="Dismiss"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-ink-soft hover:text-ink"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </Ticket>
        </div>
      )}

      {activeEntry && (
        <ActionSheet
          open={sheet.type === 'action'}
          onClose={closeSheet}
          anchorRef={anchorRef}
          entry={activeEntry}
          members={members}
          onPatch={(input, optimistic) => patchEntry(activeEntry.id, input, optimistic)}
          onRemove={() => removeEntry(activeEntry.id)}
          onSwap={() => openSwapPicker(activeEntry.id)}
          onRatingSaved={refresh}
        />
      )}

      {sheet.type === 'picker' && (
        <DishPicker
          open
          onClose={closeSheet}
          anchorRef={anchorRef}
          day={pickerDay}
          slot={pickerSlot}
          recipes={recipes}
          members={members}
          attendeeIds={pickerAttendeeIds}
          onChooseRecipe={handleChooseRecipe}
          onChooseCustom={handleChooseCustom}
        />
      )}

      {fireSheetOpen && (
        <FireTheWeekSheet
          open={fireSheetOpen}
          onClose={() => setFireSheetOpen(false)}
          members={members}
          onFire={handleFireTheWeek}
          anchorRef={fireButtonRef}
        />
      )}

      {drafts && (
        <div className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 md:bottom-6">
          <div className="rk-hard-shadow flex w-full max-w-sm items-center gap-2 rounded-sm border border-ink bg-counter-2 p-3">
            <button
              type="button"
              onClick={handleFireDrafts}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-sm border border-ink bg-pass px-3 font-mono text-xs uppercase tracking-wide text-pass-ink"
            >
              Fire {fireableDrafts.length} ticket{fireableDrafts.length === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              onClick={scrapDrafts}
              className="flex h-11 items-center justify-center rounded-sm border border-steel bg-transparent px-3 font-mono text-xs uppercase tracking-wide text-chalk-soft hover:text-chalk"
            >
              Scrap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface DayColumnProps {
  day: string;
  isToday: boolean;
  isPast: boolean;
  members: Member[];
  slotEntries: (day: string, slot: MealType) => PlanEntry[];
  onOpenAction: (entryId: number, el: HTMLElement) => void;
  onOpenPicker: (day: string, slot: MealType, el: HTMLElement) => void;
  loading: boolean;
  draftFor: (day: string, slot: MealType) => DraftProposal | undefined;
  onSwapDraft: (day: string, slot: MealType) => void;
}

function DayColumn({
  day,
  isToday,
  isPast,
  members,
  slotEntries,
  onOpenAction,
  onOpenPicker,
  loading,
  draftFor,
  onSwapDraft,
}: DayColumnProps) {
  return (
    // A past day used to render at opacity-60 across the whole column — a
    // Lighthouse accessibility audit (see docs/slices/05-service.md's
    // Hardening scope) caught that halving opacity against the near-black
    // counter background dropped every bit of text inside (weekday label,
    // slot labels, "+ Fire something") below the required 4.5:1 contrast
    // ratio. `isPast` is intentionally unused for styling now, kept as a
    // prop only in case a future, contrast-safe "past day" treatment wants
    // it (e.g. a border or icon, not a blanket text-dimming opacity).
    <div className={`relative rounded-sm ${isToday ? 'rk-heat-lamp' : ''}`} data-past={isPast || undefined}>
      <div className={`relative z-10 mb-3 border-b-2 pb-2 ${isToday ? 'border-pass' : 'border-transparent'}`}>
        <p className="font-display text-2xl uppercase leading-none tracking-wide text-chalk">{formatWeekdayShort(day)}</p>
        <p className="font-mono text-xs text-chalk-soft">{formatDayAndMonth(day)}</p>
      </div>
      <div className="relative z-10 flex flex-col gap-3">
        {MEAL_TYPES.map((slot) => (
          <SlotRail
            key={slot}
            label={slot}
            entries={slotEntries(day, slot)}
            members={members}
            onOpenAction={onOpenAction}
            onOpenPicker={(el) => onOpenPicker(day, slot, el)}
            loading={loading}
            draft={draftFor(day, slot)}
            onSwapDraft={() => onSwapDraft(day, slot)}
          />
        ))}
      </div>
    </div>
  );
}

interface SlotRailProps {
  label: MealType;
  entries: PlanEntry[];
  members: Member[];
  onOpenAction: (entryId: number, el: HTMLElement) => void;
  onOpenPicker: (el: HTMLElement) => void;
  /** While usePlan is still loading THIS week's entries, show skeleton tickets instead of ghosts — see docs/slices/03-engine.md's carry-over fix. */
  loading: boolean;
  draft?: DraftProposal;
  onSwapDraft: () => void;
}

function SlotRail({ label, entries, members, onOpenAction, onOpenPicker, loading, draft, onSwapDraft }: SlotRailProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-chalk-soft">{label}</p>
      {loading ? (
        <SkeletonTicket />
      ) : (
        <>
          {entries.map((entry) => (
            <PassTicket
              key={`${entry.id}-${entry.updated_at}`}
              entry={entry}
              members={members}
              onOpen={(el) => onOpenAction(entry.id, el)}
            />
          ))}
          {draft?.gap && <GapTicket slot={label} />}
          {draft && !draft.gap && draft.options.length > 0 && (
            <DraftTicket
              slot={label}
              name={draft.options[draft.selectedIndex].recipeName}
              headline={draft.options[draft.selectedIndex].headline}
              canSwap={draft.options.length > 1}
              onSwap={onSwapDraft}
              replaces={draft.replaces?.map((r) => r.name)}
            />
          )}
          <GhostSlot onClick={onOpenPicker} />
        </>
      )}
    </div>
  );
}

function GhostSlot({ onClick }: { onClick: (el: HTMLElement) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.currentTarget)}
      className="flex min-h-[48px] w-full items-center justify-center rounded-sm border border-dashed border-steel px-3 py-2 font-mono text-xs uppercase tracking-widest text-chalk-soft transition-colors hover:border-pass hover:text-pass"
    >
      + Fire something
    </button>
  );
}
