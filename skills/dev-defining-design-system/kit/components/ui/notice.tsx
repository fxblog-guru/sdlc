import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, CircleX, Info, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

// Notice (shadcn calls it Alert): an inline message in the page, toned by what happened. It is
// role="status" by default. Pass `announce` only when a user action just produced it (a failed
// save), which makes it role="alert"; static text that is there on load is never an alert.
export const noticeVariants = cva('flex gap-3 rounded-md border-l-4 p-4 text-body text-text [&>svg]:mt-px [&>svg]:size-icon-md [&>svg]:shrink-0', {
  variants: {
    tone: {
      info: 'border-info bg-tint-info [&>svg]:text-info',
      success: 'border-success bg-tint-success [&>svg]:text-success',
      warning: 'border-warning bg-tint-warning [&>svg]:text-warning',
      danger: 'border-danger bg-tint-danger [&>svg]:text-danger',
    },
  },
  defaultVariants: { tone: 'info' },
});

const ICON: Record<string, LucideIcon> = { info: Info, success: CircleCheck, warning: CircleAlert, danger: CircleX };

export interface NoticeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>, VariantProps<typeof noticeVariants> {
  title?: React.ReactNode;
  /** a user action produced this notice just now: announce it (role="alert") */
  announce?: boolean;
  /** e.g. a "Try again" Button */
  action?: React.ReactNode;
}

export function Notice({ tone, title, announce = false, action, className, children, ...props }: NoticeProps) {
  const Icon = ICON[tone ?? 'info'];
  return (
    <div role={announce ? 'alert' : 'status'} data-slot="notice" data-tone={tone ?? 'info'} className={cn(noticeVariants({ tone }), className)} {...props}>
      <Icon aria-hidden="true" />
      <div className="grid min-w-0 flex-1 gap-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
