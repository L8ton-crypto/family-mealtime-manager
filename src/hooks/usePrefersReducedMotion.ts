'use client';

import { useEffect, useState } from 'react';

/**
 * True when the OS/browser has `prefers-reduced-motion: reduce` set.
 * Almost every animation in this app is pure CSS and already honours that
 * media query on its own (see globals.css's blanket
 * `@media (prefers-reduced-motion: reduce)` rule, which zeroes animation and
 * transition durations everywhere). This hook exists only for the handful of
 * spots that apply a STATIC transform in JS rather than an animated one —
 * the lifted drag ticket's scale/rotate (docs/slices/06's Part B "Visuals":
 * "none under reduced motion") — where there's no CSS transition to shorten,
 * just a value to not apply in the first place.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(mql.matches);
    function handleChange(e: MediaQueryListEvent) {
      setReduced(e.matches);
    }
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return reduced;
}
