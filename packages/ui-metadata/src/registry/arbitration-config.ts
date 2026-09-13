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
 * The weights were four range sliders on `/arbitration` until 2026-09-13 — a
 * hand-built form, and one whose value could only be read by dragging. They are
 * numbers with the same range and step, drawn by the generic renderer, and the
 * page still previews the formula they make as they are typed.
 */
export const arbitrationConfigDescriptor: EntityDescriptor = {
  entity: 'ArbitrationConfig',
  noun: { singular: 'ranking formula', plural: 'ranking formulas' },

  create: {
    title: 'Ranking formula',
    description: 'A tenant has one ranking formula. Its weights are published, not created.',
    submitLabel: 'Publish weights',
  },
  edit: {
    description:
      'Publishing changes how every subsequent decision is ranked, and is recorded in the audit log.',
    submitLabel: 'Publish weights',
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
      validation: { required: true, min: 0, max: 2, step: 0.05 },
    },
    {
      field: 'weights.value',
      type: 'number',
      label: 'Value weight',
      help: 'Expected margin if accepted, normalised.',
      group: 'weights',
      order: 20,
      validation: { required: true, min: 0, max: 2, step: 0.05 },
    },
    {
      field: 'weights.boost',
      type: 'number',
      label: 'Boost weight',
      help: 'Business weight. The only term people set directly.',
      group: 'weights',
      order: 30,
      validation: { required: true, min: 0, max: 2, step: 0.05 },
    },
    {
      field: 'weights.context',
      type: 'number',
      label: 'Context weight',
      help: 'Channel and moment fit.',
      group: 'weights',
      order: 40,
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
    { field: 'updatedAt', reason: 'Server-owned; set on every publish, and read by the audit log.' },
    { field: 'updatedBy', reason: 'Server-owned; the session that published, never typed.' },
  ],
};
