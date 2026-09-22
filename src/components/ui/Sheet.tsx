'use client';

import { ReactNode, RefObject, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** The element that triggered this sheet — its position anchors the desktop popover. Ignored below 1024px, where the sheet is always a bottom sheet. */
  anchorRef?: RefObject<HTMLElement | null>;
}

const DESKTOP_BREAKPOINT = 1024;
const DESKTOP_WIDTH = 380;

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
 * A bottom sheet on mobile (< 1024px) and an anchored popover on desktop
 * (>= 1024px), one shared implementation so every dismissible panel (the
 * action sheet, DishPicker, the 14-day chooser) behaves identically: Esc
 * closes, focus is trapped inside while open and restored to the trigger
 * on close, clicking the scrim closes, aria-modal is set, and the entrance
 * motion (.rk-sheet-in, see globals.css) honours prefers-reduced-motion via
 * the same global rule every other rk- animation does.
 */
export function Sheet({ open, onClose, title, children, anchorRef }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [desktopStyle, setDesktopStyle] = useState<CSSProperties>({});
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    function checkViewport() {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    }
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  useEffect(() => {
    if (!open || !isDesktop || !anchorRef?.current) {
      setDesktopStyle({});
      return;
    }
    const rect = anchorRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - DESKTOP_WIDTH - 8);
    // A `bottom`-anchored popover sizes itself upward from that point by its
    // natural content height (max-height only caps it, doesn't reserve
    // space) — so without an explicit maxHeight clamped to the space that's
    // actually free, a tall panel opening "upward" can render above the top
    // of the viewport entirely. Same idea for the downward case.
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
    setDesktopStyle(
      openUpward
        ? { left, bottom: window.innerHeight - rect.top + 8, width: DESKTOP_WIDTH, maxHeight: Math.max(160, spaceAbove) }
        : { left, top: rect.bottom + 8, width: DESKTOP_WIDTH, maxHeight: Math.max(160, spaceBelow) }
    );
  }, [open, isDesktop, anchorRef]);

  // Scroll lock only applies at the mobile (bottom sheet) breakpoint — the
  // desktop popover doesn't cover the page, so the page behind it stays
  // scrollable there. Re-runs (unlock then re-lock, or unlock and stay
  // unlocked) if `isDesktop` itself changes while open, e.g. a resize
  // crossing the breakpoint mid-session.
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

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          isDesktop
            ? 'rk-sheet-in fixed z-50 max-h-[80vh] overflow-y-auto rounded-lg border border-steel bg-paper p-4 shadow-xl'
            : 'rk-sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-lg border-t border-steel bg-paper p-4'
        }
        style={isDesktop ? desktopStyle : undefined}
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="min-w-0 truncate font-display text-2xl uppercase leading-none tracking-wide text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-ink-soft hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
