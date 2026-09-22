import { ReactNode } from 'react';

type StampVariant = 'plated' | 'eightysix' | 'rejected' | 'new' | 'neutral';

interface StampProps {
  children: ReactNode;
  variant?: StampVariant;
  className?: string;
}

const colorClasses: Record<StampVariant, string> = {
  plated: 'text-plated',
  eightysix: 'text-eightysix',
  rejected: 'text-eightysix',
  new: 'text-pass',
  neutral: 'text-ink-soft',
};

/** A rotated, rubber-stamped label: PLATED, 86'D, REJECTED, NEW, SOON... */
export function Stamp({ children, variant = 'neutral', className = '' }: StampProps) {
  return <span className={`rk-stamp ${colorClasses[variant]} ${className}`}>{children}</span>;
}
