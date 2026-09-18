'use client';

import { cn } from '@/lib/cn';
import { useFormat } from '@/components/tenant-format';
import type { CascadeTone } from '@/components/cascade-rail';
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
 * **Five columns, always.** From 2026-09-17 to 2026-09-18 consecutive stages
 * with the same figure were drawn as one column carrying every name. It was
 * added for low volume, and low volume is where it did the damage: at two
 * decisions four names stacked over one bar and the funnel stopped being a
 * funnel, because at that volume nearly every stage is equal. Removed by the
 * product owner, from a side-by-side at 2, 12 and the seeded corpus: five
 * columns at 12 read fine. A stage's place in the line is what says which
 * stage it is.
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
  /**
   * The stage's colour, the rail's own — so the two read as one object rather
   * than a coloured rail beside a pale blue diagram. The rail's `--rail-*`
   * tones are measured against the frame; these are the analytic tokens of the
   * same meaning, measured against a white card.
   */
  tone?: CascadeTone;
}

/** The rail's tone, in the analytic tokens a white card needs. */
const FILL: Record<CascadeTone | 'broken', { solid: string; band: string }> = {
  neutral: { solid: 'fill-content-subtle', band: 'fill-content-subtle/20' },
  accent: { solid: 'fill-accent', band: 'fill-accent/20' },
  attention: { solid: 'fill-hold', band: 'fill-hold/20' },
  ok: { solid: 'fill-pass', band: 'fill-pass/20' },
  broken: { solid: 'fill-block', band: 'fill-block/25' },
};

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
  /**
   * The canvas the Overview draws on.
   *
   * From 2026-09-17 it was 1000 wide with a 96-unit band, chosen to match the
   * card's 3.5:1 proportion, and the funnel became a strip: the bars were 40%
   * thinner against the width than on `/performance`. The band is back near
   * that proportion (120 against 860), and the height is paid for below the
   * bars instead — `denseHeight` reserves only the depth the deepest drop
   * actually falls, not a second full band every time — and above them, by
   * the cards over the funnel not wrapping (`LoopFirstPaint`). 2026-09-18.
   */
  denseWidth: 860,
  denseColumn: 22,
  denseBand: 120,
  denseDropGap: 12,
  /** Under the deepest drop: room for its "−N" when the drop itself is thin. */
  denseFloor: 18,
  densePad: 8,
} as const;

/**
 * The dense canvas's height: labels, the band, the gap, and as deep as the
 * deepest drop falls. Exported so a test can hold a drop to the room it has.
 */
export function denseHeight(stages: readonly LoopFlowStage[]): number {
  const scale = volumeScale(Math.max(0, ...stages.map((s) => s.value)), LOOP_FLOW.denseBand);
  const deepest = Math.max(
    0,
    ...stages.slice(0, -1).map((s, i) => {
      const lost = s.value - stages[i + 1].value;
      return lost > 0 ? scale(s.value) - Math.min(scale(s.value), scale(stages[i + 1].value)) : 0;
    })
  );
  return (
    LOOP_FLOW.top +
    LOOP_FLOW.denseBand +
    LOOP_FLOW.denseDropGap +
    Math.max(deepest, LOOP_FLOW.denseFloor) +
    LOOP_FLOW.densePad
  );
}

