'use client';

import { ReactNode, useRef, useState } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { Nav } from './Nav';
import { SettingsSheet } from './SettingsSheet';
import { ShortcutsHelp } from './ShortcutsHelp';
import { InstallHint } from './InstallHint';
import { useTheme } from '@/hooks/useTheme';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

/** Top bar on desktop, bottom tab bar on mobile. Wraps every authenticated page. */
export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  // The only shortcut every page shares: "?" shows the shortcuts ticket.
  // Page-specific bindings ([, ], t, f on The Pass; / on The Menu) are
  // registered by those pages themselves — see docs/slices/05-service.md's
  // Keyboard scope and useKeyboardShortcuts's own doc comment.
  useKeyboardShortcuts({ '?': () => setHelpOpen(true) });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-steel bg-counter-2">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="whitespace-nowrap font-display text-2xl uppercase tracking-wide text-chalk">
            The Rice Kitchen
          </Link>
          <div className="hidden md:block">
            <Nav variant="top" />
          </div>
          <button
            ref={settingsButtonRef}
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-steel text-chalk-soft transition-colors hover:text-chalk"
          >
            <Settings size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <InstallHint />

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 pb-24 md:pb-10">{children}</main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-steel bg-counter-2 pb-[env(safe-area-inset-bottom)] md:hidden">
        <Nav variant="bottom" />
      </div>

      {settingsOpen && (
        <SettingsSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          theme={theme}
          onToggleTheme={toggleTheme}
          anchorRef={settingsButtonRef}
        />
      )}

      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
