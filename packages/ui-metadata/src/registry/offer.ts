import type { EntityDescriptor } from '../types';

/**
 * The Offer form, declared.
 *
 * This replaces a 280-line hand-built dialog. Everything the dialog did is
 * here as data: the objective/category dependency, money in major units, the
 * key that suggests itself from the name and then locks, the term that decides
 * `oneOff`.
 *
 * **Status is not a field.** Creating an offer produces a draft, and
 * activation is refused until it has an active creative — so a status control
 * here would offer a choice the server refuses. It lives on the detail page
 * beside the creatives, which is where the reason is visible.
 */
export const offerDescriptor: EntityDescriptor = {
  entity: 'Offer',
  noun: { singular: 'offer', plural: 'offers' },
  moneyCurrencyDefault: 'GBP',

  create: {
    title: 'New offer',
    description: 'A new offer starts as a draft. It can go active once it has a creative.',
    submitLabel: 'Create offer',
  },
  edit: {
    description: 'Changes apply immediately and are written to the audit log.',
    submitLabel: 'Save offer',
  },

  groups: [
    { key: 'identity', order: 10, columns: 1 },
    { key: 'taxonomy', label: 'Where it sits', order: 20, columns: 2 },
    { key: 'commercials', label: 'Commercials', order: 30, columns: 3 },
    { key: 'ranking', label: 'Ranking and labelling', order: 40, columns: 3 },
    { key: 'governance', label: 'Governance', order: 50, columns: 1 },
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
      help: 'The action a decision names. Stable for the life of the offer.',
      group: 'identity',
      order: 20,
      immutableAfterCreate: true,
      suggestFrom: { field: 'name', transform: 'slug' },
      validation: {
        required: true,
        maxLength: 40,
        pattern: '^[a-z0-9_]+$',
        message: 'Lower case, digits and underscores only.',
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
      group: 'taxonomy',
      order: 10,
      validation: { required: true },
      options: { source: 'taxonomy.objectives' },
    },
    {
      field: 'categoryId',
      type: 'select',
      label: 'Category',
      group: 'taxonomy',
      order: 20,
      validation: { required: true },
      // The dependency the hand-built form expressed as a disabled attribute
      // and a filtered array. Both are declared here now.
      enabledWhen: { field: 'objectiveId', isSet: true },
      options: {
        source: 'taxonomy.categories',
        filterBy: { optionField: 'objectiveId', matches: 'objectiveId' },
      },
    },

    {
      field: 'financials.price',
      type: 'money',
      label: 'Price / month',
      group: 'commercials',
      order: 10,
      validation: { min: 0, step: 0.01 },
    },
    {
      field: 'financials.cost',
      type: 'money',
      label: 'Cost to serve',
      group: 'commercials',
      order: 20,
      validation: { min: 0, step: 0.01 },
    },
    {
      field: 'financials.expectedMargin',
      type: 'money',
      label: 'Expected margin',
      help: 'Over the term. Ranking reads this.',
      group: 'commercials',
      order: 30,
      validation: { min: 0, step: 0.01 },
    },
    {
      field: 'financials.termMonths',
      type: 'number',
      label: 'Term (months)',
      help: '0 for one-off.',
      group: 'ranking',
      order: 10,
      validation: { min: 0, step: 1 },
    },
    {
      field: 'financials.oneOff',
      type: 'boolean',
      label: 'One-off',
      group: 'ranking',
      order: 15,
      derived: { from: 'financials.termMonths', rule: 'isZero' },
    },
    {
      field: 'boost',
      type: 'number',
      label: 'Boost',
      help: '1.0 is neutral.',
      group: 'ranking',
      order: 20,
      validation: { min: 0, step: 0.05 },
    },
    {
      field: 'tags',
      type: 'tags',
      label: 'Tags',
      help: 'Comma separated.',
      group: 'ranking',
      order: 30,
    },

    {
      field: 'contractUrl',
      type: 'text',
      label: 'Contract terms',
      help: 'Link to the terms this offer commits the customer to.',
      placeholder: 'https://…',
      group: 'governance',
      order: 10,
      validation: {
        maxLength: 300,
        pattern: 'https://.+',
        message: 'A full https:// link.',
      },
    },
  ],

  unmanaged: [
    { field: 'id', reason: 'Derived from the key on creation; never edited.' },
    {
      field: 'status',
      reason:
        'Activation is refused until the offer has an active creative, so the control lives on the detail page beside the creatives, where the reason is visible.',
    },
    {
      field: 'validity',
      reason:
        'Effective dating is the Schedule screen, which sets it across every catalogue entity at once. W-015.',
    },
    {
      field: 'policyIds',
      reason: 'Attached from the targeting policy, which owns the relationship.',
    },
    {
      field: 'creativeIds',
      reason: 'Managed by Add creative on the detail page; an offer cannot conjure content here.',
    },
    { field: 'createdAt', reason: 'Server-owned; set once when the offer is created.' },
    { field: 'updatedAt', reason: 'Server-owned; set on every write, and read by the audit log.' },
    {
      field: 'updatedBy',
      reason: 'Server-owned, taken from the session — a client-supplied author is not evidence.',
    },
  ],
};
