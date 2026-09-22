import {
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

interface FieldWrapperProps {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

function FieldWrapper({ label, hint, error, htmlFor, className = '', children }: FieldWrapperProps) {
  return (
    <label className={`block ${className}`} htmlFor={htmlFor}>
      <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-chalk-soft">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-eightysix">{error}</span>}
    </label>
  );
}

const controlClass =
  'w-full min-h-[44px] rounded-sm border border-steel bg-paper px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-pass';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  mono?: boolean;
  hint?: string;
  error?: string;
};

/** Ticket-line text input. Numeric/ticket data should pass `mono`. */
export const Field = forwardRef<HTMLInputElement, TextFieldProps>(function Field(
  { label, mono, hint, error, className, id, name, ...rest },
  ref
) {
  const fieldId = id ?? name;
  return (
    <FieldWrapper label={label} hint={hint} error={error} htmlFor={fieldId} className={className}>
      <input
        ref={ref}
        id={fieldId}
        name={name}
        className={`${controlClass} ${mono ? 'font-mono' : 'font-body'}`}
        {...rest}
      />
    </FieldWrapper>
  );
});

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  mono?: boolean;
  hint?: string;
  error?: string;
};

export const FieldSelect = forwardRef<HTMLSelectElement, SelectFieldProps>(function FieldSelect(
  { label, mono, hint, error, className, id, name, children, ...rest },
  ref
) {
  const fieldId = id ?? name;
  return (
    <FieldWrapper label={label} hint={hint} error={error} htmlFor={fieldId} className={className}>
      <select
        ref={ref}
        id={fieldId}
        name={name}
        className={`${controlClass} ${mono ? 'font-mono' : 'font-body'}`}
        {...rest}
      >
        {children}
      </select>
    </FieldWrapper>
  );
});

type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  mono?: boolean;
  hint?: string;
  error?: string;
};

export const FieldTextarea = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(function FieldTextarea(
  { label, mono, hint, error, className, id, name, ...rest },
  ref
) {
  const fieldId = id ?? name;
  return (
    <FieldWrapper label={label} hint={hint} error={error} htmlFor={fieldId} className={className}>
      <textarea
        ref={ref}
        id={fieldId}
        name={name}
        className={`${controlClass} ${mono ? 'font-mono' : 'font-body'} min-h-[88px]`}
        {...rest}
      />
    </FieldWrapper>
  );
});
