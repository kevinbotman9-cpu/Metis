import type { ProfileSchema } from '@metis/core/profile-schema';

/**
 * The tenant's data model.
 *
 * Reverse-engineered from what the platform already reads, not designed fresh:
 * every field below is either referenced by a fixture policy, present in the
 * decision input the console generates, or declared by a connector's
 * `provides`. Inventing a tidier model would have meant rewriting every policy
 * and moving every chain hash to describe data nobody sends.
 *
 * ## The inconsistency this exposes on its first day
 *
 * Caller-supplied fields are grouped — `customer.age`, `address.fibre_available`
 * — and connector-supplied fields are flat at the root — `marketingConsent`,
 * `creditScore`. Nothing decided that; it is what `connectorPayload` happens to
 * return spread into the input alongside the grouped objects.
 *
 * Modelled as it is rather than as it should be. The root entity holds both the
 * relationships to the grouped entities and the flat connector fields, which is
 * an honest description of the shape a decision request has today. Regrouping
 * them is a migration with a chain-hash cost, and it should be a decision
 * somebody takes deliberately rather than one smuggled in with the schema.
 *
 * ## Account and its aggregation
 *
 * `Account` is the one entity here with no data behind it yet. It is declared
 * because the shape of the model is the thing under review — a schema that
 * cannot express "this customer has three accounts, one in arrears" would have
 * to be reshaped the moment it could, and reshaping a schema after policies
 * reference it is the expensive kind of change. `accounts.worst_arrears_days`
 * resolves to nothing today and is registered in docs/gaps.md as such.
 */
