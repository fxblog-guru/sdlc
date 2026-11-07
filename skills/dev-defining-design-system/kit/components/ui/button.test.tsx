import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, buttonVariants } from './button';

describe('Button', () => {
  it('is type=button with its variant and size on data attributes', () => {
    render(<Button variant="primary">Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b).toHaveAttribute('type', 'button');
    expect(b).toHaveAttribute('data-variant', 'primary');
    expect(b).toHaveAttribute('data-size', 'md');
  });

  it('a mutating button is disabled and busy while pending', () => {
    render(
      <Button mutates pending>
        Save
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
    expect(b).toHaveAttribute('data-mutates', 'true');
  });

  it('every variant × size yields one class set, and icon buttons are square', () => {
    const sets = new Set<string>();
    for (const variant of ['primary', 'secondary', 'danger', 'danger-outline', 'ghost', 'link', 'icon'] as const) {
      for (const size of ['sm', 'md', 'touch'] as const) sets.add(buttonVariants({ variant, size }));
    }
    expect(sets.size).toBe(21);
    expect(buttonVariants({ variant: 'icon', size: 'md' })).toContain('w-control-md');
  });
});
