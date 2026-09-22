'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'rk-theme';

interface UseThemeResult {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

/**
 * Reads/writes the <html data-theme> attribute the inline script in
 * layout.tsx already sets before hydration (to avoid a flash of the wrong
 * theme), and persists the choice to localStorage. Extracted from the
 * former standalone ThemeToggle component (Slice 0) so the Settings sheet
 * (Slice 5) can show and control the theme too, from one shared
 * implementation instead of two independently-drifting copies.
 */
export function useTheme(): UseThemeResult {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    // One-time sync from the DOM attribute — there's no non-effect way to
    // read that external, non-React-owned state on mount.
    const current = document.documentElement.getAttribute('data-theme');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private browsing / blocked storage: theme just won't persist.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
