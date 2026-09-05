import type { Meta, StoryObj } from '@storybook/react';
import { CoverageBar } from './coverage-bar';

/**
 * Switch theme and density in the toolbar to see all four axes. The block
 * state is the one worth checking in dark mode: it is the only state that
 * fills the whole track, so it is the only one where the fill colour is
 * carrying meaning rather than proportion.
 */
const meta: Meta<typeof CoverageBar> = {
  title: 'Primitives/CoverageBar',
  component: CoverageBar,
  parameters: { layout: 'padded' },
  argTypes: {
    covered: { control: { type: 'number', min: 0, max: 5 } },
    total: { control: { type: 'number', min: 0, max: 5 } },
    selectable: { control: 'boolean' },
    noun: { control: 'text' },
  },
  args: { covered: 2, total: 5, selectable: true, noun: 'channels' },
};
export default meta;

type Story = StoryObj<typeof CoverageBar>;

export const Playground: Story = {};

export const Full: Story = {
  args: { covered: 5, total: 5 },
  name: 'Every channel covered',
};

export const Partial: Story = {
  args: { covered: 2, total: 5 },
  name: 'Partly covered',
};

export const Blocked: Story = {
  args: { covered: 0, total: 5 },
  name: 'No creative — cannot be delivered',
};

export const NotApplicable: Story = {
  args: { covered: 0, total: 0, selectable: false },
  name: 'Retired — coverage does not apply',
};

/** The list counts creatives; only the drawer can count channels. */
export const CountingCreatives: Story = {
  args: { covered: 3, total: 5, noun: 'creatives' },
  name: 'As the catalogue list uses it',
};

export const AllStates: Story = {
  render: () => (
    <div className="grid max-w-md gap-3">
      {[
        ['Every channel', 5, 5, true, 'channels'],
        ['Partly covered', 2, 5, true, 'channels'],
        ['One channel', 1, 5, true, 'channels'],
        ['Blocked', 0, 5, true, 'channels'],
        ['Retired', 0, 0, false, 'channels'],
      ].map(([label, covered, total, selectable, noun]) => (
        <div key={label as string} className="flex items-center justify-between gap-4">
          <span className="text-label text-content-subtle">{label as string}</span>
          <CoverageBar
            covered={covered as number}
            total={total as number}
            selectable={selectable as boolean}
            noun={noun as string}
          />
        </div>
      ))}
    </div>
  ),
};
