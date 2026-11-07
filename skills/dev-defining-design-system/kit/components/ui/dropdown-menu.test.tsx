import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { Button } from './button';

function Menu({ onSelect }: { onSelect: (v: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>Move to</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => onSelect('planned')}>Planned</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect('testing')}>Testing</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect('released')}>Released</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu (APG menu button)', () => {
  it('opens from the keyboard, moves with arrows and End, selects with Enter, returns focus', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Menu onSelect={onSelect} />);
    const trigger = screen.getByRole('button', { name: 'Move to' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.keyboard('{End}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('released');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Menu onSelect={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Move to' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
