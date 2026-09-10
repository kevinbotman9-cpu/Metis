import type { EntityDescriptor } from '../types';

/**
 * The Placement form, declared.
 *
 * A placement is where the two questions ADR-013 separates are actually
 * answered: whether the platform decides for this slot, and whether anything
 * delivers what it decides. Until 2026-09-10 both were one boolean called
 * `active`, and neither could be set from anywhere — placements were
 * fixture-authored, so every one of those decisions meant editing TypeScript
 * and redeploying. Three of the five slots the seeded corpus decides for were
 * not in the registry at all.
 *
 * **`delivery` is a select over two modes plus none, not a checkbox.** A
 * boolean could say whether something delivers and not what — and `caller`
 * (whoever asked renders it, which is what the storefront does for web) and
 * `adapter` (the platform sends it) are different enough that a slot has to
 * name which.
 */
export const placementDescriptor: EntityDescriptor = {
  entity: 'Placement',
  noun: { singular: 'placement', plural: 'placements' },

  create: {
    title: 'New placement',
    description:
      'A slot the platform decides for. A new one decides and delivers nothing until somebody says what carries it.',
    submitLabel: 'Create placement',
  },
  edit: {
    description: 'Changes apply immediately and are written to the audit log.',
    submitLabel: 'Save placement',
  },

  groups: [
    { key: 'identity', order: 10, columns: 1 },
    { key: 'slot', label: 'The slot', order: 20, columns: 2 },
    { key: 'delivery', label: 'Deciding and delivering', order: 30, columns: 1 },
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
      help: 'What a decision request carries and a creative names. Stable for the life of the slot.',
      group: 'identity',
      order: 20,
      immutableAfterCreate: true,
      suggestFrom: { field: 'name', transform: 'slug' },
      validation: {
        required: true,
        maxLength: 40,
        // Escaped hyphen: this becomes an HTML `pattern`, which browsers
        // compile with the `v` flag where an unescaped `-` at the end of a
        // character class is a syntax error and the attribute is dropped.
        pattern: '^[a-z0-9_\\-]+$',
        message: 'Lower case, digits, underscores and hyphens only.',
      },
    },
    {
      field: 'description',
      type: 'textarea',
      label: 'Description',
      help: 'Where this slot is and who sees it.',
      group: 'identity',
      order: 30,
      validation: { maxLength: 500 },
    },

    {
      field: 'channel',
      type: 'select',
      label: 'Channel',
      group: 'slot',
      order: 10,
      immutableAfterCreate: true,
      validation: { required: true },
      options: {
        static: [
          { value: 'web', label: 'Web' },
          { value: 'email', label: 'Email' },
          { value: 'sms', label: 'SMS' },
          { value: 'push', label: 'Push' },
          { value: 'outbound_call', label: 'Outbound call' },
        ],
      },
    },
    {
      field: 'artifactId',
      type: 'select',
      label: 'Decision flow',
      help: 'Which flow answers for this slot. A caller names a slot, never a flow.',
      group: 'slot',
      order: 20,
      validation: { required: true },
      options: { source: 'flows' },
    },
    {
      field: 'slotCount',
      type: 'number',
      label: 'Slots',
      help: 'At most this many actions. A hero is 1, a grid is 3.',
      group: 'slot',
      order: 30,
      validation: { min: 1, step: 1 },
    },
    {
      field: 'type',
      type: 'select',
      label: 'Shape',
      help: 'Web only — a hero and a tile are different designs, and a creative declares which it was made for.',
      group: 'slot',
      order: 40,
      // An email placement has no equivalent, so it carries none rather than a
      // value that means nothing.
      visibleWhen: { field: 'channel', equals: 'web' },
      options: {
        static: [
          { value: 'hero', label: 'Hero' },
          { value: 'tile', label: 'Tile' },
          { value: 'feature_band', label: 'Feature band' },
          { value: 'carousel', label: 'Carousel' },
          { value: 'footer_bar', label: 'Footer bar' },
          { value: 'page_takeover', label: 'Page takeover' },
        ],
      },
    },

    {
      field: 'decidable',
      type: 'boolean',
      label: 'Decide for this slot',
      help: 'When off, a request for it is refused. Nothing to do with whether anything delivers the result.',
      group: 'delivery',
      order: 10,
      // A state somebody is choosing, not a tick they are turning on. The same
      // reasoning `booleanLabels` was added for, and it applies harder here:
      // this is the field that used to mean two things.
      booleanLabels: { true: 'Decides', false: 'Refuses requests' },
    },
    {
      field: 'delivery.mode',
      type: 'select',
      label: 'Delivered by',
      help: 'Nothing is the honest answer for a slot with no far end, and four of this tenant’s five channels are in that state.',
      group: 'delivery',
      order: 20,
      options: {
        static: [
          { value: '', label: 'Nothing — decides, and nobody sends it' },
          { value: 'caller', label: 'Whoever asked, rendering the slate' },
          { value: 'adapter', label: 'The platform, through an adapter' },
        ],
      },
    },
    {
      field: 'delivery.adapterId',
      type: 'text',
      label: 'Adapter',
      help: 'No adapter exists yet — W-017, blocked on W-008 because no recipient address exists in the profile schema.',
      group: 'delivery',
      order: 30,
      visibleWhen: { field: 'delivery.mode', equals: 'adapter' },
      validation: { maxLength: 60 },
    },
  ],

  unmanaged: [
    { field: 'id', reason: 'Derived from the key on creation; never edited.' },
    { field: 'updatedAt', reason: 'Server-owned; set on every write, and read by the audit log.' },
    {
      field: 'updatedBy',
      reason: 'Server-owned, taken from the session — a client-supplied author is not evidence.',
    },
  ],
};
