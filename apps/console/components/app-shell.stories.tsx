import type { Meta, StoryObj } from '@storybook/react';
import { AppShell } from './app-shell';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

const meta = {
  title: 'Layout/AppShell',
  component: AppShell,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const SampleContent = () => (
  <div className="p-8 space-y-4">
    <h2 className="text-2xl font-bold text-base-900">Strategies</h2>
    <div className="grid grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle>Strategy {i}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-base-600">Version 1.0.0</p>
            <p className="text-xs text-base-500 mt-2">3 nodes, 6ms p95</p>
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);

export const Default: Story = {
  args: {
    children: <SampleContent />,
  },
};

export const LightTheme: Story = {
  parameters: {
    theme: 'light',
  },
  args: {
    children: <SampleContent />,
  },
};

export const DarkTheme: Story = {
  parameters: {
    theme: 'dark',
  },
  args: {
    children: <SampleContent />,
  },
};

export const CompactDensity: Story = {
  parameters: {
    density: 'compact',
  },
  args: {
    children: <SampleContent />,
  },
};
