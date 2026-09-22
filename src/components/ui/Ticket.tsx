import { ReactNode } from 'react';

type TicketVariant = 'default' | 'note' | 'warning' | 'plated';

interface TicketProps {
  /** Mono header strip, e.g. "TUE 24 SEP · DINNER · 4 COVERS". */
  header?: ReactNode;
  variant?: TicketVariant;
  /** Set false to skip the spring-in entrance (e.g. while editing in place). */
  spikeIn?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The core card of the design system: paper background, ink text, a
 * perforated top edge (CSS mask, no images), subtle paper grain and a hard
 * 2px shadow. See docs/VISION.md.
 */
export function Ticket({ header, variant = 'default', spikeIn = true, className = '', children }: TicketProps) {
  const variantClass =
    variant === 'note'
      ? 'rk-ticket--note'
      : variant === 'warning'
        ? 'rk-ticket--warning'
        : variant === 'plated'
          ? 'rk-ticket--plated'
          : '';

  return (
    <div className={`rk-ticket ${variantClass} ${spikeIn ? 'rk-spike-in' : ''} ${className}`}>
      <div className="rk-ticket__shadow" aria-hidden="true" />
      <div className="rk-ticket__paper">
        {header && (
          <div className="border-b border-steel bg-paper-2 px-4 py-2 font-mono text-xs uppercase tracking-widest text-ink-soft">
            {header}
          </div>
        )}
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
