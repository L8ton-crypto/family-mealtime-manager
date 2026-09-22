'use client';

import { FormEvent, useState } from 'react';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { TagEditor } from './TagEditor';
import { AGE_GROUPS, ALLERGY_PRESETS, MEMBER_COLOURS, RESTRICTION_PRESETS, type AgeGroup } from '@/lib/members-schema';
import type { Member, MemberInput } from '@/hooks/useMembers';

interface MemberFormProps {
  initial?: Member;
  onSubmit: (input: MemberInput) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

/** Add/edit form, always inline on a Ticket — never a modal. */
export function MemberForm({ initial, onSubmit, onCancel, submitLabel }: MemberFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(initial?.age_group ?? 'adult');
  const [colour, setColour] = useState(initial?.colour ?? MEMBER_COLOURS[0]);
  const [likes, setLikes] = useState<string[]>(initial?.likes ?? []);
  const [dislikes, setDislikes] = useState<string[]>(initial?.dislikes ?? []);
  const [restrictions, setRestrictions] = useState<string[]>(initial?.restrictions ?? []);
  const [allergies, setAllergies] = useState<string[]>(initial?.allergies ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        age_group: ageGroup,
        colour,
        likes,
        dislikes,
        restrictions,
        allergies,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field
        label="Name"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={error ?? undefined}
        required
      />

      <div>
        <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-chalk-soft">Age group</span>
        <div className="flex flex-wrap gap-1 rounded-sm border border-steel p-1" role="radiogroup" aria-label="Age group">
          {AGE_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              role="radio"
              aria-checked={ageGroup === group}
              onClick={() => setAgeGroup(group)}
              className={`min-h-[36px] flex-1 rounded-sm px-2 text-xs font-mono uppercase tracking-wide transition-colors ${
                ageGroup === group ? 'bg-pass text-pass-ink' : 'text-ink-soft hover:bg-paper-2'
              }`}
            >
              {group}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-chalk-soft">Colour</span>
        <div className="flex flex-wrap gap-2">
          {MEMBER_COLOURS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColour(swatch)}
              aria-label={`Choose colour ${swatch}`}
              aria-pressed={colour === swatch}
              className={`h-9 w-9 rounded-full border-2 transition-transform ${
                colour === swatch ? 'border-ink scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </div>

      <TagEditor label="Likes" presets={[]} value={likes} onChange={setLikes} chipVariant="plain" />
      <TagEditor label="Dislikes" presets={[]} value={dislikes} onChange={setDislikes} chipVariant="dislike" />
      <TagEditor
        label="Restrictions"
        presets={RESTRICTION_PRESETS}
        value={restrictions}
        onChange={setRestrictions}
        chipVariant="outline"
      />
      <TagEditor
        label="Allergies"
        presets={ALLERGY_PRESETS}
        value={allergies}
        onChange={setAllergies}
        chipVariant="allergen"
      />

      <div className="flex gap-2">
        <Button type="submit" variant="pass" disabled={submitting}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
