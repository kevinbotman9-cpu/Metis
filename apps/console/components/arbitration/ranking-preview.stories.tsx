import type { Meta, StoryObj } from '@storybook/react';
import { RankingPreview } from './ranking-preview';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The rows are literal here rather than ranked by `@metis/core/arbitration`: a
 * story shows what the component draws for a given ranking, and the ranking
 * itself is held to the engine elsewhere. The numbers are this tenant's own —
 * three offers on the same margin, separated by two boosts.
 */
const meta: Meta<typeof RankingPreview> = {
  title: 'Arbitration/RankingPreview',
  component: RankingPreview,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof RankingPreview>;

const terms = (value: number, boost: number) => ({ propensity: 1, value, boost, context: 1, cost: 0 });

const live = [
  { key: 'fios_gigabit', name: 'FIOS Gigabit', terms: terms(0.166667, 1.1), rank: 1, priority: 0.18333337, tiedWith: [] },
  { key: '5g_home_ultimate', name: '5G Home Ultimate', terms: terms(0.166667, 1.05), rank: 2, priority: 0.17500035, tiedWith: [] },
  { key: 'gaming_plus_bundle', name: 'Gaming Plus Bundle', terms: terms(0.166667, 1), rank: 3, priority: 0.166667, tiedWith: [] },
  { key: 'disney_plus', name: 'Disney Plus', terms: terms(0.133333, 1), rank: 4, priority: 0.133333, tiedWith: [] },
  { key: 'netflix', name: 'Netflix', terms: terms(0.116667, 1), rank: 5, priority: 0.116667, tiedWith: [] },
];

export const Live: Story = {
  name: 'At the live weights',
  args: {
    scenarioName: 'the fibre-address scenario',
    rows: live,
    moved: { fios_gigabit: 0, '5g_home_ultimate': 0, gaming_plus_bundle: 0, disney_plus: 0, netflix: 0 },
    ties: [],
  },
};

export const BoostDropped: Story = {
  name: 'Boost weight at zero — a real tie',
  args: {
    scenarioName: 'the fibre-address scenario',
    rows: [
      { ...live[1], rank: 1, priority: 0.166667, tiedWith: ['fios_gigabit', 'gaming_plus_bundle'] },
      { ...live[0], rank: 2, priority: 0.166667, tiedWith: ['5g_home_ultimate', 'gaming_plus_bundle'] },
      { ...live[2], rank: 3, priority: 0.166667, tiedWith: ['5g_home_ultimate', 'fios_gigabit'] },
      live[3],
      live[4],
    ],
    moved: { '5g_home_ultimate': 1, fios_gigabit: -1, gaming_plus_bundle: 0, disney_plus: 0, netflix: 0 },
    ties: [['5g_home_ultimate', 'fios_gigabit', 'gaming_plus_bundle']],
  },
};
