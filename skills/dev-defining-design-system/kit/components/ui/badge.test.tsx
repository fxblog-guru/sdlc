import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge, StatusBadge } from './badge';

describe('StatusBadge', () => {
  it('is hue + icon + word: data-status, a tone, a hidden icon and visible text', () => {
    const { container } = render(<StatusBadge status="failed" label="Failed" />);
    const el = container.querySelector('[data-status="failed"]');
    expect(el).toHaveAttribute('data-tone', 'danger');
    expect(el?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Failed')).toBeVisible();
  });

  it('the badge carries the hue; the word is the text colour on the tint (contrast)', () => {
    const { container } = render(<StatusBadge status="done" />);
    const classes = (container.firstElementChild?.className ?? '').split(' ');
    expect(classes).toContain('text-success');
    expect(classes).toContain('text-small');
    expect(screen.getByText('Done').className.split(' ')).toContain('text-text');
  });

  it('an unknown status renders neutral, not mis-coloured', () => {
    const { container } = render(<StatusBadge status="new_thing" label="New" />);
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'neutral');
  });

  it('Badge is a plain label', () => {
    render(<Badge>KEY-1</Badge>);
    expect(screen.getByText('KEY-1').closest('[data-slot="badge"]')).toHaveAttribute('data-tone', 'neutral');
  });
});
