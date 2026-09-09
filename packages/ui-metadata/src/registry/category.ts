import type { EntityDescriptor } from '../types';

/**
 * The Category form, declared.
 *
 * The second level of the taxonomy: a product or service grouping under one
 * objective. A category with no objective cannot be reached by a decision flow,
 * so the objective is required here and refused by the server as well —
 * `Catalogue.putCategory` raises `UNKNOWN_OBJECTIVE`, and the endpoint answers
 * to the same rule.
 *
 * The objective is a `select` rather than a free field for the same reason the
 * Offer form has one: a taxonomy the author can mistype is a taxonomy that
 * quietly grows a second copy of Retention.
 */
export const categoryDescriptor: EntityDescriptor = {
  entity: 'Category',
  noun: { singular: 'category', plural: 'categories' },

  create: {
    title: 'New category',
    description: 'A product or service grouping under one objective. Offers are filed under it.',
    submitLabel: 'Create category',
  },
  edit: {
    description: 'Changes apply immediately and are written to the audit log.',
    submitLabel: 'Save category',
  },

  groups: [
    { key: 'identity', order: 10, columns: 1 },
    { key: 'taxonomy', label: 'Where it sits', order: 20, columns: 1 },
    { key: 'ordering', label: 'Ordering', order: 30, columns: 1 },
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
      help: 'Stable for the life of the category. Offers are filed under this.',
      group: 'identity',
      order: 20,
      immutableAfterCreate: true,
      suggestFrom: { field: 'name', transform: 'slug' },
      validation: {
        required: true,
        maxLength: 40,
        // Escaped hyphen: see the same field on the Objective descriptor.
        pattern: '^[a-z0-9_\\-]+$',
        message: 'Lower case, digits, underscores and hyphens only.',
      },
    },
    {
      field: 'description',
      type: 'textarea',
      label: 'Description',
      group: 'identity',
      order: 30,
      validation: { maxLength: 500 },
    },

    {
      field: 'objectiveId',
      type: 'select',
      label: 'Objective',
      help: 'A category outside the taxonomy cannot be reached by a decision flow.',
      group: 'taxonomy',
      order: 10,
      validation: { required: true },
      options: { source: 'taxonomy.objectives' },
    },

    {
      field: 'sortOrder',
      type: 'number',
      label: 'Sort order',
      help: 'Where it appears under its objective. Lower comes first.',
      group: 'ordering',
      order: 10,
      validation: { min: 0, step: 1 },
    },
  ],

  unmanaged: [
    { field: 'id', reason: 'Derived from the key on creation; never edited.' },
    { field: 'createdAt', reason: 'Server-owned; set once when the category is created.' },
    { field: 'updatedAt', reason: 'Server-owned; set on every write, and read by the audit log.' },
  ],
};
