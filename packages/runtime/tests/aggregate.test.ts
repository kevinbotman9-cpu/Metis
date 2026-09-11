import { describe, it, expect } from 'vitest';
import { resolveAggregations, mergeAggregations } from '../src/integration/aggregate';
import type { ProfileSchema, SchemaAggregation } from '@metis/core/profile-schema';

/**
 * Rollups over child records.
 *
 * The property under test throughout is that an *absent* collection produces no
 * value, and an *empty* one produces zero. They look identical in the input and
 * mean opposite things: `accounts.active_count < 2` is true for a customer with
 * no accounts and must not be true for a customer whose accounts nobody loaded.
 * Getting that backwards fails open on exactly the gates that exist to fail
 * closed.
 */

const schema = (aggregations: SchemaAggregation[]): ProfileSchema => ({
  id: 's',
  tenantId: 't',
  version: '1.0.0',
  roots: {
    profile: { alias: 'customer', entity: 'Customer' },
    request: { alias: 'context', entity: 'Context' },
  },
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'test',
  entities: [],
  aggregations,
});

const WORST: SchemaAggregation = {
  produces: 'customer.worst_arrears_days',
  description: '',
  over: ['accounts'],
  fn: 'max',
  field: 'arrears_days',
  type: 'integer',
};

const ACTIVE_COUNT: SchemaAggregation = {
  produces: 'customer.active_account_count',
  description: '',
  over: ['accounts'],
  fn: 'count',
  where: [{ field: 'status', operator: 'eq', value: 'active' }],
  type: 'integer',
};

const withAccounts = (accounts: unknown) => ({ customer: { age: 40, accounts } });

describe('computing a rollup', () => {
  it('maxes a field across the children', () => {
    const { values } = resolveAggregations(
      schema([WORST]),
      withAccounts([{ arrears_days: 0 }, { arrears_days: 34 }, { arrears_days: 12 }])
    );
    expect(values['customer.worst_arrears_days']).toBe(34);
  });

  it('counts only the children the filter admits', () => {
    const { values } = resolveAggregations(
      schema([ACTIVE_COUNT]),
      withAccounts([{ status: 'active' }, { status: 'closed' }, { status: 'active' }])
    );
    expect(values['customer.active_account_count']).toBe(2);
  });

  it('filters by the same comparison a policy would use', () => {
    // The filter and a policy condition are one implementation. Two would
    // eventually disagree, and a rollup that counted a record a policy
    // rejects is a number nobody can explain.
    const { values } = resolveAggregations(
      schema([
        { ...ACTIVE_COUNT, where: [{ field: 'arrears_days', operator: 'gt', value: 30 }] },
      ]),
      withAccounts([{ arrears_days: 31 }, { arrears_days: 30 }, { arrears_days: 90 }])
    );
    expect(values['customer.active_account_count']).toBe(2);
  });

  it('sums, mins and maxes', () => {
    const fns = ['sum', 'min', 'max'] as const;
    const results = fns.map(
      (fn) =>
        resolveAggregations(
          schema([{ ...WORST, fn, produces: fn }]),
          withAccounts([{ arrears_days: 5 }, { arrears_days: 15 }])
        ).values[fn]
    );
    expect(results).toEqual([20, 5, 15]);
  });

  it('answers any and all over truthiness', () => {
    const rows = [{ flag: true }, { flag: false }];
    const any = resolveAggregations(
      schema([{ ...WORST, fn: 'any', field: 'flag', produces: 'any', type: 'boolean' }]),
      withAccounts(rows)
    ).values['any'];
    const all = resolveAggregations(
      schema([{ ...WORST, fn: 'all', field: 'flag', produces: 'all', type: 'boolean' }]),
      withAccounts(rows)
    ).values['all'];

    expect(any).toBe(true);
    expect(all).toBe(false);
  });
});

