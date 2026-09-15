import type { EntityDescriptor } from '../types';

/**
 * The Model form, declared. ADR-009 §4.
 *
 * What is being filled in is a published version, not a record somebody keeps
 * editing: a version is bound to its content and cannot change. So there is no
 * delete, and "edit" means publishing what the form holds under the version it
 * names — the same content under the same version is a no-op, and different
 * content under it is refused on the Version field, with the remedy.
 *
 * **Features are picked, never typed.** Each is a path from the data model with
 * the data model's type beside it, so a declaration cannot disagree with the
 * data model about a type — the mismatch the compiler refuses as
 * `MODEL_FEATURE_TYPE`.
 */
export const modelDescriptor: EntityDescriptor = {
  entity: 'Model',
  noun: { singular: 'model version', plural: 'model versions' },

  create: {
    title: 'New model version',
    description:
      'A scorer a flow can pin. Publishing changes no decision: it makes the version something a flow can name, and a flow that names it is budgeted for what it declares.',
    submitLabel: 'Publish version',
  },
  edit: {
    description:
      'A published version cannot change. What is here is published under the version named below, so give a change a new version.',
    submitLabel: 'Publish as new version',
  },

  groups: [
    { key: 'identity', order: 10, columns: 2 },
    { key: 'contract', label: 'What it declares', order: 20, columns: 2 },
    { key: 'features', label: 'What it reads', order: 30, columns: 1 },
    { key: 'provenance', label: 'Where it came from', order: 40, columns: 2 },
  ],

  fields: [
    {
      field: 'name',
      type: 'text',
      label: 'Name',
      group: 'identity',
      order: 10,
      validation: { required: true, maxLength: 120 },
    },
    {
      field: 'id',
      type: 'text',
      label: 'Model id',
      help: 'What a score node names. Stable across every version of this model.',
      group: 'identity',
      order: 20,
      immutableAfterCreate: true,
      suggestFrom: { field: 'name', transform: 'slug' },
      validation: {
        required: true,
        maxLength: 60,
        // Escaped hyphen, for the `v` flag a browser compiles `pattern` with.
        pattern: '^[a-z0-9][a-z0-9_\\-]*$',
        message: 'Lower case letters, digits, underscores and hyphens, starting with a letter or digit.',
      },
    },
    {
      field: 'version',
      type: 'text',
      label: 'Version',
      help: 'An exact version such as 4.2.0. A floating version would change the answer on replay.',
      group: 'identity',
      order: 30,
      placeholder: '1.0.0',
      validation: { required: true, maxLength: 20, pattern: '^\\d+\\.\\d+\\.\\d+$', message: 'An exact version, such as 4.2.0.' },
    },
    {
      field: 'description',
      type: 'textarea',
      label: 'Description',
      help: 'What it predicts, and for which offers.',
      group: 'identity',
      order: 40,
      span: 2,
      validation: { maxLength: 500 },
    },

    {
      field: 'kind',
      type: 'select',
      label: 'Kind',
      help: 'A score node reads a propensity. A flow pinning another kind does not compile.',
      group: 'contract',
      order: 10,
      validation: { required: true },
      options: {
        static: [
          { value: 'propensity', label: 'Propensity — how likely the customer is to accept', short: 'Propensity' },
          { value: 'value', label: 'Value — what an acceptance is worth', short: 'Value' },
          { value: 'ranking', label: 'Ranking — an order, not a probability', short: 'Ranking' },
        ],
      },
    },
    {
      field: 'declaredP95Ms',
      type: 'number',
      label: 'Declared p95 (ms)',
      help: 'Declared, not measured. It joins the critical path of every flow that pins this version.',
      group: 'contract',
      order: 20,
      validation: { required: true, min: 0.1, step: 0.1 },
    },

    {
      field: 'features',
      type: 'features',
      label: 'Features',
      help: 'Every input the model reads, from the data model. None means it reads nothing a person could be erased from.',
      group: 'features',
      order: 10,
      options: { source: 'profile.paths' },
    },

    {
      field: 'owner',
      type: 'text',
      label: 'Owner',
      help: 'Who answers for this scorer. Erasure obligations attach to whoever trained it.',
      group: 'provenance',
      order: 10,
      validation: { required: true, maxLength: 120 },
    },
    {
      field: 'trainedThrough',
      type: 'date',
      label: 'Trained through',
      help: 'The last date of the training data. Declared, not verified — it is what makes an erasure request answerable.',
      group: 'provenance',
      order: 20,
      validation: { required: true },
    },
    {
      field: 'weightsHash',
      type: 'text',
      label: 'Weights hash',
      help: 'sha256 of the serialised weights. The platform never reads a model’s internals, so this is how a version names its weights.',
      group: 'provenance',
      order: 30,
      span: 2,
      validation: { required: true, pattern: '^[0-9a-f]{64}$', message: '64 lower-case hexadecimal characters.' },
    },
  ],

  unmanaged: [
    { field: 'tenantId', reason: 'Server-owned: the tenant the session belongs to, never one a form names.' },
    { field: 'publishedAt', reason: 'Server-owned; stamped once, when the version is first published.' },
    {
      field: 'publishedBy',
      reason: 'Server-owned, taken from the session — a client-supplied author is not evidence.',
    },
  ],
};
