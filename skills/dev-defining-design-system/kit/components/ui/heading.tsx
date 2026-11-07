import * as React from 'react';
import { cn } from '../../lib/utils';

// Three heading levels, each one type role. release-management drew h1 at 20 px on one page and 15
// px on its 404, and h3 at three sizes. A screen never sets a heading's size; it picks a level.
const LEVEL = {
  page: { tag: 'h1', className: 'text-h1 text-text' },
  section: { tag: 'h2', className: 'text-h2 text-text' },
  card: { tag: 'h3', className: 'text-h3 text-text' },
} as const;

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level: keyof typeof LEVEL;
  /** the document outline needs another element than the look (a card title under an h3, say) */
  as?: 'h1' | 'h2' | 'h3' | 'h4';
}

export function Heading({ level, as, className, ...props }: HeadingProps) {
  const { tag, className: look } = LEVEL[level];
  const Tag = as ?? tag;
  return <Tag data-slot="heading" data-level={level} className={cn(look, 'min-w-0 break-words', className)} {...props} />;
}
