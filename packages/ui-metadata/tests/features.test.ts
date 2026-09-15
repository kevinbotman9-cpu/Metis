import { describe, it, expect } from 'vitest';
import { descriptorFor, toFormState, toPayload, validateLayout, layoutFor } from '../src';

/**
 * The `features` field type and the Model descriptor. ADR-009 §4-5.
 */
describe('the Model descriptor, exercised', () => {
  const model = descriptorFor('Model');
  const record = {
    id: 'accept_propensity',
    version: '1.0.0',
    name: 'Accept propensity',
    description: '',
    kind: 'propensity',
    features: [{ path: 'customer.age', type: 'integer' }],
    declaredP95Ms: 6,
    owner: 'data-science@telco.example',
    weightsHash: 'a'.repeat(64),
    trainedThrough: '2026-08-31',
  };

  it('carries features through form state and back', () => {
    const form = toFormState(model, record);
    const body = toPayload(model, form, { editing: false, permissions: [] });

    expect(body.features).toEqual([{ path: 'customer.age', type: 'integer' }]);
    expect(body.declaredP95Ms).toBe(6);
    expect(body.trainedThrough).toBe('2026-08-31');
  });

  it('drops a row somebody added and never chose a path for', () => {
    const form = toFormState(model, record);
    form.features = JSON.stringify([...JSON.parse(form.features), { path: '', type: 'string' }]);

    expect(toPayload(model, form, { editing: false, permissions: [] }).features).toEqual([
      { path: 'customer.age', type: 'integer' },
    ]);
  });

  it('sends no features, not a malformed list, when the model reads none', () => {
    const form = toFormState(model, { ...record, features: [] });
    expect(toPayload(model, form, { editing: false, permissions: [] }).features).toEqual([]);
  });

  it('does not resend the model id on an edit, because it cannot change', () => {
    const form = toFormState(model, record);
    expect(toPayload(model, form, { editing: true, permissions: [] })).not.toHaveProperty('id');
  });

  it('declares a /models screen the layout check accepts', () => {
    expect(validateLayout(layoutFor('models'))).toEqual([]);
  });
});
