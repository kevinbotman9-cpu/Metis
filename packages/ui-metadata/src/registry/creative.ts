import type { EntityDescriptor, FieldDescriptor } from '../types';

/**
 * The Creative form, declared.
 *
 * Harder than Offer in one specific way: **the fields change with the
 * channel**, because the content does. Five shapes, and a form showing the
 * union of them would ask for a deeplink on an email. The hand-built version
 * expressed that as a table of `FieldSpec` and a lookup; here it is
 * `visibleWhen` on each field, which the codec already understood — and it
 * comes with a property the old form had to remember by hand. `toPayload`
 * sends only visible fields, so switching channel cannot carry a leftover
 * subject line into an SMS. The old form did that with an explicit
 * "only the fields this channel declares" comment; now it falls out.
 *
 * **Validation is the server's.** The 160-character segment limit, the
 * carrier-legal sender id, the call to action required in pairs — those live in
 * `@metis/core` and are enforced by the endpoint. `required` is declared here
 * because the browser does it for free and it matches `REQUIRED` in
 * `packages/core/src/creative.ts`; nothing else is re-implemented, because two
 * implementations of one rule is one rule and one bug waiting.
 *
 * **`content` is an opaque bag in the spec** — `additionalProperties: true`,
 * discriminated by channel. So the drift check can hold this descriptor to
 * having a `content` entry, and cannot check the fields inside it. That is a
 * real limit and the reason the shapes in `@metis/core` are the authority for
 * what goes in there.
 */

const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'web', label: 'Web' },
  { value: 'push', label: 'Push' },
  { value: 'outbound_call', label: 'Outbound call' },
] as const;

/** Every content field is scoped to its channel and sits in the same group. */
const on = (
  channel: string,
  field: Omit<FieldDescriptor, 'group' | 'visibleWhen'>
): FieldDescriptor => ({
  ...field,
  group: 'content',
  visibleWhen: { field: 'channel', equals: channel },
});

