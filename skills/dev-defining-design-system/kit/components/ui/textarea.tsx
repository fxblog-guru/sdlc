import * as React from 'react';
import { cn } from '../../lib/utils';
import { fieldProps, useField } from './field';
import { controlClass } from './input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, rows = 4, ...props }, ref) => {
  const f = useField();
  return <textarea ref={ref} rows={rows} data-slot="textarea" className={cn(controlClass, 'min-h-control-lg py-2', className)} {...fieldProps(f, props)} />;
});
Textarea.displayName = 'Textarea';
