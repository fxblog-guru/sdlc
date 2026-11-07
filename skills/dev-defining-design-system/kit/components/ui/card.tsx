import * as React from 'react';
import { cn } from '../../lib/utils';
import { Heading } from './heading';

// One bordered container. Cards do not nest in cards (design checklist D2): a section inside a card
// is a Heading level="card" and a divider, not another border.

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card" className={cn('rounded-lg border border-border bg-surface text-text shadow-1', className)} {...props} />;
}

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** one or two actions, right-aligned; at most one primary */
  actions?: React.ReactNode;
}

export function CardHeader({ title, description, actions, className, ...props }: CardHeaderProps) {
  return (
    <div data-slot="card-header" className={cn('flex items-start justify-between gap-4 p-4', className)} {...props}>
      <div className="grid min-w-0 gap-1">
        <Heading level="card">{title}</Heading>
        {description ? <p className="text-small text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn('px-4 pb-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-footer" className={cn('flex justify-end gap-2 border-t border-border p-4', className)} {...props} />;
}
