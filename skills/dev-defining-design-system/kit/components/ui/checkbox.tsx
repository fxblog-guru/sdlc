import * as React from 'react';
import { cn } from '../../lib/utils';
import { fieldProps, useField } from './field';

// A native checkbox, so the form, the label and the keyboard work with no script. `label` sits
// beside the box; inside a Field, the Field's label names it instead.
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, label, ...props }, ref) => {
  const f = useField();
  const box = (
    <input
      ref={ref}
      type="checkbox"
      data-slot="checkbox"
      className={cn('size-icon-md shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus', className)}
      {...fieldProps(f, props)}
    />
  );
  if (!label) return box;
  return (
    <label className="inline-flex min-h-target items-center gap-2 text-body text-text">
      {box}
      {label}
    </label>
  );
});
Checkbox.displayName = 'Checkbox';
