import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, toApiSort } from './data-table';

type Row = { id: string; name: string; tests: number; owner: string };
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name', meta: { truncate: true, sortKey: 'name' } },
  { accessorKey: 'tests', header: 'Tests', meta: { numeric: true, sortKey: 'test_count' } },
  { accessorKey: 'owner', header: 'Owner', meta: { priority: 3 } },
];
const data: Row[] = [{ id: 'r1', name: 'A very long release name that truncates', tests: 1204, owner: 'Ana' }];

describe('DataTable', () => {
  it('has a caption, right-aligned tabular numbers, truncation with a title, and column priority', () => {
    render(<DataTable columns={columns} data={data} caption="Releases" getRowId={(r) => r.id} />);
    const table = screen.getByRole('table', { name: 'Releases' });
    const cells = within(table).getAllByRole('cell');
    expect(cells[0]).toHaveAttribute('title', data[0].name);
    expect(cells[1].className).toContain('text-right');
    expect(cells[1].className).toContain('tabular-nums');
    expect(cells[2].className).toContain('hidden md:table-cell');
  });

  it('reports the sort to the caller and never sorts the page itself', async () => {
    const onSortingChange = vi.fn();
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} caption="Releases" sorting={[]} onSortingChange={onSortingChange} />);
    await user.click(screen.getByRole('button', { name: 'Tests' }));
    const next = onSortingChange.mock.calls[0][0] as SortingState;
    expect(toApiSort(next, columns)).toMatch(/^-?test_count$/);
  });

  it('shows skeleton rows while loading and the empty state when there are none', () => {
    const { rerender, container } = render(<DataTable columns={columns} data={[]} caption="Releases" loading />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(15);
    rerender(<DataTable columns={columns} data={[]} caption="Releases" empty={<p>No releases yet</p>} />);
    expect(screen.getByText('No releases yet')).toBeInTheDocument();
  });
});
