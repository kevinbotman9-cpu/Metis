import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { FilterBlocks, type FilterBlock } from './filter-blocks';

const BLOCKS: FilterBlock[] = [
  { id: 'all', label: 'Offers', value: 11, sub: 'across 4 objectives' },
  { id: 'live', label: 'Selectable', value: 8, sub: 'active and deliverable', tone: 'pass' },
  { id: 'blocked', label: 'Cannot be delivered', value: 1, sub: 'no active creative', tone: 'block' },
  { id: 'boosted', label: 'Boosted', value: 5, sub: 'above 1.0', tone: 'hold' },
];

/**
 * A radio group, so arrow keys move between the blocks — try it with the
 * keyboard. Theme and density are toolbar globals; compact is worth a look,
 * because these carry three lines each and are the tallest thing on the page.
 */
const meta: Meta<typeof FilterBlocks> = {
  title: 'Primitives/FilterBlocks',
  component: FilterBlocks,
  parameters: { layout: 'padded' },
  args: { blocks: BLOCKS, activeId: 'all', label: 'Filter the catalogue' },
};
export default meta;

type Story = StoryObj<typeof FilterBlocks>;

/**
 * A component, not an inline render function: hooks may not live in `render`,
 * and the selection has to be stateful for the arrow keys to be worth trying.
 */
function Interactive(args: React.ComponentProps<typeof FilterBlocks>) {
  const [active, setActive] = useState(args.activeId);
  return <FilterBlocks {...args} activeId={active} onSelect={setActive} />;
}

/** Selection is real here — click or arrow between them. */
export const Playground: Story = {
  render: (args) => <Interactive {...args} />,
};

export const BlockedSelected: Story = {
  args: { activeId: 'blocked' },
  name: 'Filtered to the problem',
};

/**
 * Nothing is wrong, so nothing is coloured. A zero in the block tone would
 * read as an alarm for a catalogue in perfect health.
 */
export const NothingWrong: Story = {
  args: {
    activeId: 'all',
    blocks: BLOCKS.map((b) =>
      b.id === 'blocked' ? { ...b, value: 0 } : b
    ),
  },
  name: 'Zero is not a warning',
};

export const Empty: Story = {
  args: {
    activeId: 'all',
    blocks: BLOCKS.map((b) => ({ ...b, value: 0 })),
  },
  name: 'Empty catalogue',
};
