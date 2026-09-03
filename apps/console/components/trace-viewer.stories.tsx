import type { Meta, StoryObj } from '@storybook/react';
import { TraceViewer } from './trace-viewer';

const mockTrace = {
  id: 'dec_abc123',
  timestamp: new Date().toISOString(),
  artifactVersion: '1.2.0',
  tenantId: 'telco-uk',
  eliminations: [
    {
      nodeId: 'source_1',
      reason: 'Loaded customer profile (age 45, segment: loyal)',
      eliminated: [],
    },
    {
      nodeId: 'filter_1',
      reason: 'Eligibility check: age > 18 and active',
      eliminated: [],
    },
    {
      nodeId: 'arbitrate_1',
      reason: 'Ranked by propensity × value formula',
      eliminated: ['offer_retention', 'offer_basic_upgrade'],
    },
  ],
  scores: {
    upsell_5g: 0.87,
    upsell_data: 0.62,
    retention_offer: 0.45,
  },
  arbitration: {
    formula: 'propensity * value',
    winner: 'upsell_5g',
  },
  timings: {
    source_1: 3.2,
    filter_1: 1.8,
    arbitrate_1: 2.1,
  },
};

const meta = {
  title: 'Features/TraceViewer',
  component: TraceViewer,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TraceViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trace: mockTrace,
  },
};

export const WithReplay: Story = {
  args: {
    trace: mockTrace,
    onReplay: async () => {
      await new Promise((r) => setTimeout(r, 1000));
    },
  },
};

export const LightTheme: Story = {
  parameters: {
    theme: 'light',
  },
  args: {
    trace: mockTrace,
    onReplay: async () => {
      await new Promise((r) => setTimeout(r, 1000));
    },
  },
};

export const DarkTheme: Story = {
  parameters: {
    theme: 'dark',
  },
  args: {
    trace: mockTrace,
  },
};
