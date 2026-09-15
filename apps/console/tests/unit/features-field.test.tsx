// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import type { Option } from '@metis/ui-metadata';
import { FeaturesField } from '@/components/ui/features-field';

/**
 * The features field. ADR-009 §5.
 *
 * What it must make unwritable is what the compiler refuses: a feature whose
 * declared type disagrees with the data model, and a path read twice.
 */

afterEach(cleanup);

const OPTIONS: Option[] = [
  { value: 'customer.age', label: 'customer.age', type: 'integer', kind: 'field' },
  { value: 'customer.credit_status', label: 'customer.credit_status', type: 'enum', kind: 'field' },
];

function Harness({ onEmit, initial = '' }: { onEmit: (value: string) => void; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <FeaturesField
      id="features"
      label="Features"
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

const last = (emit: ReturnType<typeof vi.fn>) =>
  JSON.parse(emit.mock.calls[emit.mock.calls.length - 1][0] as string) as { path: string; type: string }[];

describe('declaring what a model reads', () => {
  it('starts empty, and says the model reads nothing rather than offering a row to fill', () => {
    render(<Harness onEmit={vi.fn()} />);
    expect(screen.getByText('Reads no features')).toBeTruthy();
    expect(screen.queryByLabelText('Path for feature 1')).toBeNull();
  });

  it('takes the type from the data model, never from the person', () => {
    const emit = vi.fn();
    render(<Harness onEmit={emit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add feature' }));
    fireEvent.change(screen.getByLabelText('Path for feature 1'), { target: { value: 'customer.credit_status' } });

    expect(last(emit)).toEqual([{ path: 'customer.credit_status', type: 'enum' }]);
    expect(screen.getByText('enum')).toBeTruthy();
  });

  it('does not offer a path another row already reads', () => {
    render(<Harness onEmit={vi.fn()} initial={JSON.stringify([{ path: 'customer.age', type: 'integer' }])} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add feature' }));
    const offered = within(screen.getByLabelText('Path for feature 2'))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);

    expect(offered).toEqual(['', 'customer.credit_status']);
  });

  it('removes a row', () => {
    const emit = vi.fn();
    render(
      <Harness
        onEmit={emit}
        initial={JSON.stringify([
          { path: 'customer.age', type: 'integer' },
          { path: 'customer.credit_status', type: 'enum' },
        ])}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove feature 1' }));
    expect(last(emit)).toEqual([{ path: 'customer.credit_status', type: 'enum' }]);
  });
});
