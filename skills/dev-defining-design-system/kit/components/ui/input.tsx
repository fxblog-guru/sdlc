import * as React from 'react';
import { cn } from '../../lib/utils';
import { fieldProps, useField } from './field';

/** The look every text control shares: Input, Textarea, Select. */
export const controlClass =
  'flex w-full rounded-md border border-border-strong bg-surface px-3 text-body text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type = 'text', ...props }, ref) => {
  const f = useField();
  return <input ref={ref} type={type} data-slot="input" className={cn(controlClass, 'h-control-md', className)} {...fieldProps(f, props)} />;
});
Input.displayName = 'Input';
