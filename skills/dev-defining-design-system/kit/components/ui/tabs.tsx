import * as React from 'react';
import * as T from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils';

// Radix Tabs: arrow keys move between tabs, Home/End jump, the panel is labelled by its tab. For
// tabs that are routes (each tab a URL), render links in a <nav> instead; tabs are for panels on
// one page. The active tab is marked by an underline and weight, never colour alone (WCAG 1.4.1).

export const Tabs = T.Root;

export const TabsList = React.forwardRef<React.ElementRef<typeof T.List>, React.ComponentPropsWithoutRef<typeof T.List>>(({ className, ...props }, ref) => (
  <T.List ref={ref} data-slot="tabs-list" className={cn('flex gap-1 overflow-x-auto border-b border-border', className)} {...props} />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<React.ElementRef<typeof T.Trigger>, React.ComponentPropsWithoutRef<typeof T.Trigger>>(({ className, ...props }, ref) => (
  <T.Trigger
    ref={ref}
    data-slot="tabs-trigger"
    className={cn(
      '-mb-px inline-flex h-control-md items-center whitespace-nowrap border-b-2 border-transparent px-3 text-body text-text-muted hover:text-text active:text-text disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-text',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<React.ElementRef<typeof T.Content>, React.ComponentPropsWithoutRef<typeof T.Content>>(({ className, ...props }, ref) => (
  <T.Content ref={ref} data-slot="tabs-content" className={cn('pt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';
