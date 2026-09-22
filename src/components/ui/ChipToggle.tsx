'use client';

import { ReactNode } from 'react';
import { Chip } from './Chip';

type ChipVariant = 'plain' | 'soft' | 'outline' | 'allergen' | 'dislike';

interface ChipToggleProps {
  /** Visible AND accessible name — always set explicitly via aria-label, never left to be inferred from content. */
  label: string;
  pressed: boolean;
  onToggle: () => void;
  variant?: ChipVariant;
  icon?: ReactNode;
  /** Forwarded to Chip — set true when this toggle sits directly on the counter, outside a Ticket. See Chip's onCounter doc comment. */
  onCounter?: boolean;
}

/**
 * A toggleable chip button. Every chip toggle in the app should be built on
 * this: it always sets an explicit aria-label (the chip's own text) and
 * aria-pressed, so screen readers never see an unlabelled button — even
 * when the chip's visible content is icon + text or gets styled with low
 * opacity when unselected.
 */
export function ChipToggle({ label, pressed, onToggle, variant = 'plain', icon, onCounter = false }: ChipToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pressed}
      aria-label={label}
      className={`rounded-full transition-opacity ${pressed ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
    >
      <Chip variant={variant} onCounter={onCounter}>
        {icon}
        {label}
      </Chip>
    </button>
  );
}
