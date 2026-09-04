'use client';

import { type ReactNode, useState, useMemo } from 'react';
import { cn } from '@/lib/cn';
import { LoadingState, EmptyState } from './primitives';

export interface Column<T> {
  /** Stable key, also used as the sort key. */
  key: string;
  header: ReactNode;
  /** Cell renderer. Keep it presentational. */
  cell: (row: T) => ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  /** Tailwind width utility, e.g. "w-40". */
  width?: string;
  align?: 'left' | 'right';
  /** Hide below the lg breakpoint to keep narrow viewports readable. */
  secondary?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Makes the whole row activatable. Renders as a real link target. */
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Column key to sort by initially. */
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  caption?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isLoading,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  defaultSort,
  caption,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }, [rows, sort, columns]);

  function toggleSort(key: string) {
    setSort((cur) =>
      cur?.key === key
        ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  }

  if (isLoading) return <LoadingState />;
  if (rows.length === 0)
    return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'sticky top-0 z-10 bg-surface px-cell py-2 text-label font-semibold uppercase tracking-wide text-content-subtle',
                  col.align === 'right' ? 'text-right' : 'text-left',
                  col.width,
                  col.secondary && 'hidden lg:table-cell'
                )}
                aria-sort={
                  sort?.key === col.key
                    ? sort.dir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
              >
                {col.sortValue ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex items-center gap-1 hover:text-content"
                  >
                    {col.header}
                    <span aria-hidden className="text-[0.6rem] leading-none">
                      {sort?.key === col.key ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                'border-b border-border/60 transition-colors',
                onRowClick &&
                  'cursor-pointer hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-cell py-cell-y align-middle',
                    col.align === 'right' && 'text-right tnum',
                    col.secondary && 'hidden lg:table-cell'
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
