'use client';

import { useEffect, useRef } from 'react';

type ShortcutMap = Record<string, () => void>;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** True while any Sheet (or the shortcuts help ticket, which shares the same dialog markup) is open. */
function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/**
 * Registers single, unmodified-key shortcuts (`[`, `]`, `t`, `f`, `/`, `?`,
 * ...) per docs/slices/05-service.md's Keyboard scope. Ignored while typing
 * in an input/textarea/select/contenteditable, and while any Sheet is open
 * — this hook never itself listens for "Escape", so Sheet's own existing
 * Escape-to-close handler is completely unaffected either way. Each caller
 * (AppShell for the global "?", The Pass for `[`/`]`/`t`/`f`, The Menu for
 * `/`) passes only the keys it owns, so there's never a collision to
 * resolve between pages.
 */
export function useKeyboardShortcuts(handlers: ShortcutMap): void {
  // A ref, not a dependency array entry: callers pass a fresh object literal
  // every render, and re-attaching the listener on every render would be
  // wasteful. Synced via its own effect (every render, no deps array) rather
  // than during render itself — mutating a ref while rendering is a React
  // rule-of-hooks violation (refs are read/written outside render).
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (isDialogOpen()) return;
      const handler = handlersRef.current[e.key];
      if (!handler) return;
      e.preventDefault();
      handler();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
