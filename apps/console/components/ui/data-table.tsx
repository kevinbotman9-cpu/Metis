'use client';

import {
  type ReactNode,
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from 'react';
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
  /** Makes the whole row activatable. */
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  caption?: string;
  /**
   * Height of the scroll viewport once virtualisation kicks in.
   * Ignored for small tables, which size to their content.
   */
  maxHeight?: number;
}

/**
 * Rows past this count are windowed.
 *
 * Below it the DOM cost is irrelevant and a plain table is simpler to reason
 * about, keeps every row in the accessibility tree, and lets Ctrl-F work.
 */
const VIRTUALISE_ABOVE = 80;

/** Rows rendered beyond the viewport, so scrolling does not flash empty space. */
const OVERSCAN = 8;

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
  maxHeight = 560,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(maxHeight);
  const [rowHeight, setRowHeight] = useState(0);

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

  const virtualise = sorted.length > VIRTUALISE_ABOVE;

  /**
   * Row height is measured rather than assumed.
   *
   * It varies with the density token and with how much a given table puts in a
   * cell, so a hardcoded number would misplace the spacers. Rows within one
   * table are uniform, so measuring the first is enough.
   */
  useEffect(() => {
    if (!virtualise) return;
    const first = bodyRef.current?.querySelector('tr[data-row]');
    if (first instanceof HTMLElement && first.offsetHeight > 0) {
      setRowHeight((h) => (h === first.offsetHeight ? h : first.offsetHeight));
    }
  }, [virtualise, sorted, columns]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !virtualise) return;
    const measure = () => setViewportHeight(el.clientHeight || maxHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [virtualise, maxHeight]);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Until the first row has been measured, render a small slice so there is
  // something to measure. Rendering everything would defeat the purpose.
  const effectiveRowHeight = rowHeight || 44;
  const visibleCount = Math.ceil(viewportHeight / effectiveRowHeight) + OVERSCAN * 2;
  const startIndex = virtualise
    ? Math.max(0, Math.floor(scrollTop / effectiveRowHeight) - OVERSCAN)
    : 0;
  const endIndex = virtualise ? Math.min(sorted.length, startIndex + visibleCount) : sorted.length;

  const visible = virtualise ? sorted.slice(startIndex, endIndex) : sorted;
  const padTop = virtualise ? startIndex * effectiveRowHeight : 0;
  const padBottom = virtualise ? (sorted.length - endIndex) * effectiveRowHeight : 0;

  function toggleSort(key: string) {
    setSort((cur) =>
      cur?.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
    // A new order makes the current scroll offset meaningless.
    scrollRef.current?.scrollTo({ top: 0 });
  }

  if (isLoading) return <LoadingState />;
  if (rows.length === 0)
    return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={virtualise ? onScroll : undefined}
        className="overflow-auto"
        style={virtualise ? { maxHeight } : undefined}
      >
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
          <tbody ref={bodyRef}>
            {/* Spacers stand in for the rows outside the window, so the
                scrollbar reflects the whole set. */}
            {padTop > 0 && (
              <tr aria-hidden style={{ height: padTop }}>
                <td colSpan={columns.length} />
              </tr>
            )}

            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                data-row
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

            {padBottom > 0 && (
              <tr aria-hidden style={{ height: padBottom }}>
                <td colSpan={columns.length} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {virtualise && (
        <p
          className="border-t border-border px-cell py-1.5 text-label text-content-subtle"
          aria-live="polite"
        >
          Showing rows {startIndex + 1}&ndash;{endIndex} of {sorted.length.toLocaleString('en-GB')}.
          Only the visible rows are rendered.
        </p>
      )}
    </>
  );
}
