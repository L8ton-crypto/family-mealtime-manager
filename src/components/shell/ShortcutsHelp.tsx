'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Ticket } from '@/components/ui/Ticket';

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: '[', description: 'Previous week on The Pass' },
  { keys: ']', description: 'Next week on The Pass' },
  { keys: 't', description: 'Jump to today on The Pass' },
  { keys: 'f', description: 'Fire the week' },
  { keys: '/', description: 'Search The Menu' },
  { keys: 'Esc', description: 'Close any open sheet' },
  { keys: '?', description: 'Show this list' },
];

/**
 * A small Ticket listing every keyboard shortcut — opened by pressing `?`
 * anywhere (see AppShell, which owns that global binding). Deliberately its
 * own lightweight overlay rather than the shared Sheet component: Sheet's
 * desktop popover needs a real anchorRef to position itself sensibly (see
 * docs/slices/04-order.md's carry-over fix 4), and `?` has no single
 * triggering element to anchor to — a plain centered overlay suits a short,
 * read-only list better than a bottom sheet or an anchorless popover
 * collapsing to the viewport's top-left corner.
 */
export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="rk-sheet-in relative z-10 w-full max-w-sm"
      >
        <Ticket header="KEYBOARD SHORTCUTS" spikeIn={false}>
          <div className="flex flex-col gap-2.5">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-center justify-between gap-3">
                <kbd className="min-w-[28px] rounded-sm border border-steel bg-paper-2 px-2 py-1 text-center font-mono text-xs text-ink">
                  {s.keys}
                </kbd>
                <span className="text-right text-sm text-ink-soft">{s.description}</span>
              </div>
            ))}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-steel font-mono text-xs uppercase tracking-widest text-ink-soft transition-colors hover:text-ink"
          >
            <X size={14} aria-hidden="true" />
            Close
          </button>
        </Ticket>
      </div>
    </div>,
    document.body
  );
}
