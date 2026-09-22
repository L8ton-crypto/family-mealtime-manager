import { AlertTriangle, Ban } from 'lucide-react';
import { ReactNode } from 'react';

type ChipVariant = 'plain' | 'soft' | 'outline' | 'allergen' | 'dislike';

interface ChipProps {
  children: ReactNode;
  variant?: ChipVariant;
  className?: string;
  onRemove?: () => void;
  /**
   * Set true when this chip sits directly on the counter background,
   * outside a Ticket's paper. `ink`/`ink-soft` are fixed near-black colours
   * meant for text ON PAPER — on the near-black dark-mode counter they
   * become invisible (ink-on-ink). `chalk`/`chalk-soft` are theme-aware
   * (near-white in dark mode, near-black in light mode, per globals.css)
   * and read correctly on the counter in both themes, so onCounter swaps to
   * those for the variants that don't carry their own opaque background.
   * `plain` (opaque bg-paper-2) and `allergen` (fixed saturated red) are
   * already visible in either context and are unaffected by this prop.
   */
  onCounter?: boolean;
}

const variantClasses: Record<ChipVariant, string> = {
  plain: 'border-transparent bg-paper-2 text-ink',
  soft: 'border-steel bg-transparent text-ink-soft',
  outline: 'border-ink bg-transparent text-ink',
  allergen: 'border-eightysix bg-transparent text-eightysix',
  // Visually distinct from every other chip variant so a dislike can never
  // be mistaken for a like at a glance: ink-soft (muted, not "plain" full
  // ink) plus a Ban icon, mirroring how allergen chips get their own icon.
  dislike: 'border-steel bg-transparent text-ink-soft',
};

// Only the variants above that rely on the fixed `ink`/`ink-soft` tokens
// need an on-counter override — see the ChipProps.onCounter doc comment.
const onCounterVariantClasses: Partial<Record<ChipVariant, string>> = {
  soft: 'border-steel bg-transparent text-chalk-soft',
  outline: 'border-chalk bg-transparent text-chalk',
  dislike: 'border-steel bg-transparent text-chalk-soft',
};

/** Small pill for tags. Allergen chips are always red-outlined with a warning icon; dislike chips carry a Ban icon. */
export function Chip({ children, variant = 'plain', className = '', onRemove, onCounter = false }: ChipProps) {
  const colourClasses = (onCounter && onCounterVariantClasses[variant]) || variantClasses[variant];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-xs uppercase tracking-wide ${colourClasses} ${className}`}
    >
      {variant === 'allergen' && <AlertTriangle size={12} aria-hidden="true" />}
      {variant === 'dislike' && <Ban size={12} aria-hidden="true" />}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${typeof children === 'string' ? children : 'tag'}`}
          className="ml-0.5 leading-none opacity-70 hover:opacity-100"
        >
          &times;
        </button>
      )}
    </span>
  );
}
