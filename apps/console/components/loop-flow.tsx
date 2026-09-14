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
} as const;

export function LoopFlow({ stages }: { stages: readonly LoopFlowStage[] }) {
  const format = useFormat();
  const { width: W, height: H, top: TOP, band: BAND, column: COL, dropGap } = LOOP_FLOW;
  const scale = volumeScale(Math.max(0, ...stages.map((s) => s.value)), BAND);
  const n = stages.length;
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
        .join(', ')}. What leaves between each pair falls away beneath it.`}
    >
      {stages.slice(0, -1).map((stage, i) => {
        const next = stages[i + 1];
        const here = scale(stage.value);
        const on = Math.min(here, scale(next.value));
        const lost = stage.value - next.value;
        const x0 = x(i) + COL;
        return (
          <g key={`between-${stage.id}`}>
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

      {stages.map((stage, i) => {
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
        const tx = i === 0 ? x(i) : i === n - 1 ? x(i) + COL : x(i) + COL / 2;
        return (
          <g key={stage.id}>
            <rect
              data-part="stage"
              x={x(i)}
              y={TOP}
              width={COL}
              height={scale(stage.value)}
              rx={3}
              className={cn(stage.broken ? 'fill-block' : 'fill-accent')}
            />
            <text x={tx} y={TOP - 22} textAnchor={anchor} className="tnum fill-content text-body font-semibold">
              {format.number(stage.value)}
            </text>
            <text x={tx} y={TOP - 8} textAnchor={anchor} className="fill-content-subtle text-label">
              {stage.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
