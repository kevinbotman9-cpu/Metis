import type { ProfileSchema } from '@metis/core/profile-schema';

/**
 * The tenant's data model, on two roots. ADR-014 §2.
 *
 * Reverse-engineered from what the platform already reads, not designed fresh:
 * every field below is either referenced by a fixture policy, present in the
 * decision input the console generates, or declared by a connector's
 * `provides`.
 *
 * ## What changed on 2026-09-11, and why it had to
 *
 * The root was `DecisionInput`: one entity modelling a request body and calling
 * it a customer. Caller-supplied fields were grouped — `customer.age`,
 * `address.fibre_available` — and connector-supplied fields were flat at the
 * root, in a different naming convention: `marketingConsent`, `creditScore`.
 * Nothing decided that; it was where `connectorPayload` happened to land. This
 * file's previous header said so and deferred the fix, because regrouping moves
 * every chain hash and that is a decision somebody takes deliberately.
 *
 * It was taken. The two vocabularies never met, so **no policy could read a
 * value any connector supplied** (G-069): the trace's source attribution
 * resolved for nothing, and the seeded decisions consumed no integration data
 * at all. Profile paths won, because the engine already resolves policy fields
 * by dotted path, the compiler already validates them against this schema, and
 * a connector already declares two names per field — `path` into its own
 * payload and `field` for where the value lands. Only the second changed
 * meaning.
 *
 * ## The two roots
 *
 * **`Customer`** holds what is true of a subject, whoever supplied it: the
 * profile fields ingestion writes and the connector fields resolved before a
 * decision. A value's origin is a property of the field, not of where it sits.
 *
 * **`Context`** holds what only the caller can know for this request. It is
 * never stored, which is what makes ADR-014 §4 — a caller may narrow a
 * decision, never widen it — checkable rather than aspirational.
 *
 * ## Origin and class
 *
 * Every field declares both. `origin` names the system responsible for the
 * value, `connector:<id>` included, which is what lets the trace say where a
 * value came from. `class` says what the field *is*: consent is handled by
 * ADR-014 §7 and contact points by §8, and neither rule should have to match on
 * a field name. Both are declared here and only `origin` is acted on yet; §7 is
 * its own slice with its own chain-hash move.
 *
 * ## Account and its aggregation
 *
 * `Account` is the one entity with no data behind it. It is declared because
 * the shape of the model is the thing under review, and reshaping a schema
 * after policies reference it is the expensive kind of change.
 * `customer.accounts.worst_arrears_days` resolves to nothing today and is
 * registered in docs/gaps.md as such.
 */
