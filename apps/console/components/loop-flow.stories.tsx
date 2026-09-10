import type { Meta, StoryObj } from '@storybook/react';
import { LoopFlow } from './loop-flow';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The wedge between two bars is the point. Five shrinking bars say the last one
 * is small; the wedges say where the rest went, and the largest of them here is
 * not customer behaviour but a channel with no sender.
 *
 * A figure, not a control — the rail beside it on `/performance` is what
 * selects a stage. See **Every stage equal**, which is the shape when nothing
 * leaves: no wedges at all, and the diagram correctly says nothing.
 */

const meta: Meta<typeof LoopFlow> = {
  title: 'Insights/LoopFlow',
  component: LoopFlow,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof LoopFlow>;

const stage = (id: string, label: string, value: number, broken = false) => ({
  id,
  label,
  value,
  broken,
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
 * Nothing leaves between any pair, so there is no wedge to draw. Worth keeping
 * as a story because the drawing code returns `null` for a non-positive loss,
 * and a diagram that renders a zero-height quadrilateral instead would put four
 * faint slivers and four `−0` labels on a perfect funnel.
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
