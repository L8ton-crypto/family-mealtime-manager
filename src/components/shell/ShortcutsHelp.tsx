'use client';

import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';

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
  { keys: '←→', description: 'Move a lifted ticket to a different day' },
  { keys: '↑↓', description: 'Move a lifted ticket to a different service' },
  { keys: 'Space', description: 'Lift or drop a ticket on The Pass' },
  { keys: 'Esc', description: 'Cancel a lift, or close any open sheet' },
  { keys: '?', description: 'Show this list' },
];

/**
 * A short read-only list of every keyboard shortcut, opened by pressing `?`
 * anywhere (see AppShell, which owns that global binding). Uses the shared
 * `Sheet` component at `size="compact"`, per docs/slices/06's "Sheet sizing
 * model" ("Used by: ... shortcuts help"). `?` has no single triggering
 * element to anchor a popover to, so no `anchorRef` is passed — Sheet's own
 * fallback for a compact sheet with no anchor is a small centred modal
 * (never off-screen, capped to 70vh), rather than the anchored popover
 * collapsing to the viewport's top-left corner the old bespoke overlay here
 * was written to avoid. See Sheet's own doc comment for that fallback.
 */
export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      size="compact"
      footer={
        <Button variant="ghost" onClick={onClose} className="w-full">
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-2.5">
        {SHORTCUTS.map((s) => (
          <div key={s.keys + s.description} className="flex items-center justify-between gap-3">
            <kbd className="min-w-[48px] shrink-0 rounded-sm border border-steel bg-paper-2 px-2 py-1 text-center font-mono text-xs text-ink">
              {s.keys}
            </kbd>
            <span className="text-right text-sm text-ink-soft">{s.description}</span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
