import * as React from 'react';
import { cn } from '../../lib/utils';
import { plural } from '../../lib/format';
import { copy, t } from '../../copy/en';

// Field wires a label, a hint and an error to one control: id, htmlFor, aria-describedby and
// aria-invalid are set here, once, so no screen gets them unevenly. The control is the only child
// and reads the wiring from context (Input, Textarea, Select and Checkbox all do).

interface FieldCtx {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}
const Ctx = React.createContext<FieldCtx | null>(null);

/** The wiring of the Field around a control, or null outside one. */
export function useField(): FieldCtx | null {
  return React.useContext(Ctx);
}

type Wired = { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: React.AriaAttributes['aria-invalid']; required?: boolean };

/** The props a control spreads to take the Field's wiring; its own props win. */
export function fieldProps<T extends Wired>(f: FieldCtx | null, own: T): T {
  if (!f) return own;
  return {
    ...own,
    id: own.id ?? f.id,
    'aria-describedby': [f.describedBy, own['aria-describedby']].filter(Boolean).join(' ') || undefined,
    'aria-invalid': own['aria-invalid'] ?? (f.invalid || undefined),
    required: own.required ?? f.required,
  };
}

export interface FieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** the message from validation on blur or submit, or the server's field error */
  error?: string;
  required?: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, hint, error, required = false, id, className, children }: FieldProps) {
  const auto = React.useId();
  const fid = id ?? `f${auto.replace(/:/g, '')}`;
  const hintId = hint ? `${fid}-hint` : undefined;
  const errorId = error ? `${fid}-error` : undefined;
  const value = React.useMemo(
    () => ({ id: fid, describedBy: [errorId, hintId].filter(Boolean).join(' ') || undefined, invalid: Boolean(error), required }),
    [fid, errorId, hintId, error, required],
  );
  return (
    <div data-slot="field" data-invalid={error ? '' : undefined} className={cn('grid gap-1', className)}>
      <label htmlFor={fid} className="text-body font-medium text-text">
        {label}
        {required ? <span className="font-regular text-text-muted"> ({copy.common.required})</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-small text-text-muted">
          {hint}
        </p>
      ) : null}
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
      {error ? (
        <p id={errorId} className="text-small font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface ErrorSummaryProps {
  /** field id → message, in form order */
  errors: Record<string, string>;
  /** field id → its visible label, for the link text */
  labels?: Record<string, string>;
}

/**
 * Shown after a failed submit, above the form, and focused so a screen-reader user hears it. This
 * is where the kit uses role="alert": a user action (submit) produced it. Static text never does.
 */
export function ErrorSummary({ errors, labels = {} }: ErrorSummaryProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors);
  React.useEffect(() => {
    if (entries.length) ref.current?.focus();
  }, [entries.length]);
  if (!entries.length) return null;
  const forms = copy.common.summary.title;
  const title = t(plural(entries.length) === 'one' ? forms.one : forms.other, { count: entries.length });
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      data-slot="error-summary"
      className="rounded-md border border-danger bg-tint-danger p-4 text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <p className="font-semibold">{title}</p>
      <ul className="mt-2 list-disc pl-5">
        {entries.map(([id, msg]) => (
          <li key={id}>
            <a href={`#${id}`} className="text-text underline underline-offset-4">
              {labels[id] ? `${labels[id]}: ${msg}` : msg}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
