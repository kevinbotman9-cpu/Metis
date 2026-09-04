import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'Primitives/Button',
  component: Button,
  parameters: { layout: 'padded' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger', 'link'],
    },
    size: { control: 'select', options: ['sm', 'md', 'lg', 'icon'] },
    disabled: { control: 'boolean' },
  },
  args: { children: 'Publish weights', variant: 'secondary', size: 'md' },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Playground: Story = {};

export const Primary: Story = { args: { variant: 'primary', children: 'Approve' } };
export const Secondary: Story = { args: { variant: 'secondary', children: 'Version history' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'Reset' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Reject' } };
export const Link: Story = { args: { variant: 'link', children: 'All approvals' } };
export const Disabled: Story = { args: { variant: 'primary', children: 'Publish', disabled: true } };

/**
 * Filled buttons use the on-accent / on-block tokens rather than a literal
 * white, because in dark mode the fills become light and white text on them
 * measured 2.75:1. Check both themes with the toolbar.
 */
export const AllVariants: Story = {
  render: () => (
    <div className="space-y-3">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-2">
          <span className="w-10 text-label text-content-subtle">{size}</span>
          {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
            <Button key={variant} variant={variant} size={size}>
              {variant}
            </Button>
          ))}
        </div>
      ))}
    </div>
  ),
};

/** The action pairing used on approvals and arbitration. */
export const ActionBar: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button variant="ghost">Reset</Button>
      <Button variant="danger">Reject</Button>
      <Button variant="primary">Approve</Button>
    </div>
  ),
};