export function LoopFlow({
  stages,
  dense = false,
  accentStage = null,
}: {
  stages: readonly LoopFlowStage[];
  /** The stage whose incoming drop takes the accent, from `Loop.accentStage`. None when null. */
  accentStage?: string | null;
  /**
   * The Overview's shape: **fills its card**, and reads at the card's size.
   *
   * The first version of this capped the height to buy the page its fit, and
   * the drawing shrank to half size inside a card that kept its height — a
   * funnel floating in white space, with labels smaller than anything else on
   * the screen, because SVG text scales with the drawing. So dense is not
   * "smaller": it is a wider canvas (860 units against 720), thicker columns,
   * a height that ends where the deepest drop does, and type a size up, drawn
   * at whatever height the card has. It is the heaviest thing on the page,
   * which is what the product owner asked for on 2026-09-17.
   */
  dense?: boolean;
}) {
  const format = useFormat();
  const W = dense ? LOOP_FLOW.denseWidth : LOOP_FLOW.width;
  const COL = dense ? LOOP_FLOW.denseColumn : LOOP_FLOW.column;
  const BAND = dense ? LOOP_FLOW.denseBand : LOOP_FLOW.band;
  const dropGap = dense ? LOOP_FLOW.denseDropGap : LOOP_FLOW.dropGap;
  // Nothing has entered the loop. The columns are still drawn — outlined, at the
  // full band — so the shape a reader is about to fill is on screen; and the
  // drawing stops at the band, because there is no row for losses to fall to.
  // Until 2026-09-17 this state drew nothing inside the full 316-unit canvas,
  // which read as about 300px of chart that had failed to load.
  const empty = stages.length > 0 && stages.every((s) => s.value === 0);
  const columns = stages;
  const TOP = LOOP_FLOW.top;
  // Dense: the canvas ends where the deepest drop does, so a loop whose losses
  // are small is not drawn inside room reserved for one that lost everything.
  // `/performance` keeps the canvas it has, to the unit: its own tests pin the
  // viewBox.
  const full = dense ? denseHeight(stages) : LOOP_FLOW.height;
  const H = empty ? LOOP_FLOW.top + BAND + 8 : full;
  const scale = volumeScale(Math.max(0, ...columns.map((c) => c.value)), BAND);
  const n = columns.length;
  const step = n > 1 ? (W - COL) / (n - 1) : 0;
  const x = (i: number) => i * step;
  const dropY = TOP + BAND + dropGap;
  const run = Math.min(step * 0.55, dense ? 140 : 96);
  /**
   * Which drop carries the page's one accent: the one into `accentStage`, a
   * decision the model makes (`Loop.accentStage`) under the loop's own guards.
   * The drawing chose for itself until 2026-09-18 and accented "−2" on a
   * two-decision tenant nobody had clicked on.
   */
  const accentAt = accentStage ? columns.findIndex((c, i) => i > 0 && c.id === accentStage) - 1 : -1;
  /** The type sizes: a size up where the drawing is the page's heaviest element. */
  const type = dense
    ? { figure: 'text-figure', name: 'text-body', drop: 'text-body' }
    : { figure: 'text-body', name: 'text-label', drop: 'text-label' };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      // Dense: absolute inside the box its card gives it, so the drawing's own
      // proportion cannot push the pane taller than the rail beside it — which
      // is what put the page back into a scroll the first time it filled.
      className={cn(dense ? 'absolute inset-0 block h-full w-full' : 'block h-auto w-full')}
      role="img"
      aria-label={`The loop as volume: ${stages
        .map((s) => `${s.label} ${format.number(s.value)}`)
        .join(', ')}. What leaves between each pair falls away beneath it.`}
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
            {/* The band takes the colour of the stage it carries into, so the
                diagram runs through the rail's own tones rather than one pale
                blue: neutral into accent, accent into the break's block,
                through attention at Seen to pass at Acted on. */}
            {/* Nothing carries into a stage at zero. The band was drawn at its
                minimum height anyway, and read as a line across the card. */}
            {next.value > 0 ? (
              <path
                data-part="carry"
                d={ribbonPath(x0, TOP, TOP + on, x(i + 1), TOP, TOP + on)}
                className={FILL[next.broken ? 'broken' : (next.tone ?? 'neutral')].band}
              />
            ) : null}
            {lost > 0 ? (
              <>
                {/* What left: the rest of this column, falling to the row below.
                    The largest drop that is not the break takes the accent. */}
                <path
                  data-part={i === accentAt ? 'leave-most' : 'leave'}
                  d={ribbonPath(x0, TOP + on, TOP + here, x0 + run, dropY, dropY + Math.max(1, here - on))}
                  className={cn(
                    next.broken ? 'fill-block/30' : i === accentAt ? 'fill-accent/40' : 'fill-content-subtle/15'
                  )}
                />
                <text
                  x={x0 + run + 6}
                  y={dropY + 12}
                  className={cn(
                    'tnum',
                    type.drop,
                    next.broken ? 'fill-block' : i === accentAt ? 'fill-accent font-semibold' : 'fill-content-subtle'
                  )}
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
          <g key={column.id} data-part="column" data-stage={column.id}>
            {/* An empty loop draws every column outlined at the full band: the
                shape a reader is about to fill. One stage at zero in a loop that
                is not empty draws nothing but its figure — no bar, and no band
                into it. It drew the scale's minimum until 2026-09-18, a stub and
                a hairline across the card that read as a trickle. */}
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
            ) : column.value > 0 ? (
              <rect
                data-part="stage"
                x={x(i)}
                y={TOP}
                width={COL}
                height={scale(column.value)}
                rx={3}
                className={FILL[column.broken ? 'broken' : (column.tone ?? 'neutral')].solid}
              />
            ) : null}
            <text
              x={tx}
              y={LOOP_FLOW.top - (dense ? 26 : 22)}
              textAnchor={anchor}
              className={cn('tnum fill-content font-semibold', type.figure)}
            >
              {format.number(column.value)}
            </text>
            <text x={tx} y={LOOP_FLOW.top - 8} textAnchor={anchor} className={cn('fill-content-subtle', type.name)}>
              {column.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
