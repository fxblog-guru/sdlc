import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../lib/utils';

// A link in running text is underlined: colour alone does not mark it (WCAG 1.4.1, axe
// `link-in-text-block`). `asChild` wraps the router's link: <Link asChild><RouterLink to=…/></Link>.
export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  asChild?: boolean;
  /** a link that stands alone (a table's row link, a card title) may drop the underline until hover */
  standalone?: boolean;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(({ asChild, standalone = false, className, ...props }, ref) => {
  const Comp = asChild ? Slot : 'a';
  return (
    <Comp
      ref={ref}
      data-slot="link"
      className={cn(
        'rounded-sm text-primary underline-offset-4 hover:text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        !standalone && 'underline',
        className,
      )}
      {...props}
    />
  );
});
Link.displayName = 'Link';

export interface NavItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  asChild?: boolean;
  /** the current page: aria-current="page", weight and a bar, never a colour change alone */
  current?: boolean;
  icon?: React.ReactNode;
}

/**
 * A sidebar or top-bar item. The current item is `text` on `surface-2` with a primary bar and
 * semibold weight, so it passes 4.5:1 on every preset; a primary-coloured label on a tinted fill is
 * what failed axe at 3.95:1 on carbon-enterprise.
 */
export const NavItem = React.forwardRef<HTMLAnchorElement, NavItemProps>(({ asChild, current = false, icon, className, children, ...props }, ref) => {
  const Comp = asChild ? Slot : 'a';
  return (
    <Comp
      ref={ref}
      data-slot="nav-item"
      aria-current={current ? 'page' : undefined}
      className={cn(
        'relative flex h-control-md items-center gap-2 rounded-md px-3 text-body text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [&_svg]:size-icon-md',
        current && 'bg-surface-2 font-semibold text-text before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary',
        className,
      )}
      {...props}
    >
      {asChild ? children : (
        <>
          {icon}
          <span className="truncate">{children}</span>
        </>
      )}
    </Comp>
  );
});
NavItem.displayName = 'NavItem';
