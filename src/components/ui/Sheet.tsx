'use client';

import { ReactNode, RefObject, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type SheetSize = 'compact' | 'roomy';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** The element that triggered this sheet — its position anchors the desktop popover. Ignored below 1024px (always a bottom sheet there) and ignored entirely for `size="roomy"` (always a centred modal). */
  anchorRef?: RefObject<HTMLElement | null>;
  /**
   * `compact` (default): desktop stays an anchored popover next to `anchorRef`
   * (420px wide, capped to 70vh); mobile opens at its natural height up to
   * 60vh and can be dragged up to roomy height via the handle. `roomy`: a
   * centred modal on desktop (min(720px, 92vw), up to 85vh); a bottom sheet
   * at ~92vh on mobile. See docs/slices/06-roomier-sheets-and-drag.md's
   * "Sheet sizing model".
   */
  size?: SheetSize;
  /**
   * Sticky footer, pinned below the scrollable body — where the sheet's
   * primary action lives (Fire, Done, Show N dishes, ...) so it's always
   * reachable without scrolling the body. Optional: plenty of sheets (the
   * action sheet, settings) have no single primary action and just scroll.
   */
  footer?: ReactNode;
}

const DESKTOP_BREAKPOINT = 1024;
const COMPACT_POPOVER_WIDTH = 420;
const COMPACT_MAX_HEIGHT_VH = 0.7;
// How far (px) the mobile handle must be dragged before a compact sheet
// snaps open to roomy height, or a pulled-up one snaps back down.
const PULL_THRESHOLD = 40;

// Module-scoped (not per-component-instance) so two Sheets open at once —
// e.g. the action sheet closing while a DishPicker opens in the same tick —
// share one lock/unlock counter. Only the FIRST lock call actually saves
// scroll position and applies the styles; only the call that brings the
// counter back to zero restores them. Without the counter, closing one of
// two simultaneously-open sheets would unlock scrolling while the other is
// still open.
let scrollLockCount = 0;
let savedScrollY = 0;
let savedBodyPosition = '';
let savedBodyTop = '';
let savedBodyWidth = '';
let savedHtmlOverflow = '';

/**
 * Locks document scrolling for the mobile bottom-sheet breakpoint: pins
 * `<body>` at its current scroll position via `position: fixed` + a
 * negative `top` offset (not just `overflow: hidden`, which doesn't
 * reliably block touch-scroll bounce on iOS) and hides overflow on
 * `<html>`. `unlockScroll` restores the exact original scroll position via
 * `window.scrollTo`, rather than leaving it wherever `position: fixed`
 * happened to visually land.
 */
function lockScroll() {
  if (scrollLockCount === 0) {
    savedScrollY = window.scrollY;
    savedBodyPosition = document.body.style.position;
    savedBodyTop = document.body.style.top;
    savedBodyWidth = document.body.style.width;
    savedHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.width = '100%';
  }
  scrollLockCount += 1;
}

function unlockScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.documentElement.style.overflow = savedHtmlOverflow;
    document.body.style.position = savedBodyPosition;
    document.body.style.top = savedBodyTop;
    document.body.style.width = savedBodyWidth;
    window.scrollTo(0, savedScrollY);
  }
}

/**
 * A bottom sheet on mobile (< 1024px) and, on desktop (>= 1024px), either an
 * anchored popover (`size="compact"`, with a real `anchorRef`) or a centred
 * modal dialog (`size="roomy"`, or `compact` with no `anchorRef` — see the
 * ShortcutsHelp comment on why that fallback exists). One shared
 * implementation so every dismissible panel behaves identically: Esc closes,
 * focus is trapped inside while open and restored to the trigger on close,
 * clicking the scrim closes, aria-modal is set, and the entrance motion
 * (.rk-sheet-in, see globals.css) honours prefers-reduced-motion via the same
 * global rule every other rk- animation does. See docs/slices/06's "Sheet
 * sizing model" for the full size contract.
 */
