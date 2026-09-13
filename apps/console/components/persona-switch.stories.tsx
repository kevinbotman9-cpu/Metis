import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { PersonaSwitchControl } from './persona-switch';
import type { OverviewPersona } from '@/lib/persona';

/**
 * The persona switch in the chrome — which Overview an account that can see
 * more than one lands on.
 *
 * Switch theme and density in the toolbar to see all four axes. Rendered on the
 * header band it lives on, because its tokens are the frame's (`--on-header`),
 * which does not follow the ramp.
 */

const meta: Meta = {
  title: 'Shell/PersonaSwitch',
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj;

function OnTheHeaderBand({ available, start }: { available: OverviewPersona[]; start: OverviewPersona | null }) {
  const [persona, setPersona] = useState<OverviewPersona | null>(start);
  return (
    <div className="flex min-h-14 items-center gap-3 bg-gradient-to-r from-header-from via-header-via to-header-to px-3 text-on-header">
      <PersonaSwitchControl available={available} persona={persona} onChange={setPersona} />
      <span className="text-label">Landing on: {persona ?? 'the loop, no choice'}</span>
    </div>
  );
}

/** Sarah: a marketer and an architect, landing on the loop. */
export const BothMarketerChosen: Story = {
  render: () => <OnTheHeaderBand available={['marketer', 'architect']} start="marketer" />,
};

/** Marcus: an architect, landing on the change pipeline. */
export const BothArchitectChosen: Story = {
  render: () => <OnTheHeaderBand available={['marketer', 'architect']} start="architect" />,
};

/** One persona or none: no switch, because a switch with one position does nothing. */
export const NoChoiceRendersNothing: Story = {
  render: () => <OnTheHeaderBand available={['architect']} start="architect" />,
};
