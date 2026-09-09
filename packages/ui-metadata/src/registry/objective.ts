import type { EntityDescriptor } from '../types';

/**
 * The Objective form, declared.
 *
 * The top of the taxonomy, and the first thing a marketer creates. It had no
 * authoring surface at all until now — `PENDING` in this registry recorded it
 * as *"no authoring surface at all; the taxonomy is fixture-authored"*, which
 * meant step one of the marketer's journey needed a code change and a deploy.
 *
 * It is declared rather than hand-built because a hand-built form here would
 * have been the fifth one, and the point of this registry is that the fifth one
 * does not get written. Adding a field to an objective is an edit to the array
 * below and to the OpenAPI schema, and nothing under `apps/console/app/`.
 */
export const objectiveDescriptor: EntityDescriptor = {
  entity: 'Objective',
  noun: { singular: 'objective', plural: 'objectives' },

  create: {
    title: 'New objective',
    description:
      'What the business is trying to achieve. Categories are filed under an objective, and offers under a category.',
    submitLabel: 'Create objective',
  },
  edit: {
    description: 'Changes apply immediately and are written to the audit log.',
    submitLabel: 'Save objective',
  },

  groups: [
    { key: 'identity', order: 10, columns: 1 },
    { key: 'ordering', label: 'Ordering', order: 20, columns: 1 },
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
      field: 'key',
      type: 'text',
      label: 'Key',
      help: 'Stable for the life of the objective. Everything below it is filed under this.',
      group: 'identity',
      order: 20,
      immutableAfterCreate: true,
      suggestFrom: { field: 'name', transform: 'slug' },
      validation: {
        required: true,
        maxLength: 40,
        // Hyphens as well as underscores: the keys already in the taxonomy use
        // both, and `slug` suggests underscores, so a pattern accepting only
        // one of the two would reject either the suggestion or the fixtures.
        //
        // The hyphen is escaped because this string becomes an HTML `pattern`
        // attribute, which browsers compile with the `v` flag — and under `v`
        // an unescaped `-` at the end of a character class is a syntax error.
        // Written unescaped it compiled fine in `new RegExp(...)`, passed the
        // descriptor test, and was silently dropped by the browser, which then
        // validated nothing at all.
        pattern: '^[a-z0-9_\\-]+$',
        message: 'Lower case, digits, underscores and hyphens only.',
      },
    },
    {
      field: 'description',
      type: 'textarea',
      label: 'Description',
      help: 'What this objective is for, in the words a marketer would use.',
      group: 'identity',
      order: 30,
      validation: { maxLength: 500 },
    },
    {
      field: 'sortOrder',
      type: 'number',
      label: 'Sort order',
      help: 'Where it appears in the taxonomy. Lower comes first.',
      group: 'ordering',
      order: 10,
      validation: { min: 0, step: 1 },
    },
  ],

  unmanaged: [
    { field: 'id', reason: 'Derived from the key on creation; never edited.' },
    { field: 'createdAt', reason: 'Server-owned; set once when the objective is created.' },
    { field: 'updatedAt', reason: 'Server-owned; set on every write, and read by the audit log.' },
  ],
};
