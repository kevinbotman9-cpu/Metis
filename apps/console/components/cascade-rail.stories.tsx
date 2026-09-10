import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { CascadeRail, type CascadeStage } from './cascade-rail';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The state worth looking hardest at is **The break**. It is the whole reason
 * the pattern exists: a decomposition that loses most of its volume for a
 * structural reason has to say so, because a reader takes a small bar for a
 * poor result and a break for a broken thing, and only one of those is
 * actionable.
 *
 * Compare it with **Smoothed** below, which is the same five figures with the
 * emphasis removed. That is what `/performance` looked like until 2026-09-10,
 * and the difference between the two is a marketer quoting a 19% click rate for
 * a product that delivers on one channel of five.
 */

const days = (peak: number, n = 30) =>
  Array.from({ length: n }, (_, i) => Math.round(peak * (0.55 + 0.45 * Math.sin(i / 3.2))));

const loop = (broken?: string): CascadeStage[] => [
  {
    id: 'decisions',
    label: 'Decisions made',
    value: 10_401,
    pct: 100,
    note: '5 channels',
    series: days(48),
  },
  {
    id: 'offered',
    label: 'Offered something',
    value: 3426,
    pct: 33,
    note: '33% of decisions',
    series: days(16),
  },
  {
    id: 'deliverable',
    label: 'Deliverable',
    value: 739,
    pct: 7.1,
    note: '22% of offered',
    series: days(4),
    broken,
  },
  { id: 'seen', label: 'Seen', value: 416, pct: 4, note: '56.3% of deliverable', series: days(3) },
  { id: 'acted', label: 'Acted on', value: 79, pct: 0.8, note: '19.0% of seen', series: days(1) },
];

const BREAK =
  '2,687 decisions won a slot on a channel nothing delivers — SMS, Outbound call, Push, Email. They were decided correctly and reached nobody.';

/** Selection is the consumer's state, so the stories hold it themselves. */
function Interactive({ stages, foot }: { stages: CascadeStage[]; foot?: React.ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="max-w-[17rem] rounded border border-border bg-surface">
      <CascadeRail
        label="The loop"
        stages={stages}
        selected={selected}
        onSelect={setSelected}
        foot={foot}
      />
    </div>
  );
}

const meta: Meta<typeof Interactive> = {
  title: 'Insights/CascadeRail',
  component: Interactive,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof Interactive>;

export const TheBreak: Story = {
  args: {
    stages: loop(BREAK),
    foot: (
      <>
        The loop is <strong className="font-semibold text-content">closed on Web only</strong> and
        open on 4. Until a sender exists, every figure below <em>Deliverable</em> describes Web only.
      </>
    ),
  },
  name: 'The break — a structural loss, drawn',
};

export const Smoothed: Story = {
  args: { stages: loop() },
  name: 'Smoothed — the same five figures with the break removed',
};

export const NothingSelected: Story = {
  args: { stages: loop(BREAK) },
  name: 'No foot — the rail alone',
};

/**
 * A tenant that has decided nothing yet. Every stage is zero and the bars have
 * a floor, because a rail of five invisible bars reads as a rendering failure
 * rather than as an empty tenant.
 */
export const Empty: Story = {
  args: {
    stages: loop().map((s) => ({ ...s, value: 0, pct: 0, note: '—', series: days(0) })),
  },
  name: 'Empty — nothing decided yet',
};

/**
 * One stage carrying everything. The proportion bars are all full, which is the
 * healthy shape this screen would show if an adapter existed — and it has to be
 * legible too, or the pattern only works for bad news.
 */
export const Healthy: Story = {
  args: {
    stages: [
      { ...loop()[0] },
      { ...loop()[1], value: 9800, pct: 94, note: '94% of decisions' },
      { ...loop()[2], value: 9612, pct: 92, note: '98% of offered' },
      { ...loop()[3], value: 8100, pct: 78, note: '84% of deliverable' },
      { ...loop()[4], value: 1544, pct: 15, note: '19.1% of seen' },
    ],
  },
  name: 'Healthy — no break to draw',
};
