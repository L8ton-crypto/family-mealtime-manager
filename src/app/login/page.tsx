'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Ticket } from '@/components/ui/Ticket';
import { Stamp } from '@/components/ui/Stamp';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { safeNextPath } from '@/lib/safeNext';

type LoginState = 'idle' | 'submitting' | 'rejected' | 'rate-limited';

function LoginForm() {
  const searchParams = useSearchParams();
  const [passphrase, setPassphrase] = useState('');
  const [state, setState] = useState<LoginState>('idle');
  const [shake, setShake] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('submitting');
    setShake(false);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      });

      if (res.status === 204) {
        // Hard-navigate so the freshly-set cookie is present on the next
        // request. safeNextPath rejects anything that isn't an honest
        // same-site relative path (open-redirect guard).
        window.location.href = safeNextPath(searchParams.get('next'));
        return;
      }

      setState(res.status === 429 ? 'rate-limited' : 'rejected');
      setShake(true);
    } catch {
      setState('rejected');
      setShake(true);
    }
  }

  return (
    <Ticket header="STAFF ENTRANCE · RICE KITCHEN" spikeIn={false} className={shake ? 'rk-shake' : ''}>
      <form
        onSubmit={handleSubmit}
        onAnimationEnd={() => setShake(false)}
        className="flex flex-col gap-5"
      >
        <h1 className="font-display text-5xl uppercase leading-none tracking-wide text-ink">Clock in</h1>

        {state === 'rejected' && (
          <div className="flex items-center gap-3">
            <Stamp variant="rejected">Rejected</Stamp>
            <p className="text-sm text-ink-soft">Passphrase didn&apos;t match.</p>
          </div>
        )}

        {state === 'rate-limited' && (
          <div className="flex items-center gap-3">
            <Stamp variant="rejected">Take Five</Stamp>
            <p className="text-sm text-ink-soft">Too many attempts. Wait 15 minutes and try again.</p>
          </div>
        )}

        <Field
          label="Passphrase"
          type="password"
          name="passphrase"
          autoFocus
          autoComplete="current-password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          required
        />

        <Button type="submit" variant="pass" disabled={state === 'submitting' || passphrase.length === 0}>
          Clock in
        </Button>
      </form>
    </Ticket>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-counter px-4 py-12">
      <div className="w-full max-w-sm">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
