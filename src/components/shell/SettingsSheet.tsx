'use client';

import { type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Moon, Sun, LogOut, ShoppingBasket } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useMembers } from '@/hooks/useMembers';
import { useRecipes } from '@/hooks/useRecipes';
import packageJson from '../../../package.json';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
}

/**
 * Replaces the old bare "Clock out" button in the top bar: theme, session
 * and a quick household snapshot all live behind one Settings icon now. See
 * docs/slices/05-service.md's Settings sheet scope. Conditionally mounted by
 * AppShell (only while open), matching every other sheet in this codebase
 * (FireTheWeekSheet, DishPicker, ...) — so its member/recipe counts are
 * always freshly fetched on open rather than carried from a stale mount.
 */
export function SettingsSheet({ open, onClose, theme, onToggleTheme, anchorRef }: SettingsSheetProps) {
  const router = useRouter();
  const { data: members } = useMembers();
  const { data: recipes } = useRecipes();
  const dishCount = recipes.filter((r) => !r.archived).length;

  async function clockOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Settings" anchorRef={anchorRef} size="compact">
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-soft">Theme</p>
          <Button variant="ink" onClick={onToggleTheme} className="w-full justify-start">
            {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            Switch to {theme === 'dark' ? 'light' : 'dark'} mode
          </Button>
        </div>

        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-soft">Household</p>
          <div className="flex flex-col gap-1 rounded-sm border border-steel bg-paper-2 px-3 py-2 font-mono text-xs text-ink-soft">
            <p>
              {members.length} member{members.length === 1 ? '' : 's'} at the table
            </p>
            <p>
              {dishCount} dish{dishCount === 1 ? '' : 'es'} on the menu
            </p>
          </div>
          <Link href="/order" className="mt-2 block" onClick={onClose}>
            <Button variant="ink" className="w-full justify-start">
              <ShoppingBasket size={16} aria-hidden="true" />
              Print the order
            </Button>
          </Link>
        </div>

        <div>
          <Button variant="ghost" onClick={clockOut} className="w-full justify-start">
            <LogOut size={16} aria-hidden="true" />
            Clock out
          </Button>
        </div>

        <p className="text-center font-mono text-[10px] uppercase tracking-widest text-ink-soft">
          The Rice Kitchen · v{packageJson.version}
        </p>
      </div>
    </Sheet>
  );
}
