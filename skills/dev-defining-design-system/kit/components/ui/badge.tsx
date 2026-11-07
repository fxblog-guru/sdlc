import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { CircleCheck, CircleAlert, CircleX, CircleDot, Circle, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { copy } from '../../copy/en';

// Status is hue + icon + word (WCAG 1.4.1). The badge's own colour is the role (the icon inherits
// it, held to 3:1 on the tint; ui-rubric measures the hues apart from it), and the word is a child
// span in `text`, held to 4.5:1 on the tint by the preset's extra_contrast_pairs. The role colour as
// the word itself fails AA on most tints, which is what axe found on the starter page.
export const badgeVariants = cva(
  'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 text-small font-medium [&_svg]:size-icon-sm [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface-2 text-text-muted',
        success: 'border-transparent bg-tint-success text-success',
        warning: 'border-transparent bg-tint-warning text-warning',
        danger: 'border-transparent bg-tint-danger text-danger',
        info: 'border-transparent bg-tint-info text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type Tone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

/** A plain label: a key, a role, a count. Status uses StatusBadge. */
export function Badge({ className, tone, children, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" data-tone={tone ?? 'neutral'} className={cn(badgeVariants({ tone }), className)} {...props}>
      <span className="truncate text-text">{children}</span>
    </span>
  );
}

const ICON: Record<Tone, LucideIcon> = { neutral: Circle, success: CircleCheck, warning: CircleAlert, danger: CircleX, info: CircleDot };

/**
 * The project's status words, each mapped once to a tone. Copy this map from the ui-spec; a status
 * the map does not know renders neutral, so a new status is visible rather than mis-coloured.
 */
export const STATUS_TONE: Record<string, Tone> = {
  done: 'success',
  passed: 'success',
  at_risk: 'warning',
  blocked: 'warning',
  failed: 'danger',
  in_progress: 'info',
  not_started: 'neutral',
};

export interface StatusBadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** the API's status value */
  status: string;
  /** the word shown; defaults to the copy catalogue's word for the tone */
  label?: string;
}

export function StatusBadge({ status, label, className, ...props }: StatusBadgeProps) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const Icon = ICON[tone];
  return (
    <span data-slot="status-badge" data-status={status} data-tone={tone} className={cn(badgeVariants({ tone }), className)} {...props}>
      <Icon aria-hidden="true" />
      <span className="truncate text-text">{label ?? copy.common.status[tone]}</span>
    </span>
  );
}
