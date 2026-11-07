// Interaction states (DEV-CONTRACTS §13.13): every interactive primitive defines hover, focus,
// pressed, selected (where it has one), disabled and loading, so no screen invents its own.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, buttonVariants } from './button';
import { controlClass } from './input';

const has = (cls: string, ...want: string[]) => want.filter((w) => !cls.split(/\s+/).some((c) => c.startsWith(w)));

describe('interaction states', () => {
  it('every Button variant has hover, focus-visible, active (pressed), aria-pressed (selected) and disabled', () => {
    for (const variant of ['primary', 'secondary', 'danger', 'danger-outline', 'ghost', 'link', 'icon'] as const) {
      expect(has(buttonVariants({ variant }), 'hover:', 'focus-visible:ring', 'active:', 'aria-pressed:', 'disabled:'), variant).toEqual([]);
    }
  });

  it('a pending Button is busy and disabled: the loading state', () => {
    render(<Button mutates pending>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b).toHaveAttribute('aria-busy', 'true');
    expect(b).toBeDisabled();
  });

  it('a toggle Button exposes its selected state as aria-pressed', () => {
    render(<Button aria-pressed="true">Bold</Button>);
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('text controls have focus-visible, disabled and invalid states', () => {
    expect(has(controlClass, 'focus-visible:ring', 'disabled:', 'aria-[invalid=true]:')).toEqual([]);
  });
});
