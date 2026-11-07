import * as React from 'react';
import { cn } from '../../lib/utils';

// One Skeleton; release-management had thirteen private copies, and their heights came out 0
// because `h-4` emitted no rule once the spacing scale was replaced. Size it with kit classes that
// exist: `h-line` (one line of body text), `h-control-md`, `h-row`, `w-1/2`, `w-full`.
// `design-system.mjs classes` fails a class that emits nothing.
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" data-slot="skeleton" className={cn('animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none', className)} {...props} />;
}

/** A region that is loading: announces it once, and keeps the layout the content will occupy. */
export function LoadingRegion({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
