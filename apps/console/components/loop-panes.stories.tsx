import type { Meta, StoryObj } from '@storybook/react';
import { LoopFirstPaint, LoopInversions, LoopStageDetail, LoopStageEvidence } from './loop-panes';
import { buildLoop, type LoopReport } from '@/lib/loop';
import { formatterFor } from '@/lib/format';

/**
 * The panes of the loop Cascade — `/performance` and the Overview.
 *
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The report here is small on purpose: one flow, three channels, the shape of
 * the seeded tenant rather than its numbers. The break is on **Deliverable**,
 * where email and SMS decide and nothing sends what they decide.
 */

const F = formatterFor({ locale: 'en-US', currency: 'USD' });

const REPORT = {
  decisions: 120,
  offered: 54,
  deliverable: 36,
  measured: 22,
  acted: 5,
  from: '2026-08-14T00:00:00.000Z',
  to: '2026-09-12T00:00:00.000Z',
  channels: [
    { channel: 'web', decisions: 84, offered: 36, deliverable: 36, seen: 22, acted: 5, delivers: true },
    { channel: 'email', decisions: 24, offered: 12, deliverable: 0, seen: 0, acted: 0, delivers: false },
    { channel: 'sms', decisions: 12, offered: 6, deliverable: 0, seen: 0, acted: 0, delivers: false },
  ],
  rows: [
    { action: 'fios_gigabit', channel: 'web', flowId: 'next-best-action', offered: 24, measured: 15, clickRate: 0.2, acceptanceRate: 0.13, valueMinor: 30000 },
    { action: '5g_home_ultimate', channel: 'web', flowId: 'next-best-action', offered: 12, measured: 7, clickRate: 0.14, acceptanceRate: null, valueMinor: null },
    { action: 'disney_plus', channel: 'email', flowId: 'next-best-action', offered: 12, measured: 0, clickRate: null, acceptanceRate: null, valueMinor: null },
    { action: 'netflix', channel: 'sms', flowId: 'next-best-action', offered: 6, measured: 0, clickRate: null, acceptanceRate: null, valueMinor: null },
  ],
  series: Array.from({ length: 30 }, (_, i) => ({
    decisions: 3 + (i % 3),
    offered: 1 + (i % 2),
    deliverable: 1,
    seen: i % 2,
    acted: i % 7 === 0 ? 1 : 0,
  })),
  provenance: { source: 'seed', syntheticCount: 120, recordedCount: 0, note: '' },
  arms: [],
} as unknown as LoopReport;

const MARGINS = new Map([
  ['fios_gigabit', 10000],
  ['5g_home_ultimate', 10000],
  ['disney_plus', 8000],
  ['netflix', 7000],
]);

const LOOP = buildLoop(REPORT, MARGINS, F);

const meta: Meta = {
  title: 'Insights/LoopPanes',
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj;

/** Before a stage is chosen: value against the ceiling, the flow, three trends. */
export const FirstPaint: Story = {
  render: () => <LoopFirstPaint data={REPORT} loop={LOOP} />,
};

/** The break, selected. */
export const DeliverableSelected: Story = {
  render: () => <LoopStageDetail data={REPORT} loop={LOOP} stage="deliverable" />,
};

/** Rates by action, each over what was measured and never over what was decided. */
export const ActedOnSelected: Story = {
  render: () => <LoopStageDetail data={REPORT} loop={LOOP} stage="acted" />,
};

/** Evidence with nothing selected: which channels close the loop. */
export const EvidenceWhole: Story = {
  render: () => <LoopStageEvidence data={REPORT} loop={LOOP} stage={null} />,
};

/** A stage larger than the one above it: the screen says it is wrong instead of drawing it. */
export const AnInversion: Story = {
  render: () => {
    const lying = { ...REPORT, measured: 40 } as LoopReport;
    return <LoopInversions loop={buildLoop(lying, MARGINS, F)} />;
  },
};
