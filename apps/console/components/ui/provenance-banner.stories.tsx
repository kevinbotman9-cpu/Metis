import type { Meta, StoryObj } from '@storybook/react';
import { ProvenanceBanner } from './provenance-banner';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The one worth checking in dark mode is `Mixed`, because it is the state that
 * carries two numbers as well as a sentence: the counts sit in muted text
 * against a tinted ground, which is the combination most likely to fall below
 * contrast when the palette inverts.
 *
 * `Recorded` and `Absent` both render nothing, on purpose. A banner that
 * appeared on real data would train people to ignore it, and one that appeared
 * when provenance was unknown would be asserting something the response did not
 * say.
 */
const meta: Meta<typeof ProvenanceBanner> = {
  title: 'Primitives/ProvenanceBanner',
  component: ProvenanceBanner,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof ProvenanceBanner>;

export const Synthetic: Story = {
  args: {
    provenance: {
      source: 'synthetic',
      syntheticCount: 10_400,
      recordedCount: 0,
      note:
        'Synthetic. Every figure here is generated from a fixed seed for the demo tenant ' +
        'demo-telco-uk and describes no real customer, decision or outcome. Reproducible, ' +
        'and not evidence of anything.',
    },
  },
};

export const Mixed: Story = {
  args: {
    provenance: {
      source: 'mixed',
      syntheticCount: 10_400,
      recordedCount: 4,
      note:
        'Mixed. 10,400 of 10,404 records here are generated from a fixed seed for the demo ' +
        'tenant demo-telco-uk and describe no real customer; the rest derive from decisions ' +
        'this platform actually made. Not evidence of anything.',
    },
  },
};

/** Renders nothing. Real data needs no caveat. */
export const Recorded: Story = {
  args: {
    provenance: { source: 'recorded', syntheticCount: 0, recordedCount: 12, note: 'Recorded.' },
  },
};

/** Also nothing — and deliberately not a guess in either direction. */
export const Absent: Story = {
  args: { provenance: null },
};
