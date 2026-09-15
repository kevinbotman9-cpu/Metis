// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { descriptorFor, toFormState, type Option } from '@metis/ui-metadata';
import { FormRenderer } from '@/components/ui/form-renderer';

/**
 * A server refusal about part of a row lands on that row.
 *
 * The registry names a feature problem by the part of the row it is about —
 * `features.1.path` — and the renderer used to place a row problem only when the
 * key was exactly `features.1`. So a refusal of the second feature went nowhere:
 * not on the row, not on the field, and not in the banner either, because the
 * banner only shows when no problem names a field.
 */

afterEach(cleanup);

const PATHS: Option[] = [
  { value: 'customer.age', label: 'customer.age', type: 'integer', kind: 'field' },
  { value: 'customer.plan', label: 'customer.plan', type: 'enum', kind: 'field' },
];

function renderModelForm(problems: Record<string, string>) {
  const model = descriptorFor('Model');
  const form = toFormState(model, {
    name: 'Accept propensity',
    id: 'accept_propensity',
    version: '1.0.0',
    kind: 'propensity',
    features: [
      { path: 'customer.age', type: 'integer' },
      { path: 'customer.plan', type: 'enum' },
    ],
  });
  render(
    <FormRenderer
      descriptor={model}
      form={form}
      onChange={() => {}}
      editing={false}
      permissions={[]}
      optionSources={{ 'profile.paths': PATHS }}
      problems={problems}
      touched={new Set()}
      onTouch={() => {}}
      idPrefix="model"
    />
  );
}

describe('a refusal about part of a row', () => {
  it('is shown on the row it names, when it names a part of that row', () => {
    renderModelForm({ 'features.1.path': 'The data model does not define this path.' });
    expect(screen.getByText('The data model does not define this path.')).toBeTruthy();
  });

  it('is shown on the row it names, when it names the whole row', () => {
    renderModelForm({ 'features.0': 'Declared twice.' });
    expect(screen.getByText('Declared twice.')).toBeTruthy();
  });
});
