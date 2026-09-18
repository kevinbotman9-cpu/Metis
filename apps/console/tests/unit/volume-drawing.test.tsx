// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { EdgeProps } from 'reactflow';
import { StaticFormatProvider } from '@/components/tenant-format';
import { LoopFlow, LOOP_FLOW } from '@/components/loop-flow';
import { VolumeEdge, VOLUME_EDGE_MAX, type VolumeEdgeData } from '@/components/canvas/volume-edge';
import { volumeEdges } from '@/components/canvas/flow-canvas';
import { bandPath, ribbonPath, volumeScale } from '@/components/volume/geometry';

/**
 * Both screens draw volume with one scale.
 *
 * The loop diagram and the canvas overlay are different diagrams on purpose,
 * and they share `components/volume/geometry.ts` so a thickness is the same
 * arithmetic in both. These hold each drawing to that module rather than to a
 * copy of its formula: a diagram that scaled for itself would pass a test that
 * re-derived the number the same wrong way.
 */

afterEach(cleanup);

const SETTINGS = { locale: 'en-US', currency: 'USD' } as const;

const stages = [
  { id: 'decisions', label: 'Decisions made', value: 10_000 },
  { id: 'offered', label: 'Offered something', value: 4_000 },
  { id: 'deliverable', label: 'Deliverable', value: 900, broken: true },
  { id: 'seen', label: 'Seen', value: 400 },
  { id: 'acted', label: 'Acted on', value: 80 },
];

describe('the loop diagram', () => {
  it('draws every column at the shared scale', () => {
    const { container } = render(
      <StaticFormatProvider settings={SETTINGS}>
        <LoopFlow stages={stages} />
      </StaticFormatProvider>
    );
    const scale = volumeScale(10_000, LOOP_FLOW.band);
    const heights = [...container.querySelectorAll('rect[data-part="stage"]')].map((r) =>
      Number(r.getAttribute('height'))
    );
    expect(heights).toEqual(stages.map((s) => scale(s.value)));
  });

  it('divides each column exactly: what carries on, and what falls away beneath it', () => {
    const { container } = render(
      <StaticFormatProvider settings={SETTINGS}>
        <LoopFlow stages={stages} />
      </StaticFormatProvider>
    );
    const scale = volumeScale(10_000, LOOP_FLOW.band);
    const { top, column } = LOOP_FLOW;
    const step = (LOOP_FLOW.width - column) / (stages.length - 1);
    const carry = [...container.querySelectorAll('path[data-part="carry"]')].map((p) => p.getAttribute('d'));
    // Both parts: the largest drop that is not the break carries the page's
    // accent and says so in its `data-part` (ADR-023 §3, amended).
    const leave = [...container.querySelectorAll('path[data-part="leave"], path[data-part="leave-most"]')].map((p) =>
      p.getAttribute('d')
    );

    // Between decisions and offered: 4,000 carries on at its own height.
    const on = scale(4_000);
    expect(carry[0]).toBe(ribbonPath(column, top, top + on, step, top, top + on));
    // And the rest of the first column starts exactly where the carry ends.
    expect(leave[0]?.startsWith(`M ${column} ${top + on}`)).toBe(true);
    expect(leave).toHaveLength(stages.length - 1);
  });

  it('keeps the name the screens find it by', () => {
    const { getByRole } = render(
      <StaticFormatProvider settings={SETTINGS}>
        <LoopFlow stages={stages} />
      </StaticFormatProvider>
    );
    expect(getByRole('img').getAttribute('aria-label')).toMatch(/^The loop as volume/);
  });
});

describe('the canvas overlay', () => {
  it('draws an edge as a band at the scaled thickness', () => {
    const scale = volumeScale(5_000, VOLUME_EDGE_MAX);
    const props = {
      id: 'e1',
      sourceX: 10,
      sourceY: 40,
      targetX: 210,
      targetY: 90,
      data: { volume: 2_500, scale },
    } as unknown as EdgeProps<VolumeEdgeData>;
    const { container } = render(
      <svg>
        <VolumeEdge {...props} />
      </svg>
    );
    expect(container.querySelector('path')?.getAttribute('d')).toBe(bandPath(10, 40, 210, 90, scale(2_500)));
  });

  it('scales every edge over the graph’s largest crossing, and gives an edge the report does not name nothing', () => {
    const edges = [
      { id: 'a', source: 'src', target: 'elig' },
      { id: 'b', source: 'elig', target: 'rank' },
      { id: 'c', source: 'rank', target: 'new_node' },
    ];
    const drawn = volumeEdges(edges, {
      edges: [
        { from: 'src', to: 'elig', volume: 8_000 },
        { from: 'elig', to: 'rank', volume: 2_000 },
      ],
    });
    const scale = volumeScale(8_000, VOLUME_EDGE_MAX);

    expect(drawn.map((e) => e.data!.volume)).toEqual([8_000, 2_000, 0]);
    expect(drawn.map((e) => e.data!.scale(e.data!.volume))).toEqual([scale(8_000), scale(2_000), scale(0)]);
    expect(drawn.every((e) => e.type === 'volume')).toBe(true);
  });
});
