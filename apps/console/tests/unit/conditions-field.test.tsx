// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import type { Option } from '@metis/ui-metadata';
import { ConditionsField } from '@/components/ui/conditions-field';

/**
 * The conditions field, comparing a field with another field. ADR-017 §2, G-075.
 *
 * What it must make unwritable is what the server refuses: a path value on an
 * operator that cannot compare two fields, and a pair of fields whose types
 * cannot be compared — money against a plain number, above all, because pence
 * against a count reads correctly and matches nothing.
 */

afterEach(cleanup);

const path = (value: string, type: string, operators: string, members?: string): Option => ({
  value,
  label: value,
  type,
  kind: 'field',
  operators,
  members,
});

const NUMERIC_OPS = 'eq,ne,gt,gte,lt,lte,in,not_in,exists,not_exists';
const ENUM_OPS = 'eq,ne,in,not_in,exists,not_exists';

const OPTIONS: Option[] = [
  path('offer.financials.price.amount', 'money', NUMERIC_OPS),
  path('customer.monthly_spend', 'money', NUMERIC_OPS),
  path('customer.age', 'integer', NUMERIC_OPS),
  path('customer.plan', 'enum', ENUM_OPS, 'none,standard'),
  path('context.plan_wanted', 'enum', ENUM_OPS, 'standard,none'),
  path('context.tier', 'enum', ENUM_OPS, 'gold,silver'),
];

function Harness({ onEmit }: { onEmit: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <ConditionsField
      id="conditions"
      label="Conditions"
      value={value}
      onChange={(next) => {
        setValue(next);
        onEmit(next);
      }}
      options={OPTIONS}
      enabled
    />
  );
}

const lastConditions = (emit: ReturnType<typeof vi.fn>) =>
  JSON.parse(emit.mock.calls[emit.mock.calls.length - 1][0] as string) as { field: string; operator: string; value: unknown }[];

const choose = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });

const offered = (label: string) =>
  within(screen.getByLabelText(label, { exact: true }) as HTMLElement)
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value);

describe('comparing a field with another field', () => {
  it('offers only fields of a comparable type — money with money, never with a count', () => {
    render(<Harness onEmit={vi.fn()} />);
    choose('Field for condition 1', 'offer.financials.price.amount');
    choose('Operator for condition 1', 'lt');

    expect(offered('Compare condition 1 with')).toEqual(['', 'customer.monthly_spend']);
  });

  it('writes the other field as a path, and asks for no typed value', () => {
    const emit = vi.fn();
    render(<Harness onEmit={emit} />);
    choose('Field for condition 1', 'offer.financials.price.amount');
    choose('Operator for condition 1', 'lt');
    choose('Compare condition 1 with', 'customer.monthly_spend');

    expect(lastConditions(emit)).toEqual([
      { field: 'offer.financials.price.amount', operator: 'lt', value: { path: 'customer.monthly_spend' } },
    ]);
    expect(screen.queryByLabelText('Value for condition 1', { exact: true })).toBeNull();
  });

  it('drops the path when the operator changes to one that cannot compare two fields', () => {
    const emit = vi.fn();
    render(<Harness onEmit={emit} />);
    choose('Field for condition 1', 'offer.financials.price.amount');
    choose('Operator for condition 1', 'lt');
    choose('Compare condition 1 with', 'customer.monthly_spend');
    choose('Operator for condition 1', 'in');

    expect(lastConditions(emit)[0]).toEqual({ field: 'offer.financials.price.amount', operator: 'in', value: '' });
    expect(screen.queryByLabelText('Compare condition 1 with', { exact: true })).toBeNull();
  });

  it('offers no comparison for an existence check', () => {
    render(<Harness onEmit={vi.fn()} />);
    choose('Field for condition 1', 'offer.financials.price.amount');
    choose('Operator for condition 1', 'exists');

    expect(screen.queryByLabelText('Compare condition 1 with', { exact: true })).toBeNull();
  });

  it('offers an enum only enums that declare the same members', () => {
    render(<Harness onEmit={vi.fn()} />);
    choose('Field for condition 1', 'customer.plan');
    choose('Operator for condition 1', 'eq');

    expect(offered('Compare condition 1 with')).toEqual(['', 'context.plan_wanted']);
  });
});
