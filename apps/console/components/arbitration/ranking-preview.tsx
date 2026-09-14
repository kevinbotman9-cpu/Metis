'use client';

import type { RankedCandidate } from '@metis/core/arbitration';
import { cn } from '@/lib/cn';

/**
 * A scenario's ranking under proposed weights, with what moved and what tied.
 *
 * Presentational: the ranking, the movement and the ties are computed by
 * `rankCandidates` and `movement` in `@metis/core/arbitration`, which the
 * engine's own agreement test holds to the order a decision would make. This
 * draws them and decides nothing.
 *
 * The tie warning is driven by `ties` and nothing else. Two offers sharing a
 * priority is the only thing that shows it, which is the whole point of it: a
 * tie means the engine orders those offers by key, so their order is
 * alphabetical rather than something anybody decided.
 */
export interface RankingPreviewProps {
  scenarioName: string;
  rows: readonly RankedCandidate[];
  /** How far each key moved from the live ranking; positive is up. */
  moved: Readonly<Record<string, number>>;
  ties: readonly (readonly string[])[];
}

const PRIORITY_SHOWN = 4;

export function RankingPreview({ scenarioName, rows, moved, ties }: RankingPreviewProps) {
  const top = rows[0]?.priority ?? 0;
  const movedCount = rows.filter((r) => (moved[r.key] ?? 0) !== 0).length;
  const names = new Map(rows.map((r) => [r.key, r.name]));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-body font-medium text-content">Ranking, on {scenarioName}</h3>
        <p className="text-label text-content-muted" aria-live="polite">
          {movedCount === 0
            ? 'unchanged from live'
            : `${movedCount} ${movedCount === 1 ? 'offer' : 'offers'} moved from live`}
        </p>
      </div>

      <ol aria-label="Ranking" className="divide-y divide-border rounded border border-border">
        {rows.map((row) => {
          const shift = moved[row.key] ?? 0;
          const tied = row.tiedWith.length > 0;
          return (
            <li key={row.key} className="grid grid-cols-[2rem_1fr_auto_4rem] items-center gap-3 px-3 py-2">
              <span
                className={cn(
                  'tnum grid h-6 w-6 place-items-center rounded font-mono text-label font-semibold',
                  row.rank === 1 ? 'bg-accent text-surface' : 'bg-surface-sunken text-content'
                )}
              >
                {row.rank}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-body font-medium text-content" data-offer-name>
                  {row.name}
                </span>
                <span className="block truncate font-mono text-label text-content-subtle">
                  {row.key}
                  {tied ? <span className="ml-2 font-sans text-hold">tied</span> : null}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-surface-sunken sm:block" aria-hidden="true">
                  <span
                    className="block h-full bg-accent"
                    style={{ width: `${top > 0 ? Math.round((row.priority / top) * 100) : 0}%` }}
                  />
                </span>
                <span className="tnum font-mono text-label font-semibold text-content">
                  {row.priority.toFixed(PRIORITY_SHOWN)}
                </span>
              </span>
              <span
                className={cn(
                  'tnum text-right font-mono text-label',
                  shift > 0 ? 'text-pass' : shift < 0 ? 'text-block' : 'text-content-subtle'
                )}
              >
                {shift === 0 ? (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">no change</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">
                      {shift > 0 ? '▲' : '▼'}
                      {Math.abs(shift)}
                    </span>
                    <span className="sr-only">
                      {shift > 0 ? 'up' : 'down'} {Math.abs(shift)}
                    </span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {ties.length > 0 ? (
        <div role="status" className="mt-3 rounded border border-border bg-surface-sunken px-4 py-3 text-label text-content">
          {ties.map((group) => (
            <p key={group.join()} className="mb-1 last:mb-0">
              <span className="font-semibold text-hold">
                {group.length} offers share a priority: {listOf(group.map((k) => names.get(k) ?? k))}.
              </span>{' '}
              A tie is broken by offer key, so their order is alphabetical rather than decided. Add a boost if this
              order is meant to mean something.
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function listOf(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