export const profileSchema: ProfileSchema = {
  id: 'schema_telco_uk',
  tenantId: 'telco-uk',
  version: '1.0.0',
  root: 'DecisionInput',
  updatedAt: '2026-09-07T00:00:00.000Z',
  updatedBy: 'marcus.webb@telco.example',

  entities: [
    {
      name: 'DecisionInput',
      description:
        'What a decision request carries. Grouped objects come from the caller; the flat fields are resolved from connectors before the engine runs.',
      fields: [
        // --- conn_billing_ledger -------------------------------------------
        {
          name: 'monthlySpend',
          type: 'money',
          unit: 'pence',
          description: 'Rolling monthly spend. From the billing ledger.',
          sensitivity: 'personal',
        },
        {
          name: 'arrearsDays',
          type: 'integer',
          unit: 'days',
          description: 'Days currently in arrears. 0 when in good standing.',
          sensitivity: 'personal',
        },
        {
          name: 'inGoodStanding',
          type: 'boolean',
          description: 'Whether the billing ledger considers the account current.',
          sensitivity: 'personal',
        },
        // --- conn_network_usage --------------------------------------------
        {
          name: 'dataUsageGb',
          type: 'decimal',
          unit: 'GB',
          description: 'Data used in the current period.',
          sensitivity: 'personal',
        },
        {
          name: 'roamingDays',
          type: 'integer',
          unit: 'days',
          description: 'Days roaming in the last period.',
          sensitivity: 'personal',
        },
        {
          name: 'tenureMonths',
          type: 'integer',
          unit: 'months',
          description: 'How long the customer has been with us.',
          sensitivity: 'personal',
        },
        // --- conn_consent_registry -----------------------------------------
        {
          name: 'marketingConsent',
          type: 'boolean',
          description:
            'Marketing consent from the registry. Distinct from `consent.marketing` on the request, which is what the caller asserts.',
          sensitivity: 'personal',
        },
        {
          name: 'profilingConsent',
          type: 'boolean',
          description: 'Consent to profiling, from the registry.',
          sensitivity: 'personal',
        },
        // --- conn_credit_bureau --------------------------------------------
        {
          name: 'creditScore',
          type: 'integer',
          description: 'Bureau score. Declared by the connector; no policy reads it yet.',
          sensitivity: 'special_category',
        },
        {
          name: 'creditBand',
          type: 'string',
          description: 'Bureau band. Declared by the connector; no policy reads it yet.',
          sensitivity: 'special_category',
        },
        // --- conn_device_stock ---------------------------------------------
        {
          name: 'deviceInStock',
          type: 'boolean',
          description: 'Whether the device is available. Declared; no policy reads it yet.',
        },
      ],
      relationships: [
        { name: 'customer', entity: 'Customer', cardinality: 'one', description: 'The person deciding for.' },
        { name: 'address', entity: 'Address', cardinality: 'one', description: 'Their service address.' },
        { name: 'usage', entity: 'Usage', cardinality: 'one', description: 'Recent consumption.' },
        { name: 'contract', entity: 'Contract', cardinality: 'one', description: 'The current agreement.' },
        { name: 'events', entity: 'Events', cardinality: 'one', description: 'Recent signals worth deciding on.' },
        { name: 'device', entity: 'Device', cardinality: 'one', description: 'The handset on the account.' },
        { name: 'offer', entity: 'OfferContext', cardinality: 'one', description: 'Facts about the offer being considered.' },
      ],
    },

    {
      name: 'Customer',
      description: 'The person a decision is being made for.',
      fields: [
        { name: 'age', type: 'integer', unit: 'years', description: 'Age in whole years.', required: true, sensitivity: 'personal' },
        {
          name: 'credit_status',
          type: 'enum',
          members: ['pass', 'refer', 'fail'],
          description: 'Outcome of the internal credit check.',
          required: true,
          sensitivity: 'special_category',
        },
        {
          name: 'account_status',
          type: 'enum',
          members: ['active', 'suspended', 'closed'],
          description: 'Standing of the account.',
          required: true,
        },
        {
          name: 'current_plan',
          type: 'enum',
          members: ['none', 'standard', '5g_unlimited'],
          description: 'The plan they are on now. `none` for a prospect.',
          required: true,
        },
        {
          name: 'bill_to_income_ratio',
          type: 'decimal',
          unit: 'ratio',
          description: 'Monthly bill as a share of income. The affordability input.',
          sensitivity: 'special_category',
        },
        {
          name: 'arrears_count_12mo',
          type: 'integer',
          unit: 'count',
          description: 'Arrears events in the last twelve months.',
          sensitivity: 'personal',
        },
      ],
      relationships: [
        {
          name: 'accounts',
          entity: 'Account',
          cardinality: 'many',
          description: 'Every account held. Nothing populates this yet — see docs/gaps.md.',
        },
      ],
    },

    {
      name: 'Account',
      description:
        'One account held by a customer. Declared so the model can express a parent-child rollup; no source populates it yet.',
      fields: [
        { name: 'status', type: 'enum', members: ['active', 'suspended', 'closed'], description: 'Standing of this account.' },
        { name: 'arrears_days', type: 'integer', unit: 'days', description: 'Days this account is in arrears.', sensitivity: 'personal' },
        { name: 'balance', type: 'money', unit: 'pence', description: 'Outstanding balance.', sensitivity: 'personal' },
      ],
    },

    {
      name: 'Address',
      description: 'The service address, and what the network can deliver there.',
      fields: [
        { name: 'fibre_available', type: 'boolean', description: 'Whether full fibre can be installed.', required: true },
      ],
    },

    {
      name: 'Usage',
      description: 'Recent consumption, as a share of what was bought.',
      fields: [
        {
          name: 'pct_of_allowance_3mo_avg',
          type: 'decimal',
          unit: 'ratio',
          description: 'Mean share of the data allowance used over three months.',
        },
        {
          name: 'months_of_history',
          type: 'integer',
          unit: 'months',
          description: 'How many months of usage exist. A low value makes the average unreliable.',
        },
      ],
    },

    {
      name: 'Contract',
      description: 'The agreement currently in force.',
      fields: [
        { name: 'days_to_end', type: 'integer', unit: 'days', description: 'Days until the minimum term ends.' },
      ],
    },

    {
      name: 'Events',
      description: 'Recent signals worth deciding on.',
      fields: [
        {
          name: 'pac_requested_within_days',
          type: 'integer',
          unit: 'days',
          description: 'Days since a porting code was requested. A large value means never.',
        },
      ],
    },

    {
      name: 'Device',
      description: 'The handset on the account.',
      fields: [
        { name: 'residual_value', type: 'money', unit: 'pence', description: 'What the device is still worth.' },
      ],
    },

    {
      name: 'OfferContext',
      description:
        'Facts about the offer under consideration, supplied per decision. Not the offer catalogue — this is what changes for this customer.',
      fields: [
        {
          name: 'monthly_delta',
          type: 'money',
          unit: 'pence',
          description: 'Change to the monthly bill if accepted. Negative is a saving.',
        },
      ],
    },
  ],

  aggregations: [
    {
      produces: 'accounts.worst_arrears_days',
      description:
        'The worst arrears across every account held. Declared to fix the shape of a rollup before anything depends on it; nothing resolves it yet.',
      over: ['customer', 'accounts'],
      fn: 'max',
      field: 'arrears_days',
      type: 'integer',
    },
    {
      produces: 'accounts.active_count',
      description: 'How many accounts are currently active.',
      over: ['customer', 'accounts'],
      fn: 'count',
      where: [{ field: 'status', operator: 'eq', value: 'active' }],
      type: 'integer',
    },
  ],
};
