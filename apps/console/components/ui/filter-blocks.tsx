'use client';

import { cn } from '@/lib/cn';

/**
 * Summary figures that are also the filter.
 *
 * The catalogue previously carried four `Metric` tiles that stated a count and
 * did nothing with it. Seeing "1 cannot be delivered" and then having to go
 * and construct that filter by hand is the gap this closes: the number is the
 * way to the rows behind it.
 *
 * Rendered as a radio group rather than a set of toggle buttons, because the
 * blocks are mutually exclusive views of one list. Arrow keys move between
 * them, which is what a keyboard user expects from a segmented filter and is
 * not what a row of independent buttons gives.
 */
export interface FilterBlock {
  id: string;
  label: string;
  value: number | string;
  /** A second line, for what the figure is measured against. */
  sub?: string;
  /** Draws the eye only when the count is non-zero — a zero is good news. */
  tone?: 'neutral' | 'pass' | 'hold' | 'block';
}

export interface FilterBlocksProps {
  blocks: FilterBlock[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Names the group for screen readers. */
  label: string;
  className?: string;
}

const TONE: Record<NonNullable<FilterBlock['tone']>, string> = {
  neutral: 'text-content',
  pass: 'text-pass',
  hold: 'text-hold',
  block: 'text-block',
};

export function FilterBlocks({ blocks, activeId, onSelect, label, className }: FilterBlocksProps) {
  const move = (from: number, delta: number) => {
    const next = (from + delta + blocks.length) % blocks.length;
    onSelect(blocks[next].id);
    // Radio-group semantics put focus on the checked item, so follow it.
    document.getElementById(`filter-block-${blocks[next].id}`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}
    >
      {blocks.map((b, i) => {
        const active = b.id === activeId;
        // A zero count in a warning tone is not a warning.
        const tone = b.value === 0 ? 'neutral' : (b.tone ?? 'neutral');
        return (
          <button
            key={b.id}
            id={`filter-block-${b.id}`}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(b.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              'rounded border px-3 py-2.5 text-left transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              active
                ? 'border-accent bg-accent-subtle'
                : 'border-border bg-surface hover:border-border-strong hover:bg-surface-sunken'
            )}
          >
            <span className="block text-label uppercase tracking-wide text-content-subtle">
              {b.label}
            </span>
            <span className={cn('mt-0.5 block text-h2 font-semibold tnum', TONE[tone])}>
              {b.value}
            </span>
            {b.sub ? (
              <span className="mt-0.5 block text-label text-content-subtle">{b.sub}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
