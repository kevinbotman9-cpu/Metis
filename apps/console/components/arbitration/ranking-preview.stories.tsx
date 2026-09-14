import type { Meta, StoryObj } from '@storybook/react';
import { RankingPreview } from './ranking-preview';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The rows are literal here: the component draws a ranking the engine produced
 * and computes none, so a story needs no engine behind it. The priorities are
 * the ones the engine gives this tenant's fibre-address scenario. At boost
 * weight zero, 5G Home Ultimate, FIOS Gigabit and Gaming Plus Bundle share a
 * priority and the engine orders them by key; nothing on the screen marks that
 * (G-125).
 */
const meta: Meta<typeof RankingPreview> = {
  title: 'Arbitration/RankingPreview',
  component: RankingPreview,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof RankingPreview>;

const live = [
  { rank: 1, key: 'fios_gigabit', name: 'FIOS Gigabit', priority: 0.1833337 },
  { rank: 2, key: '5g_home_ultimate', name: '5G Home Ultimate', priority: 0.17500035 },
  { rank: 3, key: 'gaming_plus_bundle', name: 'Gaming Plus Bundle', priority: 0.166667 },
  { rank: 4, key: 'disney_plus', name: 'Disney Plus', priority: 0.133333 },
  { rank: 5, key: 'netflix', name: 'Netflix', priority: 0.116667 },
];

export const Live: Story = {
  name: 'At the live weights',
  args: { scenarioName: 'the fibre-address scenario', rows: live, live },
};

export const BoostDropped: Story = {
  name: 'Boost weight at zero',
  args: {
    scenarioName: 'the fibre-address scenario',
    live,
    rows: [
      { rank: 1, key: '5g_home_ultimate', name: '5G Home Ultimate', priority: 0.166667 },
      { rank: 2, key: 'fios_gigabit', name: 'FIOS Gigabit', priority: 0.166667 },
      { rank: 3, key: 'gaming_plus_bundle', name: 'Gaming Plus Bundle', priority: 0.166667 },
      { rank: 4, key: 'disney_plus', name: 'Disney Plus', priority: 0.133333 },
      { rank: 5, key: 'netflix', name: 'Netflix', priority: 0.116667 },
    ],
  },
};