describe('absent is not zero', () => {
  it('produces nothing when the collection is absent, and says why', () => {
    // The failure this prevents: `active_count` of 0 would make
    // `active_count < 2` true, and the offer would go to somebody whose
    // accounts were never loaded.
    const { values, unresolved } = resolveAggregations(schema([ACTIVE_COUNT]), {
      customer: { age: 40 },
    });

    expect(values).toEqual({});
    expect(unresolved).toEqual([
      { produces: 'customer.active_account_count', reason: "no 'customer.accounts' in the input" },
    ]);
  });

  it('produces zero when the collection is empty', () => {
    // A customer with no accounts is a fact, not a gap, and counts as zero.
    const { values, unresolved } = resolveAggregations(schema([ACTIVE_COUNT]), withAccounts([]));
    expect(values['customer.active_account_count']).toBe(0);
    expect(unresolved).toEqual([]);
  });

  it('has no maximum over an empty collection', () => {
    // Zero would be a value nobody has. `sum` of nothing is legitimately 0;
    // `max` of nothing is not.
    const { values, unresolved } = resolveAggregations(schema([WORST]), withAccounts([]));
    expect(values).toEqual({});
    expect(unresolved[0].reason).toBe('no records to aggregate');
  });

  it('refuses the whole rollup rather than aggregating the well-formed subset', () => {
    // Skipping the bad rows would give a confident number computed from part
    // of the data, which is worse than no number.
    const { values, unresolved } = resolveAggregations(
      schema([WORST]),
      withAccounts([{ arrears_days: 10 }, { arrears_days: 'thirty' }])
    );
    expect(values).toEqual({});
    expect(unresolved[0].reason).toContain('not a number on every record');
  });

  it('reports a collection that is not a collection', () => {
    const { unresolved } = resolveAggregations(schema([WORST]), withAccounts({ nope: true }));
    expect(unresolved[0].reason).toContain('is not a collection');
  });

  it('reports rows that are not records', () => {
    const { unresolved } = resolveAggregations(schema([WORST]), withAccounts([1, 2]));
    expect(unresolved[0].reason).toContain('not a record');
  });
});

describe('precedence and determinism', () => {
  it('leaves a value the caller already supplied', () => {
    // Matching how connector fields resolve: the request wins over anything
    // computed for it, so a caller holding a better number keeps it.
    const input = {
      customer: { accounts: [{ arrears_days: 5 }], worst_arrears_days: 99 },
    };
    const { values } = resolveAggregations(schema([WORST]), input);
    expect(values['customer.worst_arrears_days']).toBeUndefined();
  });

  it('is byte-identical across runs', () => {
    // The values are hashed into the decision, so a rollup that varied between
    // two identical requests would break replay.
    const input = withAccounts([{ status: 'active', arrears_days: 3 }]);
    const a = resolveAggregations(schema([WORST, ACTIVE_COUNT]), input);
    const b = resolveAggregations(schema([WORST, ACTIVE_COUNT]), input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('merging into the input', () => {
  it('nests a dotted path so the engine can read it', () => {
    // `readPath` walks objects. A flat key containing a dot would never be
    // found, and the policy would silently compare against undefined.
    const merged = mergeAggregations({ customer: { age: 40 } }, {
      'customer.worst_arrears_days': 34,
    });
    expect(merged).toEqual({
      customer: { age: 40, worst_arrears_days: 34 },
    });
  });

  it("does not mutate the caller's input", () => {
    // The request may already have been recorded elsewhere; rewriting a nested
    // object in place would change history.
    const input = { customer: { age: 40 } };
    const merged = mergeAggregations(input, { 'customer.rolled': 1 });
    expect(input).toEqual({ customer: { age: 40 } });
    expect(merged.customer).toEqual({ age: 40, rolled: 1 });
  });

  it('keeps sibling keys when nesting under an existing object', () => {
    const merged = mergeAggregations({ customer: { existing: true } }, {
      'customer.active_account_count': 2,
    });
    expect(merged.customer).toEqual({ existing: true, active_account_count: 2 });
  });
});
