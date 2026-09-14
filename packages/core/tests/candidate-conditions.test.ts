import { describe, it, expect } from 'vitest';
import {
  resolveField,
  listFieldPaths,
  conditionProblems,
  schemaProblems,
  typeOf,
  type ProfileSchema,
} from '../src/profile-schema';
import { isPathValue, isCandidatePath } from '../src/domain';

/**
 * A condition can read the candidate it is judging, and compare it with another
 * field. ADR-017, G-075.
 *
 * Before this, every condition read the request: a policy gave the same answer
 * for every offer in a decision, so a rule about the offer — does this one lower
 * this customer's bill — could not be written, and the one a tenant once wrote
 * decided every retention offer on a single request-level number.
 */

const schema: ProfileSchema = {
  id: 'schema_candidate',
  tenantId: 't',
  version: '1.0.0',
  roots: {
    profile: { alias: 'customer', entity: 'Customer' },
    request: { alias: 'context', entity: 'Context' },
    candidate: { alias: 'offer', entity: 'Offer' },
  },
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'test',
  entities: [
    {
      name: 'Customer',
      description: '',
      fields: [
        { origin: 'connector:conn_billing', class: 'attribute', name: 'monthly_spend', type: 'money', description: '' },
        { origin: 'profile', class: 'attribute', name: 'tenure_months', type: 'integer', description: '' },
        { origin: 'profile', class: 'attribute', name: 'score', type: 'decimal', description: '' },
        { origin: 'profile', class: 'attribute', name: 'plan', type: 'enum', members: ['none', 'standard'], description: '' },
      ],
    },
    {
      name: 'Context',
      description: '',
      fields: [
        { origin: 'request', class: 'attribute', name: 'plan_wanted', type: 'enum', members: ['standard', 'none'], description: '' },
        { origin: 'request', class: 'attribute', name: 'tier', type: 'enum', members: ['gold', 'silver'], description: '' },
      ],
      // A relationship named `offer` under another root is a different path,
      // `context.offer.*`, and must stay one.
      relationships: [{ name: 'offer', entity: 'OfferContext', cardinality: 'one', description: '' }],
    },
    {
      name: 'OfferContext',
      description: '',
      fields: [{ origin: 'request', class: 'attribute', name: 'monthly_delta', type: 'money', description: '' }],
    },
    {
      name: 'Offer',
      description: 'The candidate being judged.',
      fields: [
        { origin: 'catalogue', class: 'attribute', name: 'boost', type: 'decimal', description: '' },
      ],
      relationships: [{ name: 'financials', entity: 'OfferFinancials', cardinality: 'one', description: '' }],
    },
    {
      name: 'OfferFinancials',
      description: '',
      fields: [{ origin: 'catalogue', class: 'attribute', name: 'termMonths', type: 'integer', description: '' }],
      relationships: [{ name: 'price', entity: 'Money', cardinality: 'one', description: '' }],
    },
    {
      name: 'Money',
      description: '',
      fields: [{ origin: 'catalogue', class: 'attribute', name: 'amount', type: 'money', description: '' }],
    },
  ],
  aggregations: [],
};

const lowersTheBill = {
  field: 'offer.financials.price.amount',
  operator: 'lt' as const,
  value: { path: 'customer.monthly_spend' },
};

describe('the candidate root', () => {
  it('resolves a path through the candidate to a typed field', () => {
    const r = resolveField(schema, 'offer.financials.price.amount');
    expect(r?.kind).toBe('field');
    expect(typeOf(r!)).toBe('money');
  });

  it('offers candidate paths in the picker beside the others', () => {
    const paths = listFieldPaths(schema).map((r) => r.path);
    expect(paths).toContain('offer.financials.price.amount');
    expect(paths).toContain('offer.financials.termMonths');
    expect(paths).toContain('customer.monthly_spend');
  });

  it('leaves a relationship called offer under another root where it was', () => {
    expect(resolveField(schema, 'context.offer.monthly_delta')?.kind).toBe('field');
    expect(isCandidatePath('context.offer.monthly_delta')).toBe(false);
    expect(isCandidatePath('offer.financials.price.amount')).toBe(true);
  });

  it('does not exist in a schema that declares no candidate root', () => {
    const { candidate: _omitted, ...roots } = schema.roots;
    const without = { ...schema, roots };
    const problems = conditionProblems(without, { field: 'offer.boost', operator: 'gt', value: 1 });
    expect(problems.map((p) => p.code)).toEqual(['UNKNOWN_FIELD']);
  });
});

