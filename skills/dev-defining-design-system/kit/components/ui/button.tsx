import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { useOnline } from '../../lib/use-online';

// One button. release-management had 36 class sets for it, secondary written five ways, and
// 24/26/32 px heights on one screen. Every clickable control is this component; ESLint bans a raw
// <button className=…> outside components/ui (eslint.kit.js).
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-body transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:translate-y-px aria-pressed:bg-surface-2 aria-pressed:font-semibold aria-busy:cursor-progress disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-icon-md [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg shadow-1 hover:bg-primary-hover active:bg-primary-hover',
        secondary: 'border border-border-strong bg-surface text-text hover:bg-surface-2',
        danger: 'bg-danger text-danger-fg shadow-1 hover:opacity-90',
        'danger-outline': 'border border-danger bg-surface text-danger hover:bg-tint-danger',
        ghost: 'text-text hover:bg-surface-2',
        link: 'h-auto px-0 text-primary underline underline-offset-4 hover:text-primary-hover',
        icon: 'text-text hover:bg-surface-2',
      },
      size: {
        sm: 'h-control-sm px-3',
        md: 'h-control-md px-4',
        touch: 'h-control-lg min-w-target px-5',
      },
    },
    compoundVariants: [
      { variant: 'icon', size: 'sm', className: 'w-control-sm px-0' },
      { variant: 'icon', size: 'md', className: 'w-control-md px-0' },
      { variant: 'icon', size: 'touch', className: 'w-control-lg px-0' },
      { variant: 'link', className: 'h-auto px-0' },
    ],
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * The button changes server state. It is disabled while `pending` and while the browser is
   * offline, and says so; G7 fails a mutating action that is not marked (dev-reviewing-implementation).
   */
  mutates?: boolean;
  pending?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, mutates = false, pending = false, disabled, type, ...props }, ref) => {
    const online = useOnline();
    const Comp = asChild ? Slot : 'button';
    const blocked = mutates && (!online || pending);
    return (
      <Comp
        ref={ref}
        data-slot="button"
        data-variant={variant ?? 'secondary'}
        data-size={size ?? 'md'}
        data-mutates={mutates || undefined}
        aria-busy={pending || undefined}
        type={asChild ? undefined : (type ?? 'button')}
        disabled={disabled || blocked}
        title={mutates && !online ? 'You are offline' : props.title}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
