import * as React from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowData, type SortingState } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Skeleton } from './skeleton';

// One table. release-management hand-wrote 22, with row heights from 26 to 61 px and no density
// token. Here the row height is `--density-row-height` (set by the preset, switched by a
// data-density attribute on any ancestor), numbers are right-aligned in tabular figures, long text
// truncates with the full value in a title, and each column has a priority: 1 always shows, 2 hides
// below bp.lg, 3 below bp.md. Sorting is the server's (§13.1): the table reports the sort, it
// never sorts a page in memory.

declare module '@tanstack/react-table' {
  // TData and TValue must match TanStack's own declaration, used or not
  interface ColumnMeta<TData extends RowData, TValue> {
    /** 1 always visible · 2 hidden below bp.lg · 3 hidden below bp.md */
    priority?: 1 | 2 | 3;
    numeric?: boolean;
    /** truncate to one line, full value in `title` */
    truncate?: boolean;
    /** the API's `sort` value for this column; absent = not sortable */
    sortKey?: string;
  }
}

const PRIORITY = { 1: '', 2: 'hidden lg:table-cell', 3: 'hidden md:table-cell' } as const;

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** the caption names the table for a screen reader; visually hidden unless `showCaption` */
  caption: string;
  showCaption?: boolean;
  loading?: boolean;
  /** rendered in place of the body when there are no rows (an EmptyState) */
  empty?: React.ReactNode;
  sorting?: SortingState;
  onSortingChange?: (s: SortingState) => void;
  getRowId?: (row: T, index: number) => string;
  className?: string;
}

export function DataTable<T>({ columns, data, caption, showCaption = false, loading = false, empty, sorting = [], onSortingChange, getRowId, className }: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting },
    manualSorting: true,
    enableSortingRemoval: true,
    onSortingChange: (updater) => onSortingChange?.(typeof updater === 'function' ? updater(sorting) : updater),
    getCoreRowModel: getCoreRowModel(),
  });
  const leafs = table.getVisibleLeafColumns();
  const cellClass = (meta: (typeof leafs)[number]['columnDef']['meta']) =>
    cn('px-cell-x py-cell-y align-middle', PRIORITY[meta?.priority ?? 1], meta?.numeric && 'text-right text-tabular tabular-nums', meta?.truncate && 'max-w-0 truncate');

  return (
    <div data-slot="data-table" className={cn('w-full overflow-x-auto rounded-lg border border-border', className)}>
      <table className="w-full border-collapse text-body text-text">
        <caption className={showCaption ? 'p-cell-x text-left text-h3' : 'sr-only'}>{caption}</caption>
        <thead className="bg-surface-2">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border">
              {hg.headers.map((h) => {
                const meta = h.column.columnDef.meta;
                const sortable = Boolean(meta?.sortKey) && Boolean(onSortingChange);
                const dir = h.column.getIsSorted();
                const label = h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext());
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                    className={cn(cellClass(meta), 'h-row whitespace-nowrap text-small font-semibold text-text-muted', meta?.truncate && 'max-w-none')}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className={cn('inline-flex items-center gap-1 rounded-sm hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus', meta?.numeric && 'flex-row-reverse')}
                      >
                        {label}
                        {dir === 'asc' ? <ArrowUp aria-hidden="true" className="size-icon-sm" /> : dir === 'desc' ? <ArrowDown aria-hidden="true" className="size-icon-sm" /> : <ArrowUpDown aria-hidden="true" className="size-icon-sm" />}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }, (_, i) => (
                <tr key={`s${i}`} className="h-row border-b border-border last:border-0">
                  {leafs.map((c) => (
                    <td key={c.id} className={cellClass(c.columnDef.meta)}>
                      <Skeleton className="h-line w-full" />
                    </td>
                  ))}
                </tr>
              ))
            : table.getRowModel().rows.map((row) => (
                <tr key={row.id} data-slot="data-table-row" className="h-row border-b border-border last:border-0 hover:bg-surface-2 data-[selected]:bg-tint-info" data-selected={row.getIsSelected?.() || undefined} aria-selected={row.getIsSelected?.() || undefined}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    const value = cell.getValue();
                    return (
                      <td key={cell.id} className={cellClass(meta)} title={meta?.truncate && typeof value === 'string' ? value : undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && data.length === 0 && empty ? <div className="border-t border-border">{empty}</div> : null}
    </div>
  );
}

/** The table's sort as the API's `sort` parameter (`-created_at,name`), from each column's sortKey. */
export function toApiSort<T>(sorting: SortingState, columns: ColumnDef<T, unknown>[]): string | undefined {
  const key = (id: string) => columns.find((c) => (c.id ?? (c as { accessorKey?: string }).accessorKey) === id)?.meta?.sortKey;
  const parts = sorting.map((s) => (key(s.id) ? `${s.desc ? '-' : ''}${key(s.id)}` : null)).filter(Boolean);
  return parts.length ? parts.join(',') : undefined;
}
