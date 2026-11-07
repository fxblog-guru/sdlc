import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Inbox, Lock, SearchX, Users, CircleX, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Heading } from './heading';

// An empty state is an icon, one sentence saying why it is empty, and the action that fills it
// (design checklist D7; ui-rubric reads [data-empty]). The kinds are the shapes the copy style
// guide names. no-permission, not-found and not-member are deliberately neutral and each has its
// own icon: none of them is an error the user caused (dev-specifying-ui/error-ux-matrix.md).
const KIND: Record<string, LucideIcon> = {
  'first-use': Inbox,
  'no-results': SearchX,
  'no-permission': Lock,
  'not-found': SearchX,
  'not-member': Users,
  error: CircleX,
};

const emptyVariants = cva('flex flex-col items-center gap-3 px-6 py-10 text-center', {
  variants: {
    kind: {
      'first-use': '[&>svg]:text-text-muted',
      'no-results': '[&>svg]:text-text-muted',
      'no-permission': '[&>svg]:text-text-muted',
      'not-found': '[&>svg]:text-text-muted',
      'not-member': '[&>svg]:text-info',
      error: '[&>svg]:text-danger',
    },
  },
  defaultVariants: { kind: 'first-use' },
});

export interface EmptyStateProps extends VariantProps<typeof emptyVariants> {
  title: React.ReactNode;
  /** one sentence: why it is empty, or what to do */
  description?: React.ReactNode;
  /** the action that fills it, or the way out */
  action?: React.ReactNode;
  /** page = the whole main region (no-permission, not-found); section = inside a card or a table */
  size?: 'page' | 'section';
  className?: string;
}

export function EmptyState({ kind, title, description, action, size = 'section', className }: EmptyStateProps) {
  const Icon = KIND[kind ?? 'first-use'];
  return (
    <div data-empty={kind ?? 'first-use'} data-slot="empty-state" className={cn(emptyVariants({ kind }), size === 'page' && 'min-h-full justify-center py-10', className)}>
      <Icon aria-hidden="true" className="size-icon-lg" />
      <Heading level={size === 'page' ? 'page' : 'card'} as={size === 'page' ? 'h1' : 'h3'} className={size === 'page' ? 'text-h2' : undefined}>
        {title}
      </Heading>
      {description ? <p className="max-w-measure text-body text-text-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
