'use client';

import { useState } from 'react';
import { Ticket } from '@/components/ui/Ticket';
import { Button } from '@/components/ui/Button';
import { MemberForm } from '@/components/members/MemberForm';
import type { Member, MemberInput } from '@/hooks/useMembers';
import type { Recipe } from '@/hooks/useRecipes';
import type { FireTheWeekParams } from './FireTheWeekSheet';

interface OpeningNightProps {
  members: Member[];
  createMember: (input: MemberInput) => Promise<Member | null>;
  recipes: Recipe[];
  refreshRecipes: () => Promise<void>;
  onFireWeek: (params: FireTheWeekParams) => Promise<boolean>;
  onDone: () => void;
}

type Step = 1 | 2 | 3;

/**
 * The three-step first-run flow shown on The Pass when the household has
 * zero members — see docs/slices/05-service.md's "Opening night" scope.
 *
 * Entry into the flow is state-derived: PassView mounts this component only
 * once, the first time useMembers() resolves with zero members (see
 * PassView.tsx's `openingNightActive` state). Progression THROUGH the three
 * steps, once inside, is ordinary component state — after step 1 seats the
 * first member the household is no longer empty, so re-deriving "show step
 * 1" from the member count on every render would bounce straight back to
 * the normal (non-empty) Pass mid-flow instead of advancing to step 2.
 * Reloading the page mid-flow (after seating at least one member)
 * intentionally lands on the normal Pass, not back on step 2 — there is no
 * persisted "onboarding in progress" flag anywhere, per the spec's "not a
 * stored flag" instruction. Deleting every member still brings the whole
 * flow back from step 1, since PassView's own entry check re-runs the next
 * time it mounts with zero members.
 */
export function OpeningNight({ members, createMember, recipes, refreshRecipes, onFireWeek, onDone }: OpeningNightProps) {
  const [step, setStep] = useState<Step>(1);

  async function handleSeat(input: MemberInput) {
    await createMember(input);
  }

  async function goToStep2() {
    // Recipe `compat` is computed server-side against the whole household's
    // live allergies/restrictions (see docs/slices/01-menu.md) — refresh so
    // step 2's "safe for everyone" count reflects whoever was just seated in
    // step 1, not whatever the very first page load happened to fetch.
    await refreshRecipes();
    setStep(2);
  }

  return (
    <div className="mx-auto max-w-xl">
      {step === 1 && (
        <Ticket header="STEP 1 OF 3">
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="font-display text-3xl uppercase leading-none tracking-wide text-ink">Seat the family</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Who&apos;s eating here? Add everyone at the table — likes, dislikes, allergies and all. You
                can always add more later from The Table.
              </p>
            </div>

            {members.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-full border border-steel bg-paper-2 py-1 pl-1 pr-3"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm text-pass-ink"
                      style={{ backgroundColor: m.colour }}
                      aria-hidden="true"
                    >
                      {m.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="font-mono text-xs uppercase tracking-wide text-ink">{m.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Remounts the form (fresh, empty fields) after every successful
                seat, so step 1 reads as "keep seating people" rather than
                leaving the last person's details sitting in the fields. */}
            <MemberForm key={members.length} onSubmit={handleSeat} onCancel={() => {}} submitLabel="Seat them" />

            <Button variant="pass" disabled={members.length === 0} onClick={goToStep2}>
              Next
            </Button>
          </div>
        </Ticket>
      )}

      {step === 2 && <StepTwo recipes={recipes} onNext={() => setStep(3)} />}

      {step === 3 && <StepThree members={members} onFireWeek={onFireWeek} onDone={onDone} />}
    </div>
  );
}

function StepTwo({ recipes, onNext }: { recipes: Recipe[]; onNext: () => void }) {
  const active = recipes.filter((r) => !r.archived);
  const dishCount = active.length;
  const safe = active.filter((r) => r.compat.safe);
  const unsafe = active.filter((r) => !r.compat.safe);

  return (
    <Ticket header="STEP 2 OF 3">
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="font-display text-3xl uppercase leading-none tracking-wide text-ink">Check the menu</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {dishCount === 0
              ? "The menu's empty for now — you can write dishes any time from The Menu."
              : `${safe.length} of ${dishCount} dishes are safe for everyone.`}
          </p>
        </div>

        {unsafe.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">Not for everyone</p>
            <div className="flex flex-col gap-1.5">
              {unsafe.map((r) => {
                const names = Array.from(new Set(r.compat.conflicts.map((c) => c.memberName)));
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-sm border border-steel bg-paper-2 px-3 py-2"
                  >
                    <span className="min-w-0 truncate font-body text-sm text-ink">{r.name}</span>
                    <span className="shrink-0 font-mono text-xs uppercase tracking-wide text-eightysix">
                      Not for {names.join(', ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Button variant="pass" onClick={onNext}>
          Next
        </Button>
      </div>
    </Ticket>
  );
}

function StepThree({
  members,
  onFireWeek,
  onDone,
}: {
  members: Member[];
  onFireWeek: (params: FireTheWeekParams) => Promise<boolean>;
  onDone: () => void;
}) {
  const [firing, setFiring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFire() {
    setFiring(true);
    setError(null);
    const ok = await onFireWeek({
      slots: ['dinner'],
      attendees: members.map((m) => m.id),
      keepExisting: true,
    });
    setFiring(false);
    if (ok) onDone();
    else setError('Could not fire the week — try again.');
  }

  return (
    <Ticket header="STEP 3 OF 3">
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="font-display text-3xl uppercase leading-none tracking-wide text-ink">
            Fire your first week
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Let the kitchen propose a week of dinners for everyone at the table. Swap or scrap anything
            before it&apos;s fired for real.
          </p>
        </div>

        {error && <p className="text-sm text-eightysix">{error}</p>}

        <Button variant="pass" onClick={handleFire} disabled={firing}>
          {firing ? 'Firing…' : 'Fire the week'}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={firing}>
          Skip
        </Button>
      </div>
    </Ticket>
  );
}
