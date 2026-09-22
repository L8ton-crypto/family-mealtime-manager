import Link from 'next/link';
import { Ticket } from '@/components/ui/Ticket';
import { Stamp } from '@/components/ui/Stamp';
import { Button } from '@/components/ui/Button';

/**
 * The global 404. Lives at the app root (not nested under the `(app)` route
 * group) per Next's own convention: a URL that matches no route segment at
 * all — the only way to reach this — falls through to the closest
 * not-found.tsx in the ROOT layout, not a nested group layout, so this
 * renders inside the root layout.tsx's own <html>/<body> (never its own —
 * that would nest a second <html> inside the first) without AppShell's nav
 * chrome. Styled with the same design-system primitives regardless, so it
 * still reads as part of the app rather than a bare Next.js error page. See
 * docs/slices/05-service.md's Hardening scope.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Ticket>
          <div className="flex flex-col items-start gap-4 py-2">
            <Stamp variant="neutral">Nope</Stamp>
            <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-ink">
              Not on the menu
            </h1>
            <p className="text-sm text-ink-soft">That page isn&apos;t on the pass. Head back to the kitchen.</p>
            <Link href="/">
              <Button variant="pass">Back to The Pass</Button>
            </Link>
          </div>
        </Ticket>
      </div>
    </div>
  );
}