describe('a value that names another field', () => {
  it('accepts money compared with money — the case G-075 exists for', () => {
    expect(conditionProblems(schema, lowersTheBill)).toEqual([]);
  });

  it('accepts an integer compared with a decimal', () => {
    expect(
      conditionProblems(schema, { field: 'offer.financials.termMonths', operator: 'lte', value: { path: 'customer.score' } })
    ).toEqual([]);
  });

  it('refuses money compared with a plain number, so pence never meet a ratio unnoticed', () => {
    const problems = conditionProblems(schema, {
      field: 'offer.financials.price.amount',
      operator: 'lt',
      value: { path: 'customer.tenure_months' },
    });
    expect(problems.map((p) => p.code)).toEqual(['VALUE_TYPE']);
    expect(problems[0].message).toContain("'offer.financials.price.amount' is money and 'customer.tenure_months' is integer");
  });

  it('refuses a path that does not exist, and suggests the near miss', () => {
    const problems = conditionProblems(schema, { ...lowersTheBill, value: { path: 'customer.monthly_spnd' } });
    expect(problems.map((p) => p.code)).toEqual(['UNKNOWN_FIELD']);
    expect(problems[0].message).toContain("Did you mean 'customer.monthly_spend'?");
  });

  it('refuses a path value with an operator that has no meaning for two fields', () => {
    for (const operator of ['in', 'not_in', 'exists', 'not_exists'] as const) {
      const problems = conditionProblems(schema, { ...lowersTheBill, operator });
      expect(problems.map((p) => p.code), operator).toContain('VALUE_TYPE');
    }
  });

  it('compares enums only when they declare the same members', () => {
    expect(
      conditionProblems(schema, { field: 'customer.plan', operator: 'eq', value: { path: 'context.plan_wanted' } })
    ).toEqual([]);
    expect(
      conditionProblems(schema, { field: 'customer.plan', operator: 'eq', value: { path: 'context.tier' } }).map((p) => p.code)
    ).toEqual(['VALUE_TYPE']);
  });

  it('treats anything but exactly { path: string } as a literal', () => {
    expect(isPathValue({ path: 'customer.monthly_spend' })).toBe(true);
    expect(isPathValue({ path: 'customer.monthly_spend', extra: 1 })).toBe(false);
    expect(isPathValue({ path: 3 })).toBe(false);
    expect(isPathValue(['path'])).toBe(false);
    expect(isPathValue(null)).toBe(false);
    expect(isPathValue('customer.monthly_spend')).toBe(false);
  });
});

describe('the schema rules the engines rely on', () => {
  it('passes a coherent schema with a candidate root', () => {
    expect(schemaProblems(schema)).toEqual([]);
  });

  it('refuses a candidate root not addressed by offer, since the engines read the prefix alone', () => {
    const renamed = { ...schema, roots: { ...schema.roots, candidate: { alias: 'product', entity: 'Offer' } } };
    expect(schemaProblems(renamed)).toContain("The candidate root must be addressed by 'offer', not 'product'.");
  });

  it('refuses another root that takes the offer prefix', () => {
    const { candidate: _omitted, ...roots } = schema.roots;
    const clash = { ...schema, roots: { ...roots, request: { alias: 'offer', entity: 'Context' } } };
    expect(schemaProblems(clash)).toContain("The request root is addressed by 'offer', which is reserved for the candidate.");
  });

  it('refuses a catalogue field outside the candidate, and any other origin inside it', () => {
    const misplaced: ProfileSchema = {
      ...schema,
      entities: schema.entities.map((e) => {
        if (e.name === 'Customer') {
          return { ...e, fields: [...e.fields, { origin: 'catalogue' as const, class: 'attribute' as const, name: 'price', type: 'money' as const, description: '' }] };
        }
        if (e.name === 'Offer') {
          return { ...e, fields: [...e.fields, { origin: 'request' as const, class: 'attribute' as const, name: 'note', type: 'string' as const, description: '' }] };
        }
        return e;
      }),
    };
    const problems = schemaProblems(misplaced);
    expect(problems).toContain("Customer.price declares origin 'catalogue' outside the candidate root.");
    expect(problems).toContain("Offer.note is under the candidate root and declares origin 'request', not 'catalogue'.");
  });
});
