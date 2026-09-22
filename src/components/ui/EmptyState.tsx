import { ReactNode } from 'react';
import { Ticket } from './Ticket';
import { Stamp } from './Stamp';

type StampVariant = 'plated' | 'eightysix' | 'rejected' | 'new' | 'neutral';

interface EmptyStateProps {
  stampLabel: string;
  stampVariant?: StampVariant;
  copy: string;
  action?: ReactNode;
}

/** A single ticket with a stamp, one line of honest copy, and one action. */
export function EmptyState({ stampLabel, stampVariant = 'neutral', copy, action }: EmptyStateProps) {
  return (
    <Ticket>
      <div className="flex flex-col items-start gap-4 py-2">
        <Stamp variant={stampVariant}>{stampLabel}</Stamp>
        <p className="text-ink-soft">{copy}</p>
        {action}
      </div>
    </Ticket>
  );
}
