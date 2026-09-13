import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { Option } from '@metis/ui-metadata';
import { ConditionsField } from './conditions-field';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The editor a `conditions` field renders. The paths are the shape the
 * `profile.paths` source resolves — a number, an enum and a boolean — so each
 * value control can be seen: a number box, the enum's members, true or false,
 * and "no value needed" for an existence check.
 */

const PATHS: Option[] = [
  {
    value: 'customer.age',
    label: 'customer.age',
    type: 'integer',
    kind: 'field',
    operators: 'eq,ne,gt,gte,lt,lte,exists,not_exists',
    unit: 'years',
    description: 'Age in whole years, from the date of birth on the profile.',
  },
  {
    value: 'customer.credit_status',
    label: 'customer.credit_status',
    type: 'enum',
    kind: 'field',
    operators: 'eq,ne,in,not_in,exists,not_exists',
    members: 'pass,refer,fail',
    description: 'The latest credit decision.',
  },
  {
    value: 'customer.has_fios',
    label: 'customer.has_fios',
    type: 'boolean',
    kind: 'field',
    operators: 'eq,ne',
    description: 'Holds a Fios broadband service today.',
  },
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
      <ConditionsField
        id="story-conditions"
        label="Conditions"
        help="Each names a path in the data model."
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

const meta: Meta<typeof Host> = { title: 'Forms/ConditionsField', component: Host };
export default meta;
type Story = StoryObj<typeof Host>;

/** A new policy: one row to fill, because a policy with no conditions does not exist. */
export const Blank: Story = {};

export const Filled: Story = {
  args: {
    initial: JSON.stringify([
      { field: 'customer.age', operator: 'gte', value: 18 },
      { field: 'customer.credit_status', operator: 'in', value: ['pass', 'refer'] },
      { field: 'customer.has_fios', operator: 'eq', value: false },
    ]),
  },
};

/** Refusals land on the row they are about, and the list-wide one beneath. */
export const Refused: Story = {
  args: {
    initial: JSON.stringify([
      { field: 'customer.age', operator: 'gte', value: 18 },
      { field: 'customer.credit_status', operator: 'eq', value: '' },
    ]),
    rowProblems: { 1: 'Choose one of pass, refer, fail.' },
  },
};

export const EmptyList: Story = { args: { problem: 'Add at least one condition.' } };

export const Disabled: Story = {
  args: { initial: JSON.stringify([{ field: 'customer.age', operator: 'exists', value: '' }]), enabled: false },
};
