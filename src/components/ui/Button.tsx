import { ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'pass' | 'ink' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  pass: 'rk-hard-shadow border border-ink bg-pass text-pass-ink',
  ink: 'rk-hard-shadow border border-ink bg-paper text-ink',
  // Ghost is a tertiary action and, in this design, only ever appears on a
  // Ticket's paper surface (paper is always light in both themes), so it's
  // ink-toned rather than chalk-toned — chalk text on paper would be
  // invisible in dark mode.
  ghost: 'border border-steel bg-transparent text-ink-soft hover:bg-paper-2 hover:text-ink',
  danger: 'rk-hard-shadow border border-ink bg-eightysix text-white',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ink', className = '', children, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-sm px-4 font-body text-sm font-medium uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
