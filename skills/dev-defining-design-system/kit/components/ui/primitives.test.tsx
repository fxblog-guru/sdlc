// The small primitives, one describe each: Tabs, Card, Heading, Notice, Skeleton, EmptyState,
// Pager, Toast, Link / NavItem.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { Card, CardContent, CardHeader } from './card';
import { Heading } from './heading';
import { Notice } from './notice';
import { Skeleton } from './skeleton';
import { EmptyState } from './empty-state';
import { Pager } from './pager';
import { Toaster, toast } from './toast';
import { Link, NavItem } from './link';

describe('Tabs', () => {
  it('moves with the arrow keys and shows the selected panel', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Release">
          <TabsTrigger value="a">Overview</TabsTrigger>
          <TabsTrigger value="b">Scope</TabsTrigger>
        </TabsList>
        <TabsContent value="a">one</TabsContent>
        <TabsContent value="b">two</TabsContent>
      </Tabs>,
    );
    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Scope' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('two');
  });
});

describe('Card and Heading', () => {
  it('a card title is an h3; the page heading an h1', () => {
    render(
      <>
        <Heading level="page">Releases</Heading>
        <Card>
          <CardHeader title="Links" />
          <CardContent>x</CardContent>
        </Card>
      </>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Releases' })).toHaveAttribute('data-level', 'page');
    expect(screen.getByRole('heading', { level: 3, name: 'Links' })).toBeInTheDocument();
  });
});

describe('Notice', () => {
  it('is a status by default and an alert only when announced', () => {
    const { rerender } = render(<Notice tone="warning">Stale</Notice>);
    expect(screen.getByRole('status')).toHaveTextContent('Stale');
    rerender(<Notice tone="danger" announce>Failed</Notice>);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive tech and pulses only without reduced motion', () => {
    const { container } = render(<Skeleton className="h-line w-full" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild?.className).toContain('motion-reduce:animate-none');
  });
});

describe('EmptyState', () => {
  it('no permission, not found and not a member each have their own kind', () => {
    const { container } = render(
      <>
        <EmptyState kind="no-permission" title="No access" />
        <EmptyState kind="not-found" title="Not found" />
        <EmptyState kind="not-member" title="Not a member" />
      </>,
    );
    expect([...container.querySelectorAll('[data-empty]')].map((e) => e.getAttribute('data-empty'))).toEqual(['no-permission', 'not-found', 'not-member']);
    expect(container.querySelectorAll('svg').length).toBe(3);
  });
});

describe('Pager', () => {
  it('is a labelled nav with previous and next, disabled at the ends', async () => {
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(<Pager hasPrevious={false} hasNext onPrevious={() => {}} onNext={onNext} status="Showing 1–20" />);
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe('Toast', () => {
  it('appears in one polite status region and can be dismissed', async () => {
    const user = userEvent.setup();
    render(<Toaster />);
    act(() => {
      toast('Release saved', { duration: 0 });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Release saved');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Release saved')).not.toBeInTheDocument();
  });
});

describe('Link and NavItem', () => {
  it('a text link is underlined; the current nav item is aria-current and not marked by colour alone', () => {
    render(
      <>
        <Link href="/a">Read more</Link>
        <NavItem href="/b" current>
          Releases
        </NavItem>
      </>,
    );
    expect(screen.getByRole('link', { name: 'Read more' }).className).toMatch(/(^| )underline( |$)/);
    const nav = screen.getByRole('link', { name: 'Releases' });
    expect(nav).toHaveAttribute('aria-current', 'page');
    expect(nav.className).toContain('font-semibold');
    expect(nav.className).toContain('text-text');
  });
});
