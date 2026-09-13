import type { EntityDescriptor } from '../types';

/**
 * The targeting policy form, declared.
 *
 * Hand-built in `components/policy-form-dialog.tsx` until 2026-09-13, which made
 * the entity that decides who is offered what the one entity where adding a
 * field meant a change under `apps/console/`. It took a field type the
 * vocabulary did not have: `conditions`, because the server refuses a policy
 * with none, so a form without them could not create a policy at all
 * (ADR-006, amended).
 *
 * **The field is a list, never a text box.** The editor offers the paths the
 * data model declares and, for each, only the operators its type admits — the
 * defects the hand-built form existed to make unwritable (`passed` for `pass`,
 * `contains` on a number) stay unwritable.
 *
 * **Scope is not asked.** Every policy authored in the console has been
 * tenant-wide; no screen scopes one to an objective, a category or an offer.
 * The write sends the tenant scope for a new policy and keeps an existing
 * policy's own, which is what the hand-built form did.
 */
export const targetingPolicyDescriptor: EntityDescriptor = {
  entity: 'TargetingPolicy',
  noun: { singular: 'targeting policy', plural: 'targeting policies' },

  create: {
    title: 'New targeting policy',
    description: 'Conditions are checked against the data model before this is saved.',
    submitLabel: 'Create policy',
  },
  edit: {
    description: 'Conditions are checked against the data model before this is saved.',
    submitLabel: 'Save policy',
  },
  remove: {
    title: 'Delete this policy?',
    description:
      'It stops applying from the next decision and cannot be restored. A policy an offer is bound to is refused: deactivate that one instead, which keeps it and stops applying it.',
    confirmLabel: 'Delete policy',
  },

  groups: [
    { key: 'identity', order: 10, columns: 2 },
    { key: 'rule', label: 'Conditions — all must hold', order: 20, columns: 1 },
    { key: 'state', order: 30, columns: 1 },
  ],

  fields: [
    {
      field: 'name',
      type: 'text',
      label: 'Name',
      placeholder: 'e.g. Adults only',
      group: 'identity',
      order: 10,
      validation: { required: true, maxLength: 120 },
    },
    {
      field: 'kind',
      type: 'select',
      label: 'Tier',
      help: 'Which question the policy answers. The trace records the tier that removed a candidate.',
      group: 'identity',
      order: 20,
      validation: { required: true },
      options: {
        static: [
          { value: 'eligibility', label: 'Eligibility — can we offer this at all?', short: 'Eligibility' },
          { value: 'relevance', label: 'Relevance — should we offer it now?', short: 'Relevance' },
          { value: 'suitability', label: 'Suitability — is it right for this customer?', short: 'Suitability' },
        ],
      },
    },
    {
      field: 'description',
      type: 'text',
      label: 'Description',
      placeholder: 'e.g. Regulatory minimum age for a credit agreement',
      group: 'identity',
      order: 30,
      span: 2,
      validation: { maxLength: 300 },
    },
    {
      field: 'conditions',
      type: 'conditions',
      label: 'Conditions',
      help: 'Each names a path in the data model. A condition naming a path that does not exist would fail every comparison, so the editor offers only the paths that do.',
      group: 'rule',
      order: 10,
      validation: { required: true },
      options: { source: 'profile.paths' },
    },
    {
      field: 'active',
      type: 'boolean',
      label: 'State',
      help: 'An inactive policy is stored and not applied.',
      group: 'state',
      order: 10,
      booleanLabels: { true: 'Applied to decisions', false: 'Stored, not applied' },
    },
  ],

  unmanaged: [
    { field: 'id', reason: 'Server-assigned on creation; never edited by a person.' },
    {
      field: 'scope',
      reason:
        'No screen scopes a policy yet. The write sends the tenant scope for a new policy and keeps an existing policy’s own.',
    },
    { field: 'createdAt', reason: 'Server-owned; set once when the policy is created.' },
    { field: 'updatedAt', reason: 'Server-owned; set on every write, and read by the audit log.' },
  ],
};
