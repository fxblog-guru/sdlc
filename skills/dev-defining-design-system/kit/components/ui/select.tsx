import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fieldProps, useField } from './field';
import { controlClass } from './input';

// A native <select> in the kit's dress. Native is the accessible default on every platform,
// mobile pickers included; use the Combobox only when options need search or rich content. An
// action such as "Move to" is a DropdownMenu, never a Select, so an arrow key cannot fire a change.
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, options, placeholder, ...props }, ref) => {
  const f = useField();
  return (
    <div className="relative">
      <select ref={ref} data-slot="select" className={cn(controlClass, 'h-control-md appearance-none pr-8', className)} {...fieldProps(f, props)}>
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 size-icon-md -translate-y-1/2 text-text-muted" />
    </div>
  );
});
Select.displayName = 'Select';
