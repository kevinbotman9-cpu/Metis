'use client';

import { cn } from '@/lib/cn';

/**
 * The loop as volume, with the drop-outs drawn as volume leaving.
 *
 * Five bars whose height is the number of decisions still in the loop, and
 * between each pair a wedge peeling away downward for the ones that left. The
 * wedge is the point: a row of five shrinking bars says the last one is small,
 * and this says where the rest went.
 *
 * Inline SVG rather than a chart library — the shape is five rectangles and
 * four quadrilaterals, and `Recharts` has no mark for "volume leaving between
 * two stages". `viewBox` with no fixed width so it scales with the card.
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

const W = 720;
const H = 220;
const TOP = 34;
const FLOOR = H - 26;
const BAR = 78;

export function LoopFlow({ stages }: { stages: readonly LoopFlowStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  const gap = (W - stages.length * BAR) / Math.max(1, stages.length - 1);
  const x = (i: number) => i * (BAR + gap);
  const h = (v: number) => Math.max(2, ((FLOOR - TOP) * v) / max);
  const top = (v: number) => FLOOR - h(v);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-auto w-full"
      role="img"
      aria-label={`The loop as volume: ${stages
        .map((s) => `${s.label} ${s.value.toLocaleString('en-GB')}`)
        .join(', ')}. Volume leaving between each pair is drawn as a wedge.`}
    >
      {stages.slice(0, -1).map((stage, i) => {
        const next = stages[i + 1];
        const lost = stage.value - next.value;
        if (lost <= 0) return null;
        const x0 = x(i) + BAR;
        const x1 = x(i + 1);
        // The wedge: the top edge falls from this stage's height to the next
        // one's, and the bottom edge is the floor. What is inside it is what
        // left the loop between the two.
        return (
          <g key={`drop-${stage.id}`}>
            <path
              d={`M ${x0} ${top(stage.value)} L ${x1} ${top(next.value)} L ${x1} ${FLOOR} L ${x0} ${FLOOR} Z`}
              className={cn(next.broken ? 'fill-block/15' : 'fill-content-subtle/10')}
            />
            <text
              x={(x0 + x1) / 2}
              y={FLOOR - 8}
              textAnchor="middle"
              className={cn(
                'tnum text-[11px]',
                next.broken ? 'fill-block' : 'fill-content-subtle'
              )}
            >
              −{lost.toLocaleString('en-GB')}
            </text>
          </g>
        );
      })}

      {stages.map((stage, i) => (
        <g key={stage.id}>
          <rect
            x={x(i)}
            y={top(stage.value)}
            width={BAR}
            height={h(stage.value)}
            rx={3}
            className={cn(stage.broken ? 'fill-block' : 'fill-accent')}
          />
          <text
            x={x(i) + BAR / 2}
            y={top(stage.value) - 16}
            textAnchor="middle"
            className="tnum fill-content text-[15px] font-bold"
          >
            {stage.value.toLocaleString('en-GB')}
          </text>
          <text
            x={x(i) + BAR / 2}
            y={FLOOR + 16}
            textAnchor="middle"
            className="fill-content-subtle text-[11px]"
          >
            {stage.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
