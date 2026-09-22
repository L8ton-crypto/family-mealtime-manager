'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Ticket } from '@/components/ui/Ticket';

const STORAGE_KEY = 'rk-install-hint-dismissed';

function isIOSSafari(): boolean {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports as "Macintosh" with touch support, not "iPad" — the
  // touch-support check is what actually catches it.
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIOS && isSafari;
}

function isStandalone(): boolean {
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/**
 * A dismissible hint ticket shown once on iOS Safari when the app isn't
 * already installed to the home screen (detected via `navigator.standalone`
 * / the `display-mode: standalone` media query). iOS has no
 * `beforeinstallprompt` event to hook, so this is the only reliable way to
 * surface "you can install this" there. See docs/slices/05-service.md's PWA
 * scope.
 */
export function InstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return;
    } catch {
      // Private browsing / blocked storage: fall through — the hint will
      // just show again next time in that case, which is harmless.
    }
    if (isIOSSafari() && !isStandalone()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Private browsing / blocked storage: it just won't stay dismissed.
    }
  }

  if (!visible) return null;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-4">
      <Ticket variant="note" spikeIn={false}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink">
            <strong>ADD TO HOME SCREEN</strong> — tap Share, then &quot;Add to Home Screen&quot;, to open the pass
            full-screen next time.
          </p>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-ink-soft hover:text-ink"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </Ticket>
    </div>
  );
}
