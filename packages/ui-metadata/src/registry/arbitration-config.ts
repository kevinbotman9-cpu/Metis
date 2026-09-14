import type { EntityDescriptor } from '../types';

/**
 * The ranking formula's weights, declared.
 *
 * **Edited, never created, never deleted.** A tenant has exactly one arbitration
 * config, and a tenant without one has no ranking function, which publishing
 * already refuses (`UNKNOWN_UTILITY_FUNCTION`). The create copy exists because
 * the descriptor type requires it; no screen offers it, and there is no
 * `remove`.
 *
 * **Proposed, not published.** Since 2026-09-14 moving a weight on
 * `/arbitration` changes a preview of the ranking and nothing else; the form
 * raises a change set, and the weights change when somebody approves it.
 *
 * The weights were four hand-built range sliders on `/arbitration` until
 * 2026-09-13, removed because a hand-built form breaks Rule 8. They are sliders
 * again as a `presentation` the generic renderer draws, so the ranking can be
 * moved under the hand without a control this registry does not declare.
 */
export const arbitrationConfigDescriptor: EntityDescriptor = {
  entity: 'ArbitrationConfig',
  noun: { singular: 'ranking formula', plural: 'ranking formulas' },

  create: {
    title: 'Ranking formula',
    description: 'A tenant has one ranking formula. Its weights are changed through a change set, not created.',
    submitLabel: 'Raise a change set',
  },
  edit: {
    description:
      'Moving a weight changes the preview below and nothing else. Raising a change set proposes the new weights; they rank decisions once somebody approves it.',
    submitLabel: 'Raise a change set',
  },

  groups: [{ key: 'weights', label: 'Exponent weights', order: 10, columns: 2 }],

  fields: [
    {
      field: 'weights.propensity',
      type: 'number',
      label: 'Propensity weight',
      help: 'Model-predicted likelihood the customer accepts. 0 ignores it, 1 is neutral, 2 doubles its pull.',
      group: 'weights',
      order: 10,
      presentation: 'slider',
      validation: { required: true, min: 0, max: 2, step: 0.05 },
    },
    {
      field: 'weights.value',
      type: 'number',
      label: 'Value weight',
      help: 'Expected margin if accepted, normalised.',
      group: 'weights',
      order: 20,
      presentation: 'slider',
      validation: { required: true, min: 0, max: 2, step: 0.05 },
    },
    {
      field: 'weights.boost',
      type: 'number',
      label: 'Boost weight',
      help: 'Business weight. The only term people set directly.',
      group: 'weights',
      order: 30,
      presentation: 'slider',
      validation: { required: true, min: 0, max: 2, step: 0.05 },
    },
    {
      field: 'weights.context',
      type: 'number',
      label: 'Context weight',
      help: 'Channel and moment fit.',
      group: 'weights',
      order: 40,
      presentation: 'slider',
      validation: { required: true, min: 0, max: 2, step: 0.05 },
    },
  ],

  unmanaged: [
    { field: 'id', reason: 'Server-assigned; a tenant has one config and never names it.' },
    { field: 'tenantId', reason: 'The tenant comes from the URL and the session, never from the form.' },
    {
      field: 'utility',
      reason:
        'Which ranking function computes priority, and its version. Arithmetic changes are a new version, never an edit, so a person does not type one here.',
    },
    {
      field: 'formula',
      reason: 'The formula as the server renders it from the function and the weights. Read, never written.',
    },
    { field: 'updatedAt', reason: 'Server-owned; set when an approved change set applies, and read by the audit log.' },
    { field: 'updatedBy', reason: 'Server-owned; who applied the weights, never typed.' },
  ],
};
