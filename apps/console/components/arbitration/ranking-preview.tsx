'use client';

import { cn } from '@/lib/cn';

/**
 * A scenario's ranking under proposed weights, and what moved from live.
 *
 * Presentational, and it computes no priority: every row arrives from the
 * engine through `previewArbitration`, in the engine's order. The only thing
 * derived here is movement — the difference between an offer's place in two
 * rankings the engine produced.
 *
 * There is no tie warning. The engine does tie — equal priorities after
 * rounding, broken by offer key — and in this tenant three offers tie when the
 * boost weight is zero; the warning was cut for scope (G-125).
 */
export interface RankingRow {
  rank: number;
  key: string;
  name: string;
  /** As the engine recorded it. */
  priority: number;
}

export interface RankingPreviewProps {
  scenarioName: string;
  rows: readonly RankingRow[];
  /** The live ranking the rows are compared with. */
  live: readonly RankingRow[];
}

const PRIORITY_SHOWN = 4;

export function RankingPreview({ scenarioName, rows, live }: RankingPreviewProps) {
  const top = rows[0]?.priority ?? 0;
  const was = new Map(live.map((r) => [r.key, r.rank]));
  const shiftOf = (row: RankingRow) => (was.get(row.key) ?? row.rank) - row.rank;
  const movedCount = rows.filter((r) => shiftOf(r) !== 0).length;

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
          const shift = shiftOf(row);
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
                <span className="block truncate text-body font-medium text-content">{row.name}</span>
                <span className="block truncate font-mono text-label text-content-subtle">{row.key}</span>
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
    </div>
  );
}
