import type { EntityDescriptor } from '../types';

/**
 * The tenant's locale and currency, declared. G-092.
 *
 * There was no tenant locale anywhere until 2026-09-13, so the console
 * formatted every date and number as British at 77 call sites, and a US tenant
 * read `05/09` as the fifth of September. This is the setting those call sites
 * now read, and the form that changes it.
 *
 * **Edited, never created.** A tenant has exactly one set of settings; the
 * create copy exists because the descriptor type requires it, and no screen
 * offers it.
 *
 * **The locale list is a convenience, not the contract.** The endpoint accepts
 * any BCP 47 tag the runtime can format in; this offers the ones a telco demo is
 * likely to be read in, so switching one is a click rather than a typed tag.
 */
export const tenantSettingsDescriptor: EntityDescriptor = {
  entity: 'TenantSettings',
  noun: { singular: 'tenant settings', plural: 'tenant settings' },

  create: {
    title: 'Tenant settings',
    description: 'A tenant has one set of settings. They are edited, not created.',
    submitLabel: 'Save settings',
  },
  edit: {
    description:
      'Every date, number and amount in the console is formatted in this locale. The change shows on the next render and is written to the audit log.',
    submitLabel: 'Save settings',
  },

  groups: [{ key: 'presentation', label: 'How this tenant reads', order: 10, columns: 2 }],

  fields: [
    {
      field: 'locale',
      type: 'select',
      label: 'Locale',
      help: 'Decides day or month first, the thousands separator and where the currency symbol goes.',
      group: 'presentation',
      order: 10,
      validation: { required: true },
      options: {
        static: [
          { value: 'en-US', label: 'English (United States)' },
          { value: 'en-GB', label: 'English (United Kingdom)' },
          { value: 'en-CA', label: 'English (Canada)' },
          { value: 'es-US', label: 'Español (Estados Unidos)' },
          { value: 'fr-FR', label: 'Français (France)' },
          { value: 'de-DE', label: 'Deutsch (Deutschland)' },
        ],
      },
    },
    {
      field: 'currency',
      type: 'select',
      label: 'Currency',
      help: 'For an amount that carries no currency of its own — performance totals, and the price of a new offer.',
      group: 'presentation',
      order: 20,
      validation: { required: true },
      options: {
        static: [
          { value: 'USD', label: 'US dollar (USD)' },
          { value: 'EUR', label: 'Euro (EUR)' },
          { value: 'GBP', label: 'Pound sterling (GBP)' },
        ],
      },
    },
  ],

  unmanaged: [
    { field: 'tenantId', reason: 'The tenant these settings belong to, fixed by the URL; never edited.' },
    { field: 'updatedAt', reason: 'Server-owned; set on every write, and read by the audit log.' },
    {
      field: 'updatedBy',
      reason: 'Server-owned, taken from the session — a client-supplied author is not evidence.',
    },
  ],
};
