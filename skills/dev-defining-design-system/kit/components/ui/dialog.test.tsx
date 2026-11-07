import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, Dialog } from './dialog';

function Editor({ dirty }: { dirty: boolean }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <Dialog open onOpenChange={setOpen} title="Edit release" dirty={dirty}>
      <input aria-label="Name" />
    </Dialog>
  ) : (
    <p>closed</p>
  );
}

describe('Dialog discard guard', () => {
  it('closes at once when nothing changed', async () => {
    const user = userEvent.setup();
    render(<Editor dirty={false} />);
    await user.keyboard('{Escape}');
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('asks before discarding, and Keep editing keeps the dialog', async () => {
    const user = userEvent.setup();
    render(<Editor dirty />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('alertdialog', { name: 'Discard your changes?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('dialog', { name: 'Edit release' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    expect(screen.getByText('closed')).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('is an alertdialog whose confirm button carries the verb', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog open onOpenChange={() => {}} title="Delete release 2.4?" description="Its 12 tickets go back to the backlog." confirmLabel="Delete release" tone="danger" onConfirm={onConfirm} />);
    expect(screen.getByRole('alertdialog', { name: 'Delete release 2.4?' })).toHaveAccessibleDescription('Its 12 tickets go back to the backlog.');
    await user.click(screen.getByRole('button', { name: 'Delete release' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
