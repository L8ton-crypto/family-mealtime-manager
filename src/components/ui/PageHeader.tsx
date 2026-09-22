import { ReactNode } from 'react';

interface PageHeaderProps {
  kicker?: string;
  title: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ kicker, title, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div>
        {kicker && <p className="mb-1 font-mono text-xs uppercase tracking-widest text-chalk-soft">{kicker}</p>}
        <h1 className="font-display text-4xl uppercase leading-none tracking-wide text-chalk sm:text-5xl">
          {title}
        </h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
