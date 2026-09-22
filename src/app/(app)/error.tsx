'use client';

import { useEffect } from 'react';
import { RotateCw } from 'lucide-react';
import { Ticket } from '@/components/ui/Ticket';
import { Stamp } from '@/components/ui/Stamp';
import { Button } from '@/components/ui/Button';

/**
 * Error boundary for every authenticated route (App Router convention: this
 * file catches a render/fetch error thrown anywhere under the `(app)` route
 * group, while `(app)/layout.tsx` — and so AppShell, nav and all — keeps
 * rendering around it). See docs/slices/05-service.md's Hardening scope.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // No telemetry in this app (see Slice 0's build notes) — a console log
    // is the only record of what actually broke, for whoever's looking at
    // devtools when it happens.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-10">
      <Ticket variant="warning">
        <div className="flex flex-col items-start gap-4 py-2">
          <Stamp variant="eightysix">86&apos;d</Stamp>
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-ink">
            Something fell off the pass
          </h1>
          <p className="text-sm text-ink-soft">
            The kitchen hit a snag rendering this page. Nothing on the pass, the menu, the table or the
            order was lost — try again.
          </p>
          <Button variant="pass" onClick={reset}>
            <RotateCw size={16} aria-hidden="true" />
            Try again
          </Button>
        </div>
      </Ticket>
    </div>
  );
}