export function Sheet({ open, onClose, title, children, anchorRef, size = 'compact', footer }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [desktopStyle, setDesktopStyle] = useState<CSSProperties>({});
  const [isDesktop, setIsDesktop] = useState(false);
  // Mobile-only: whether a compact bottom sheet has been dragged up to roomy
  // height via its handle. Reset whenever the sheet closes, so it always
  // reopens at its natural (non-pulled) height.
  const [pulledUp, setPulledUp] = useState(false);
  const dragRef = useRef<{ startY: number } | null>(null);

  useEffect(() => {
    function checkViewport() {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    }
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPulledUp(false);
    }
  }, [open]);

  // Whether this open is actually going to render as an anchored popover
  // (compact + a real anchor element) vs a centred modal (roomy, always; or
  // compact with no anchor — see the ShortcutsHelp fallback). Read from a
  // ref's `.current` — deliberately computed inside an effect, not render:
  // reading a ref during render is a react-hooks/refs lint error, since
  // ref mutations don't trigger a re-render on their own and doing so risks
  // rendering stale/inconsistent output.
  const [usesPopover, setUsesPopover] = useState(false);

  useEffect(() => {
    const nextUsesPopover = size === 'compact' && Boolean(anchorRef?.current);
    setUsesPopover(nextUsesPopover);

    if (!open || !isDesktop || !nextUsesPopover || !anchorRef?.current) {
      setDesktopStyle({});
      return;
    }
    const rect = anchorRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - COMPACT_POPOVER_WIDTH - 8);
    // A `bottom`-anchored popover sizes itself upward from that point by its
    // natural content height (max-height only caps it, doesn't reserve
    // space) — so without an explicit maxHeight clamped to the space that's
    // actually free, a tall panel opening "upward" can render above the top
    // of the viewport entirely. Same idea for the downward case. Also
    // capped to 70vh even when more free space exists, per the spec.
    const capVh = window.innerHeight * COMPACT_MAX_HEIGHT_VH;
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
    setDesktopStyle(
      openUpward
        ? { left, bottom: window.innerHeight - rect.top + 8, width: COMPACT_POPOVER_WIDTH, maxHeight: Math.min(capVh, Math.max(160, spaceAbove)) }
        : { left, top: rect.bottom + 8, width: COMPACT_POPOVER_WIDTH, maxHeight: Math.min(capVh, Math.max(160, spaceBelow)) }
    );
  }, [open, isDesktop, anchorRef, size]);

  // Scroll lock only applies at the mobile (bottom sheet) breakpoint — the
  // desktop popover/modal doesn't cover the page the same way scroll needs
  // pinning for (the roomy desktop modal has its own scrim, but the page
  // behind a desktop sheet never needed locking before this slice either).
  // Re-runs (unlock then re-lock, or unlock and stay unlocked) if
  // `isDesktop` itself changes while open, e.g. a resize crossing the
  // breakpoint mid-session.
  useEffect(() => {
    if (!open || isDesktop) return;
    lockScroll();
    return () => unlockScroll();
  }, [open, isDesktop]);

  const getFocusable = () =>
    panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

  // Focus capture, initial focus and restore-on-close — keyed ONLY on
  // `open`. Deliberately excludes `onClose`: the caller passes a fresh
  // function identity on every one of ITS OWN re-renders (e.g. PassView
  // re-rendering because plan/member/recipe data refreshed while this sheet
  // sits open), and including it here would re-run this effect each time,
  // re-capturing "previously focused" as whatever already has focus INSIDE
  // the panel (the search field, say) instead of the original external
  // trigger — so Escape would later try to restore focus to an element
  // that's about to unmount, and focus would fall back to <body>.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // A child field's own `autoFocus` (e.g. DishPicker's search field) runs
    // synchronously during React's commit, before this effect — so if focus
    // already landed inside the panel, respect it instead of stealing it
    // back to the first focusable element (which is always the Close
    // button, right before the panel's actual first field in DOM order).
    if (!panelRef.current?.contains(document.activeElement)) {
      getFocusable()?.[0]?.focus();
    }

    return () => {
      previouslyFocused.current?.focus();
    };
  }, [open]);

  // The Escape/Tab handler is safe to re-attach on every onClose identity
  // change — removing and re-adding a listener has no lasting effect,
  // unlike the focus capture above.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = getFocusable();
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Mobile drag-handle: only a compact sheet can be pulled up (a roomy one
  // is already at its max). Doesn't live-follow the pointer — it just
  // measures net vertical movement on release and snaps, which is simpler
  // and avoids fighting the body's own scroll while dragging. See the
  // "100ms" / "reduced motion just snaps" spec: the CSS transition on the
  // panel's height (rk-sheet-pull, only applied for compact mobile sheets)
  // supplies the 100ms snap, and globals.css's blanket reduced-motion rule
  // (`* { transition-duration: 1ms !important; }`) already shortens it to
  // an instant snap — no extra branching needed here.
  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (size !== 'compact') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY };
  }
  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const deltaY = dragRef.current.startY - e.clientY; // positive = dragged up
    dragRef.current = null;
    if (deltaY > PULL_THRESHOLD) setPulledUp(true);
    else if (deltaY < -PULL_THRESHOLD) setPulledUp(false);
  }
  function handlePointerCancel() {
    dragRef.current = null;
  }

  if (!open || typeof document === 'undefined') return null;

  const useCenteredModal = size === 'roomy' || !usesPopover;

  const desktopPanelClassName = useCenteredModal
    ? 'rk-sheet-in flex w-full flex-col overflow-hidden rounded-lg border border-steel bg-paper shadow-xl'
    : 'rk-sheet-in fixed z-50 flex flex-col overflow-hidden rounded-lg border border-steel bg-paper shadow-xl';
  const desktopPanelStyle: CSSProperties = useCenteredModal
    ? size === 'roomy'
      ? { width: 'min(720px, 92vw)', maxHeight: '85vh' }
      : { width: 'min(420px, 92vw)', maxHeight: '70vh' }
    : desktopStyle;

  const mobileExpanded = size === 'roomy' || pulledUp;
  const mobilePanelStyle: CSSProperties = mobileExpanded ? { height: '92vh', maxHeight: '92vh' } : { maxHeight: '60vh' };

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={
        isDesktop
          ? desktopPanelClassName
          : `rk-sheet-in fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-lg border-t border-steel bg-paper pb-[env(safe-area-inset-bottom)] ${size === 'compact' ? 'transition-all duration-100 ease-out' : ''}`
      }
      style={isDesktop ? desktopPanelStyle : mobilePanelStyle}
    >
      {!isDesktop && (
        <div
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className="flex shrink-0 cursor-grab justify-center py-2 active:cursor-grabbing"
          style={{ touchAction: size === 'compact' ? 'none' : undefined }}
          aria-hidden="true"
        >
          <div className="h-1.5 w-10 rounded-full bg-steel" />
        </div>
      )}
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 pb-3 pt-1">
        <h2 className="min-w-0 truncate font-display text-2xl uppercase leading-none tracking-wide text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-ink-soft hover:text-ink"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      {footer && <div className="shrink-0 border-t border-steel bg-paper px-4 py-3">{footer}</div>}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={onClose} />
      {isDesktop && useCenteredModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">{panel}</div>
      ) : (
        panel
      )}
    </div>,
    document.body
  );
}
