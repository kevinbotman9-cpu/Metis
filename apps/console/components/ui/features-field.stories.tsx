import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { Option } from '@metis/ui-metadata';
import { FeaturesField } from './features-field';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The editor a `features` field renders: the inputs a model reads, picked from
 * the data model with the data model's type beside each. The paths are the shape
 * the `profile.paths` source resolves.
 */

const PATHS: Option[] = [
  { value: 'customer.age', label: 'customer.age', type: 'integer', kind: 'field' },
  { value: 'customer.credit_status', label: 'customer.credit_status', type: 'enum', kind: 'field' },
  { value: 'customer.has_fios', label: 'customer.has_fios', type: 'boolean', kind: 'field' },
  { value: 'customer.orders_90d', label: 'customer.orders_90d', type: 'integer', kind: 'aggregation' },
];

function Host({ initial = '', problem, rowProblems, enabled = true }: {
  initial?: string;
  problem?: string;
  rowProblems?: Record<number, string>;
  enabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="max-w-2xl p-card">
      <FeaturesField
        id="story-features"
        label="Features"
        help="Each is a path in the data model. The type is the data model's."
        value={value}
        onChange={setValue}
        options={PATHS}
        enabled={enabled}
        problem={problem}
        rowProblems={rowProblems}
      />
    </div>
  );
}

const meta: Meta<typeof Host> = {
  title: 'Forms/FeaturesField',
  component: Host,
};
export default meta;

type Story = StoryObj<typeof Host>;

/** A model that reads nothing a person could be erased from. */
export const ReadsNothing: Story = {};

export const TwoFeatures: Story = {
  args: {
    initial: JSON.stringify([
      { path: 'customer.age', type: 'integer' },
      { path: 'customer.orders_90d', type: 'integer' },
    ]),
  },
};

export const RefusedByTheServer: Story = {
  args: {
    initial: JSON.stringify([
      { path: 'customer.age', type: 'integer' },
      { path: 'customer.age', type: 'integer' },
    ]),
    rowProblems: { 1: "'customer.age' is declared twice." },
  },
};

export const Disabled: Story = {
  args: { initial: JSON.stringify([{ path: 'customer.credit_status', type: 'enum' }]), enabled: false },
};