export const creativeDescriptor: EntityDescriptor = {
  entity: 'Creative',
  noun: { singular: 'creative', plural: 'creatives' },

  create: {
    title: 'Add creative',
    description: 'The content this offer is delivered with, on one channel.',
    submitLabel: 'Add creative',
  },
  edit: {
    description: 'Changes are delivered immediately and are written to the audit log.',
    submitLabel: 'Save creative',
  },

  groups: [
    { key: 'identity', order: 10, columns: 2 },
    { key: 'content', label: 'Content', order: 20, columns: 1 },
  ],

  fields: [
    {
      field: 'name',
      type: 'text',
      label: 'Name',
      group: 'identity',
      order: 10,
      span: 2,
      validation: { required: true, maxLength: 120 },
    },
    {
      field: 'channel',
      type: 'select',
      label: 'Channel',
      help: 'What this is delivered on. Changing it changes the fields below.',
      group: 'identity',
      order: 20,
      // The content shape is the channel's. Changing it after the fact would
      // leave fields that belong to neither shape, so it is fixed once the
      // creative exists.
      immutableAfterCreate: true,
      validation: { required: true },
      options: { static: CHANNELS },
    },
    {
      field: 'locale',
      type: 'text',
      label: 'Locale',
      placeholder: 'e.g. en-GB',
      group: 'identity',
      order: 30,
      validation: { maxLength: 16 },
    },
    {
      field: 'active',
      type: 'boolean',
      label: 'Delivery',
      help: 'Only active creatives are delivered. An offer needs at least one to go active.',
      group: 'identity',
      order: 40,
      // A named state rather than a tick. This decides whether content reaches
      // customers, and an unlabelled checkbox reads as an option being turned
      // on rather than a state being chosen.
      booleanLabels: { true: 'Active', false: 'Not active' },
    },
    {
      field: 'reviewNote',
      type: 'textarea',
      label: 'Review note',
      help: 'Why this content reads the way it does — a claim substantiation, a sign-off reference. Reaches the trace.',
      group: 'identity',
      order: 50,
      span: 2,
      validation: { maxLength: 500 },
    },
    {
      // The discriminant, in both places the server checks. `content.channel`
      // must agree with `channel` or the creative is refused, and nobody should
      // be asked the same question twice.
      field: 'content.channel',
      type: 'text',
      label: 'Content channel',
      group: 'content',
      order: 0,
      derived: { from: 'channel', rule: 'copy' },
    },

    on('email', {
      field: 'content.subject',
      type: 'text',
      label: 'Subject',
      order: 10,
      validation: { required: true },
    }),
    on('email', {
      field: 'content.preheader',
      type: 'text',
      label: 'Preheader',
      help: 'The line inboxes show after the subject. Left out, they show the start of the body.',
      order: 20,
    }),
    on('email', {
      field: 'content.body',
      type: 'textarea',
      label: 'Body',
      order: 30,
      validation: { required: true },
    }),
    on('email', {
      field: 'content.fromName',
      type: 'text',
      label: 'From name',
      help: 'Left out, recipients see the address.',
      order: 40,
    }),
    on('email', {
      field: 'content.fromAddress',
      type: 'text',
      label: 'From address',
      placeholder: 'e.g. offers@example.com',
      order: 50,
      validation: { required: true },
    }),

    on('sms', {
      field: 'content.text',
      type: 'textarea',
      label: 'Message',
      help: '160 characters. Longer messages are split and billed per segment.',
      order: 10,
      // Counts past the limit rather than stopping at it: the server explains
      // the segment split, and this is the cheap half of the same information.
      counter: 160,
      validation: { required: true },
    }),
    on('sms', {
      field: 'content.senderId',
      type: 'text',
      label: 'Sender id',
      help: 'Up to 11 characters — a carrier limit.',
      order: 20,
      // No `maxLength`. The 11-character limit is the server's rule and it has
      // a message worth reading; truncating the input here would mean the
      // person never sees it and never learns why. Same reasoning as the SMS
      // counter above — say what the limit is, let the server enforce it.
      validation: { required: true },
    }),

    on('web', {
      field: 'content.headline',
      type: 'text',
      label: 'Headline',
      order: 10,
      validation: { required: true },
    }),
    on('web', { field: 'content.subheadline', type: 'text', label: 'Subheadline', order: 20 }),
    on('web', {
      field: 'content.imageUrl',
      type: 'text',
      label: 'Image reference',
      help: 'A path or URL. Nothing here stores or serves the file — see W-015.',
      placeholder: 'e.g. /assets/offers/example.jpg',
      order: 30,
    }),
    on('web', {
      field: 'content.ctaLabel',
      type: 'text',
      label: 'Call to action',
      help: 'A label and a link, or neither. The server refuses one without the other.',
      order: 40,
    }),
    on('web', {
      field: 'content.ctaUrl',
      type: 'text',
      label: 'Call to action link',
      placeholder: 'e.g. /plans/example',
      order: 50,
    }),
    on('web', {
      field: 'content.placement',
      type: 'select',
      label: 'Placement',
      help: 'The slot this is for. Left out, it can fill any slot on the channel.',
      order: 60,
      // A hero placement is not an option for an SMS, so the tenant's slots are
      // filtered by the channel above.
      options: {
        source: 'placements',
        filterBy: { optionField: 'channel', matches: 'channel' },
      },
    }),
    on('web', {
      field: 'content.placementType',
      type: 'select',
      label: 'Placement type',
      help: 'How it is designed to look — a hero, a tile, a carousel.',
      order: 70,
      // Choosing a slot suggests the shape it declares. A suggestion, not a
      // rule: somebody may deliberately put a tile in a hero while testing.
      suggestFrom: { field: 'content.placement', fromOptionField: 'type' },
      options: {
        static: [
          { value: 'carousel', label: 'Carousel' },
          { value: 'feature_band', label: 'Feature band' },
          { value: 'footer_bar', label: 'Footer bar' },
          { value: 'hero', label: 'Hero' },
          { value: 'page_takeover', label: 'Page takeover' },
          { value: 'tile', label: 'Tile' },
        ],
      },
    }),

    on('push', {
      field: 'content.title',
      type: 'text',
      label: 'Title',
      order: 10,
      validation: { required: true },
    }),
    on('push', {
      field: 'content.body',
      type: 'textarea',
      label: 'Body',
      order: 20,
      validation: { required: true },
    }),
    on('push', {
      field: 'content.deeplink',
      type: 'text',
      label: 'Deeplink',
      help: 'Left out, the notification opens the app.',
      placeholder: 'e.g. app://addons/example',
      order: 30,
    }),

    on('outbound_call', {
      field: 'content.script',
      type: 'textarea',
      label: 'Script',
      order: 10,
      validation: { required: true },
    }),
    on('outbound_call', {
      field: 'content.objectionHandling',
      type: 'textarea',
      label: 'Objection handling',
      order: 20,
    }),
  ],

  unmanaged: [
    { field: 'id', reason: 'Server-assigned on creation; never edited by a person.' },
    {
      field: 'offerId',
      reason:
        'The offer a creative belongs to is the page it is authored from, not a field — moving one between offers is not an operation the platform has.',
    },
    { field: 'createdAt', reason: 'Server-owned; set once when the creative is created.' },
    { field: 'updatedAt', reason: 'Server-owned; set on every write, and read by the audit log.' },
  ],
};
