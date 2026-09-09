import type { Meta, StoryObj } from '@storybook/react';
import { ShadowSummary } from './shadow-panel';
import type { ShadowReport } from '@metis/client';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The state worth looking at hardest is "Configured, nothing compared yet". It
 * is the one a percentage would misrepresent, and the reason the agreement
 * figure reads "—" rather than a number until there is something behind it.
 */
const meta: Meta<typeof ShadowSummary> = {
  title: 'Registry/ShadowSummary',
  component: ShadowSummary,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof ShadowSummary>;

const base: ShadowReport = {
  flowName: 'next-best-action',
  activeVersion: '2.4.0',
  shadowVersion: '2.3.1',
  compared: 0,
  agreed: 0,
  agreementRate: 0,
  topDivergences: [],
  shadowMsP50: 0,
  shadowMsP95: 0,
};

export const NotShadowing: Story = {
  args: { report: { ...base, shadowVersion: null, activeVersion: '2.4.0' } },
  name: 'Nothing shadowing',
};

export const NothingComparedYet: Story = {
  args: { report: base },
  name: 'Configured, nothing compared yet',
};

export const Diverging: Story = {
  args: {
    report: {
      ...base,
      compared: 412,
      agreed: 331,
      agreementRate: 0.8034,
      shadowMsP50: 1.9,
      shadowMsP95: 4.4,
      topDivergences: [
        { kind: 'winner', summary: 'addon_roaming → upsell_data', count: 46 },
        { kind: 'ranking', summary: 'upsell_5g > addon_roaming → addon_roaming > upsell_5g', count: 22 },
        { kind: 'reasons', summary: 'no longer: addon_roaming:SUITABILITY_FAILED', count: 13 },
      ],
    },
  },
  name: 'Diverging — the case a migration has to explain',
};

/**
 * Total agreement is a real answer, but only alongside the count. The rate and
 * the number of decisions behind it carry equal weight for exactly this state.
 */
export const TotalAgreement: Story = {
  args: {
    report: {
      ...base,
      compared: 1204,
      agreed: 1204,
      agreementRate: 1,
      shadowMsP50: 1.7,
      shadowMsP95: 3.9,
    },
  },
  name: 'Agrees on everything compared',
};

export const ExpensiveShadow: Story = {
  args: {
    report: {
      ...base,
      compared: 88,
      agreed: 80,
      agreementRate: 0.9091,
      shadowMsP50: 2.1,
      // The tail is what a p50 alone would hide.
      shadowMsP95: 61.4,
      topDivergences: [{ kind: 'winner', summary: 'upsell_5g → no offer', count: 8 }],
    },
  },
  name: 'A shadow that is not cheap',
};
