'use client';

import { cn } from '@/lib/cn';
import { useFormat } from '@/components/tenant-format';
import { ribbonPath, volumeScale } from '@/components/volume/geometry';

/**
 * The loop as volume, with the drop-outs drawn as volume leaving.
 *
 * A column per stage as tall as the decisions still in the loop. Between each
 * pair, the column divides: a band as tall as the next stage carries on to it,
 * and the rest falls away beneath as a ribbon to a row below, labelled with how
 * many left. The two partition the column exactly, so nothing is drawn twice
 * and nothing vanishes — which is the point: a row of shrinking columns says the
 * last one is small, and this says where the rest went.
 *
 * **Consecutive stages with the same figure are one column**, carrying every
 * stage's name. At low volume most of a hand-made loop is equal — 26 decided, 26
 * offered, 26 deliverable, 26 seen — and five identical columns joined by full
 * bands drew four transitions where nothing happened, which read as a chart of
 * a broken join. Decided by the product owner on 2026-09-17. Not while the loop
 * is empty: the outlined columns are the shape a reader is about to fill.
 *
 * Heights come from `volumeScale` and curves from `ribbonPath`, the geometry the
 * canvas's volume overlay draws with (`components/volume/geometry.ts`), so a
 * thickness is the same arithmetic on both screens.
 *
 * Inline SVG rather than a chart library — `Recharts` has no mark for "volume
 * leaving between two stages". `viewBox` with no fixed width so it scales with
 * the card.
 *
 * A figure, not a control. The rail beside it selects stages and is reachable
 * by keyboard; adding a second, mouse-only way to do the same thing from inside
 * a `role="img"` would be a duplicate that half the readers of this screen
 * cannot operate.
 */

export interface LoopFlowStage {
  id: string;
  label: string;
  value: number;
  /** Drawn in the block colour, for the stage the loop breaks at. */
  broken?: boolean;
}

/** The drawing's own units. Exported so a test can hold the heights to the shared scale. */
export const LOOP_FLOW = {
  width: 720,
  height: 316,
  /** Where the columns start; the figures and labels sit above it. */
  top: 48,
  /** The tallest column: the first stage's volume. */
  band: 120,
  column: 16,
  /** Between the bottom of the tallest column and the row the losses fall to. */
  dropGap: 22,
  /** Each further stage name a merged column carries adds a line this tall above the columns. */
  line: 14,
} as const;

/** One drawn column: a stage, or a run of consecutive stages with the same figure. */
export interface LoopFlowColumn {
  id: string;
  labels: string[];
  value: number;
  broken: boolean;
}

/**
 * Consecutive stages with equal figures, as one column each.
 *
 * A run's colour is its first stage's: a break is where volume left, so a broken
 * stage is always smaller than the one above and can only start a run.
 */
export function mergeEqualRuns(stages: readonly LoopFlowStage[]): LoopFlowColumn[] {
  const columns: LoopFlowColumn[] = [];
  for (const s of stages) {
    const last = columns[columns.length - 1];
    if (last && last.value === s.value) {
      last.labels.push(s.label);
    } else {
      columns.push({ id: s.id, labels: [s.label], value: s.value, broken: Boolean(s.broken) });
    }
  }
  return columns;
}

export function LoopFlow({ stages }: { stages: readonly LoopFlowStage[] }) {
  const format = useFormat();
  const { width: W, band: BAND, column: COL, dropGap, line: LINE } = LOOP_FLOW;
  // Nothing has entered the loop. The columns are still drawn — outlined, at the
  // full band — so the shape a reader is about to fill is on screen; and the
  // drawing stops at the band, because there is no row for losses to fall to.
  // Until 2026-09-17 this state drew nothing inside the full 316-unit canvas,
  // which read as about 300px of chart that had failed to load.
  const empty = stages.length > 0 && stages.every((s) => s.value === 0);
  const columns: LoopFlowColumn[] = empty
    ? stages.map((s) => ({ id: s.id, labels: [s.label], value: 0, broken: Boolean(s.broken) }))
    : mergeEqualRuns(stages);
  const merged = columns.length < stages.length;
  // Every column's figure sits on one baseline, and its names stack beneath it,
  // so the columns start below the tallest stack.
  const extra = (Math.max(1, ...columns.map((c) => c.labels.length)) - 1) * LINE;
  const TOP = LOOP_FLOW.top + extra;
  const H = (empty ? LOOP_FLOW.top + BAND + 8 : LOOP_FLOW.height) + extra;
  const scale = volumeScale(Math.max(0, ...columns.map((c) => c.value)), BAND);
  const n = columns.length;
  const step = n > 1 ? (W - COL) / (n - 1) : 0;
  const x = (i: number) => i * step;
  const dropY = TOP + BAND + dropGap;
  const run = Math.min(step * 0.55, 96);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-auto w-full"
      role="img"
      aria-label={`The loop as volume: ${stages
        .map((s) => `${s.label} ${format.number(s.value)}`)
        .join(', ')}. What leaves between each pair falls away beneath it.${
        merged ? ' Stages with the same figure are drawn as one column.' : ''
      }`}
    >
      {columns.slice(0, -1).map((column, i) => {
        const next = columns[i + 1];
        const here = scale(column.value);
        const on = Math.min(here, scale(next.value));
        const lost = column.value - next.value;
        const x0 = x(i) + COL;
        return (
          <g key={`between-${column.id}`}>
            {/* What carries on: a band as tall as the next stage. */}
            <path
              data-part="carry"
              d={ribbonPath(x0, TOP, TOP + on, x(i + 1), TOP, TOP + on)}
              className={cn(next.broken ? 'fill-block/20' : 'fill-accent/20')}
            />
            {lost > 0 ? (
              <>
                {/* What left: the rest of this column, falling to the row below. */}
                <path
                  data-part="leave"
                  d={ribbonPath(x0, TOP + on, TOP + here, x0 + run, dropY, dropY + Math.max(1, here - on))}
                  className={cn(next.broken ? 'fill-block/30' : 'fill-content-subtle/15')}
                />
                <text
                  x={x0 + run + 6}
                  y={dropY + 12}
                  className={cn('tnum text-label', next.broken ? 'fill-block' : 'fill-content-subtle')}
                >
                  −{format.number(lost)}
                </text>
              </>
            ) : null}
          </g>
        );
      })}

      {columns.map((column, i) => {
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
        const tx = i === 0 ? x(i) : i === n - 1 ? x(i) + COL : x(i) + COL / 2;
        return (
          <g key={column.id} data-part="column" data-stages={column.labels.length}>
            {empty ? (
              <rect
                data-part="stage-empty"
                x={x(i)}
                y={TOP}
                width={COL}
                height={BAND}
                rx={3}
                strokeDasharray="4 3"
                className="fill-none stroke-border"
              />
            ) : (
              <rect
                data-part="stage"
                x={x(i)}
                y={TOP}
                width={COL}
                height={scale(column.value)}
                rx={3}
                className={cn(column.broken ? 'fill-block' : 'fill-accent')}
              />
            )}
            <text x={tx} y={LOOP_FLOW.top - 22} textAnchor={anchor} className="tnum fill-content text-body font-semibold">
              {format.number(column.value)}
            </text>
            {column.labels.map((label, j) => (
              <text
                key={label}
                x={tx}
                y={LOOP_FLOW.top - 8 + j * LINE}
                textAnchor={anchor}
                className="fill-content-subtle text-label"
              >
                {label}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