export const profileSchema: ProfileSchema = {
  id: 'schema_telco_uk',
  tenantId: 'telco-uk',
  version: '2.0.0',
  roots: {
    profile: { alias: 'customer', entity: 'Customer' },
    request: { alias: 'context', entity: 'Context' },
  },
  updatedAt: '2026-09-11T00:00:00.000Z',
  updatedBy: 'marcus.webb@telco.example',

  entities: [
    {
      name: 'Customer',
      description: 'The person a decision is being made for, and what is known about them.',
      fields: [
        // --- written by ingestion ------------------------------------------
        {
          origin: 'profile',
          class: 'attribute',
          name: 'age',
          type: 'integer',
          unit: 'years',
          description: 'Age in whole years.',
          required: true,
          sensitivity: 'personal',
        },
        {
          origin: 'profile',
          class: 'attribute',
          name: 'credit_status',
          type: 'enum',
          members: ['pass', 'refer', 'fail'],
          description:
            'Outcome of the internal credit check. Superseded for eligibility by the bureau band, which a connector supplies; kept because it is what the tenant records against the account.',
          required: true,
          sensitivity: 'special_category',
        },
        {
          origin: 'profile',
          class: 'attribute',
          name: 'account_status',
          type: 'enum',
          members: ['active', 'suspended', 'closed'],
          description: 'Standing of the account.',
          required: true,
        },
        {
          origin: 'profile',
          class: 'attribute',
          name: 'current_plan',
          type: 'enum',
          members: ['none', 'standard', '5g_unlimited'],
          description: 'The plan they are on now. `none` for a prospect.',
          required: true,
        },
        {
          origin: 'profile',
          class: 'attribute',
          name: 'bill_to_income_ratio',
          type: 'decimal',
          unit: 'ratio',
          description: 'Monthly bill as a share of income. The affordability input.',
          sensitivity: 'special_category',
        },
        {
          origin: 'profile',
          class: 'attribute',
          name: 'arrears_count_12mo',
          type: 'integer',
          unit: 'count',
          description: 'Arrears events in the last twelve months.',
          sensitivity: 'personal',
        },

        // --- resolved from conn_billing_ledger ------------------------------
        {
          origin: 'connector:conn_billing_ledger',
          class: 'attribute',
          name: 'monthly_spend',
          type: 'money',
          unit: 'pence',
          description: 'Rolling monthly spend, from the billing ledger.',
          sensitivity: 'personal',
        },
        {
          origin: 'connector:conn_billing_ledger',
          class: 'attribute',
          name: 'arrears_days',
          type: 'integer',
          unit: 'days',
          description: 'Days currently in arrears. 0 when in good standing.',
          sensitivity: 'personal',
        },
        {
          origin: 'connector:conn_billing_ledger',
          class: 'attribute',
          name: 'in_good_standing',
          type: 'boolean',
          description: 'Whether the billing ledger considers the account current.',
          sensitivity: 'personal',
        },

        // --- resolved from conn_network_usage -------------------------------
        {
          origin: 'connector:conn_network_usage',
          class: 'attribute',
          name: 'tenure_months',
          type: 'integer',
          unit: 'months',
          description: 'How long the customer has been with us.',
          sensitivity: 'personal',
        },

        // --- resolved from conn_consent_registry ----------------------------
        {
          origin: 'connector:conn_consent_registry',
          class: 'consent',
          name: 'marketing_consent',
          type: 'boolean',
          description:
            'Marketing consent as the registry holds it. Distinct from what a caller asserts on the request, which ADR-014 §7 makes narrow-only.',
          sensitivity: 'personal',
        },
        {
          origin: 'connector:conn_consent_registry',
          class: 'consent',
          name: 'profiling_consent',
          type: 'boolean',
          description: 'Consent to profiling, from the registry.',
          sensitivity: 'personal',
        },

        // --- resolved from conn_credit_bureau -------------------------------
        {
          origin: 'connector:conn_credit_bureau',
          class: 'attribute',
          name: 'credit_score',
          type: 'integer',
          description: 'Bureau score.',
          sensitivity: 'special_category',
        },
        {
          origin: 'connector:conn_credit_bureau',
          class: 'attribute',
          name: 'credit_band',
          type: 'enum',
          members: ['A', 'B', 'C', 'D', 'E'],
          description:
            'Bureau band, A best. `pol_credit_pass` reads this, which is what makes the bureau connector part of a decision rather than a declaration. Not `required`: intake reads that flag as "this ingestion file must map it", and no file supplies this — the bureau does.',
          sensitivity: 'special_category',
        },
      ],
      relationships: [
        { name: 'address', entity: 'Address', cardinality: 'one', description: 'Their service address.' },
        { name: 'usage', entity: 'Usage', cardinality: 'one', description: 'Recent consumption.' },
        { name: 'contract', entity: 'Contract', cardinality: 'one', description: 'The current agreement.' },
        { name: 'events', entity: 'Events', cardinality: 'one', description: 'Recent signals worth deciding on.' },
        { name: 'device', entity: 'Device', cardinality: 'one', description: 'The handset on the account.' },
        {
          name: 'accounts',
          entity: 'Account',
          cardinality: 'many',
          description: 'Every account held. Nothing populates this yet — see docs/gaps.md.',
        },
      ],
    },

    {
      name: 'Context',
      description:
        'What only the caller can know about this request. Never stored: a decision reads it and it is gone.',
      fields: [
        {
          origin: 'connector:conn_device_stock',
          class: 'attribute',
          name: 'device_in_stock',
          type: 'boolean',
          description:
            'Whether the device can be supplied now. Under the request rather than the subject: it is a fact about this moment, not about a person.',
        },
      ],
      relationships: [
        {
          name: 'offer',
          entity: 'OfferContext',
          cardinality: 'one',
          description: 'Facts about the offer being considered.',
        },
      ],
    },

    {
      name: 'Account',
      description:
        'One account held by a customer. Declared so the model can express a parent-child rollup; no source populates it yet.',
      fields: [
        {
          origin: 'profile',
          class: 'attribute',
          name: 'status',
          type: 'enum',
          members: ['active', 'suspended', 'closed'],
          description: 'Standing of this account.',
        },
        {
          origin: 'profile',
          class: 'attribute',
          name: 'arrears_days',
          type: 'integer',
          unit: 'days',
          description: 'Days this account is in arrears.',
          sensitivity: 'personal',
        },
        {
          origin: 'profile',
          class: 'attribute',
          name: 'balance',
          type: 'money',
          unit: 'pence',
          description: 'Outstanding balance.',
          sensitivity: 'personal',
        },
      ],
    },

    {
      name: 'Address',
      description: 'The service address, and what the network can deliver there.',
      fields: [
        {
          origin: 'profile',
          class: 'attribute',
          name: 'fibre_available',
          type: 'boolean',
          description: 'Whether full fibre can be installed.',
          required: true,
        },
      ],
    },

    {
      name: 'Usage',
      description: 'Recent consumption, as a share of what was bought.',
      fields: [
        {
          origin: 'profile',
          class: 'attribute',
          name: 'pct_of_allowance_3mo_avg',
          type: 'decimal',
          unit: 'ratio',
          description: 'Mean share of the data allowance used over three months.',
        },
        {
          origin: 'profile',
          class: 'attribute',
          name: 'months_of_history',
          type: 'integer',
          unit: 'months',
          description: 'How many months of usage exist. A low value makes the average unreliable.',
        },
        {
          origin: 'connector:conn_network_usage',
          class: 'attribute',
          name: 'data_usage_gb',
          type: 'decimal',
          unit: 'GB',
          description: 'Data used in the current period.',
          sensitivity: 'personal',
        },
        {
          origin: 'connector:conn_network_usage',
          class: 'attribute',
          name: 'roaming_days',
          type: 'integer',
          unit: 'days',
          description: 'Days roaming in the last period.',
          sensitivity: 'personal',
        },
      ],
    },

    {
      name: 'Contract',
      description: 'The agreement currently in force.',
      fields: [
        {
          origin: 'profile',
          class: 'attribute',
          name: 'days_to_end',
          type: 'integer',
          unit: 'days',
          description: 'Days until the minimum term ends.',
        },
      ],
    },

    {
      name: 'Events',
      description: 'Recent signals worth deciding on.',
      fields: [
        {
          origin: 'profile',
          class: 'attribute',
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
        {
          origin: 'profile',
          class: 'attribute',
          name: 'residual_value',
          type: 'money',
          unit: 'pence',
          description: 'What the device is still worth.',
        },
      ],
    },

    {
      name: 'OfferContext',
      description:
        'Facts about the offer under consideration, supplied per decision. Not the offer catalogue — this is what changes for this customer.',
      fields: [
        {
          origin: 'request',
          class: 'attribute',
          name: 'monthly_delta',
          type: 'money',
          unit: 'pence',
          description:
            'Change to the monthly bill if accepted. Negative is a saving. One value for the whole request: the schema has no per-candidate scope, which ADR-014 §2 records and `pol_afford_retention` still assumes it has.',
        },
      ],
    },
  ],

  aggregations: [
    {
      produces: 'customer.worst_arrears_days',
      description:
        'The worst arrears across every account held. Declared to fix the shape of a rollup before anything depends on it; nothing resolves it yet.',
      over: ['accounts'],
      fn: 'max',
      field: 'arrears_days',
      type: 'integer',
    },
    {
      produces: 'customer.active_account_count',
      description: 'How many accounts are currently active.',
      over: ['accounts'],
      fn: 'count',
      where: [{ field: 'status', operator: 'eq', value: 'active' }],
      type: 'integer',
    },
  ],
};
