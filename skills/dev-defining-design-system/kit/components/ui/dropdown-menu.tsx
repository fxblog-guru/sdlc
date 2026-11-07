import * as React from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { cn } from '../../lib/utils';

// Radix gives the APG menu-button pattern: Enter/Space/ArrowDown open, arrows move, Home/End jump,
// type-ahead, Escape and outside click close, focus returns to the trigger. release-management's
// seven hand-rolled menus each had a different subset (Home in 3 of 7, outside click in 2 of 9).
// ESLint bans role="menu" outside components/ui (eslint.kit.js).

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof Menu.Content>, React.ComponentPropsWithoutRef<typeof Menu.Content>>(
  ({ className, sideOffset = 4, align = 'end', ...props }, ref) => (
    <Menu.Portal>
      <Menu.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        data-slot="dropdown-menu"
        className={cn('z-50 max-h-menu min-w-menu overflow-y-auto rounded-md border border-border bg-surface p-1 text-text shadow-2', className)}
        {...props}
      />
    </Menu.Portal>
  ),
);
DropdownMenuContent.displayName = 'DropdownMenuContent';

export interface DropdownMenuItemProps extends React.ComponentPropsWithoutRef<typeof Menu.Item> {
  /** a destructive item: danger text, and it should open a ConfirmDialog rather than act */
  danger?: boolean;
}

export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof Menu.Item>, DropdownMenuItemProps>(({ className, danger, ...props }, ref) => (
  <Menu.Item
    ref={ref}
    data-slot="dropdown-menu-item"
    className={cn(
      'relative flex min-h-control-sm cursor-default select-none items-center gap-2 rounded-sm px-2 text-body outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-2 active:bg-surface-2 data-[state=checked]:font-semibold data-[disabled]:opacity-50 [&_svg]:size-icon-md',
      danger && 'text-danger',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuSeparator = React.forwardRef<React.ElementRef<typeof Menu.Separator>, React.ComponentPropsWithoutRef<typeof Menu.Separator>>(
  ({ className, ...props }, ref) => <Menu.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />,
);
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export const DropdownMenuLabel = React.forwardRef<React.ElementRef<typeof Menu.Label>, React.ComponentPropsWithoutRef<typeof Menu.Label>>(
  ({ className, ...props }, ref) => <Menu.Label ref={ref} className={cn('px-2 py-1 text-small font-semibold text-text-muted', className)} {...props} />,
);
DropdownMenuLabel.displayName = 'DropdownMenuLabel';
