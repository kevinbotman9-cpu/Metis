import type { Meta, StoryObj } from '@storybook/react';
import { LoopFlow } from './loop-flow';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * What falls away between two columns is the point. Five shrinking columns say
 * the last one is small; the ribbons falling beneath them say where the rest
 * went, and the largest of them here is not customer behaviour but a channel with
 * no sender. Drawn with the geometry the canvas's volume overlay uses.
 *
 * A figure, not a control — the rail beside it on `/performance` is what
 * selects a stage. See **Every stage equal**, which is the shape when nothing
 * leaves: one column naming every stage, and nothing falling away.
 */

const meta: Meta<typeof LoopFlow> = {
  title: 'Insights/LoopFlow',
  component: LoopFlow,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof LoopFlow>;

/** The loop's five stages carry the rail's tones, so both draw one object. */
const TONE = {
  decisions: 'neutral',
  offered: 'accent',
  deliverable: 'accent',
  seen: 'attention',
  acted: 'ok',
} as const;

const stage = (id: keyof typeof TONE, label: string, value: number, broken = false) => ({
  id,
  label,
  value,
  broken,
  tone: TONE[id],
});

export const TheSeededLoop: Story = {
  args: {
    stages: [
      stage('decisions', 'Decisions made', 10_401),
      stage('offered', 'Offered something', 3426),
      stage('deliverable', 'Deliverable', 739, true),
      stage('seen', 'Seen', 416),
      stage('acted', 'Acted on', 79),
    ],
  },
  name: 'The seeded loop — one channel of five delivers',
};

export const NothingBroken: Story = {
  args: {
    stages: [
      stage('decisions', 'Decisions made', 10_401),
      stage('offered', 'Offered something', 9800),
      stage('deliverable', 'Deliverable', 9612),
      stage('seen', 'Seen', 8100),
      stage('acted', 'Acted on', 1544),
    ],
  },
  name: 'Nothing broken — every wedge is behaviour',
};

/**
 * Nothing leaves between any pair, so there is one column carrying all five
 * names and no wedge at all. Before equal runs were merged (2026-09-17) this
 * drew five full columns joined by four full bands; it was kept as a story then
 * because a diagram rendering a zero-height quadrilateral would put four faint
 * slivers and four `−0` labels on a perfect funnel, and that still cannot happen.
 */
export const EveryStageEqual: Story = {
  args: {
    stages: [
      stage('decisions', 'Decisions made', 500),
      stage('offered', 'Offered something', 500),
      stage('deliverable', 'Deliverable', 500),
      stage('seen', 'Seen', 500),
      stage('acted', 'Acted on', 500),
    ],
  },
  name: 'Every stage equal — no volume leaves',
};

/**
 * A tenant with no decisions. Every bar falls back to its minimum height rather
 * than to nothing, so the axis still reads as a loop with no volume in it
 * instead of as a failed render.
 */
export const Empty: Story = {
  args: {
    stages: [
      stage('decisions', 'Decisions made', 0),
      stage('offered', 'Offered something', 0),
      stage('deliverable', 'Deliverable', 0),
      stage('seen', 'Seen', 0),
      stage('acted', 'Acted on', 0),
    ],
  },
  name: 'Empty — nothing decided yet',
};

/**
 * A loop made by hand. Four stages at 26 are one column carrying all four
 * names, and the only transition drawn is the one where volume left.
 */
export const ByHand: Story = {
  args: {
    stages: [
      stage('decisions', 'Decisions made', 26),
      stage('offered', 'Offered something', 26),
      stage('deliverable', 'Deliverable', 26),
      stage('seen', 'Seen', 26),
      stage('acted', 'Acted on', 1),
    ],
  },
  name: 'By hand — equal stages drawn as one column',
};
