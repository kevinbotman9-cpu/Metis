import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'ghost', 'destructive'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    disabled: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Button',
    variant: 'default',
  },
};

export const Secondary: Story = {
  args: {
    children: 'Secondary',
    variant: 'secondary',
  },
};

export const Ghost: Story = {
  args: {
    children: 'Ghost',
    variant: 'ghost',
  },
};

export const Destructive: Story = {
  args: {
    children: 'Delete',
    variant: 'destructive',
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex gap-4">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    children: 'Disabled',
    disabled: true,
  },
};

export const AllThemesLight: Story = {
  parameters: {
    theme: 'light',
    density: 'comfortable',
  },
  render: () => (
    <div className="flex gap-4">
      <Button variant="default">Publish</Button>
      <Button variant="secondary">Cancel</Button>
      <Button variant="ghost">More</Button>
    </div>
  ),
};

export const AllThemesDark: Story = {
  parameters: {
    theme: 'dark',
    density: 'comfortable',
  },
  render: () => (
    <div className="flex gap-4">
      <Button variant="default">Publish</Button>
      <Button variant="secondary">Cancel</Button>
      <Button variant="ghost">More</Button>
    </div>
  ),
};
