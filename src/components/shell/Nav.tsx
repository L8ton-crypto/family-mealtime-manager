'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, ChefHat, Users, ShoppingCart, type LucideIcon } from 'lucide-react';

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: 'The Pass', icon: ClipboardList },
  { href: '/menu', label: 'The Menu', icon: ChefHat },
  { href: '/table', label: 'The Table', icon: Users },
  { href: '/order', label: 'The Order', icon: ShoppingCart },
];

interface NavProps {
  variant: 'top' | 'bottom';
}

/** Tabs: The Pass, The Menu, The Table, The Order. Active tab in pass orange. */
export function Nav({ variant }: NavProps) {
  const pathname = usePathname();
  const isBottom = variant === 'bottom';

  return (
    <nav aria-label="Primary" className={isBottom ? 'w-full' : ''}>
      <ul className={isBottom ? 'flex items-stretch justify-around' : 'flex items-center gap-1'}>
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className={isBottom ? 'flex-1' : ''}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-sm font-mono uppercase tracking-wide transition-colors ${
                  isBottom ? 'flex-col gap-0.5 px-2 py-2 text-[10px]' : 'px-3 text-xs'
                } ${active ? 'text-pass' : 'text-chalk-soft hover:text-chalk'}`}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
