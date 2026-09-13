import type { Meta, StoryObj } from '@storybook/react';
import { InfoTip } from './tooltip';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * Reference text, one focusable control away. Tab to the trigger to open it
 * from the keyboard; the trigger's label is what a screen reader announces.
 */

const meta: Meta<typeof InfoTip> = {
  title: 'Primitives/InfoTip',
  component: InfoTip,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof InfoTip>;

export const BesideALabel: Story = {
  render: () => (
    <div className="flex items-center gap-1.5 pt-12 text-body text-content">
      Eligibility
      <InfoTip label="About eligibility">Hard contractual and legal gates. Failing one removes the candidate outright.</InfoTip>
    </div>
  ),
};

export const AReasonCode: Story = {
  render: () => (
    <div className="flex items-center gap-1.5 pt-16 font-mono text-label text-content">
      COOLDOWN_ACTIVE
      <InfoTip label="About COOLDOWN_ACTIVE">
        The customer declined this offer and its rest period has not elapsed. FREQUENCY_CAP_BREACHED is the cap: contacted
        too often.
      </InfoTip>
    </div>
  ),
};
