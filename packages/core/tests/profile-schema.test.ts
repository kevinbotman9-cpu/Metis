import { describe, it, expect } from 'vitest';
import {
  resolveField,
  listFieldPaths,
  operatorsFor,
  conditionProblems,
  schemaProblems,
  didYouMean,
  typeOf,
  type ProfileSchema,
} from '../src/profile-schema';

/**
 * The data model, and the class of defect it exists to make impossible.
 *
 * The defect, demonstrated against the real engine before this was written:
 * changing `address.fibre_available` to `address.fibre_availabl` in an
 * eligibility policy moved the winner from `acq_fibre_900` to `acq_sim_30`, and
 * the trace explained it as `ELIGIBILITY_FAILED (pol_fibre_available)`. The
 * typo did not error — it decided, and the audit trail defended the wrong
 * answer with a confident reason code naming a real policy.
 *
 * The compiler could not see it: `UNRESOLVED_FIELD` checks the root segment
 * only, and `address` exists.
 */

const schema: ProfileSchema = {
  id: 'schema_test',
  tenantId: 't',
  version: '1.0.0',
  root: 'Input',
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'test',
  entities: [
    {
      name: 'Input',
      description: 'root',
      fields: [{ name: 'marketingConsent', type: 'boolean', description: 'flat, from a connector' }],
      relationships: [
        { name: 'customer', entity: 'Customer', cardinality: 'one', description: '' },
        { name: 'address', entity: 'Address', cardinality: 'one', description: '' },
      ],
    },
    {
      name: 'Customer',
      description: '',
      fields: [
        { name: 'age', type: 'integer', description: '' },
        { name: 'credit_status', type: 'enum', members: ['pass', 'refer', 'fail'], description: '' },
        { name: 'name', type: 'string', description: '' },
        { name: 'ratio', type: 'decimal', description: '' },
      ],
      relationships: [{ name: 'accounts', entity: 'Account', cardinality: 'many', description: '' }],
    },
    {
      name: 'Address',
      description: '',
      fields: [{ name: 'fibre_available', type: 'boolean', description: '' }],
    },
    {
      name: 'Account',
      description: '',
      fields: [{ name: 'arrears_days', type: 'integer', description: '' }],
    },
  ],
  aggregations: [
    {
      produces: 'accounts.worst_arrears_days',
      description: '',
      over: ['customer', 'accounts'],
      fn: 'max',
      field: 'arrears_days',
      type: 'integer',
    },
  ],
};

describe('the defect this exists to prevent', () => {
  it('rejects the typo that silently decided', () => {
    const problems = conditionProblems(schema, {
      field: 'address.fibre_availabl',
      operator: 'eq',
      value: true,
    });

    expect(problems).toHaveLength(1);
    expect(problems[0].code).toBe('UNKNOWN_FIELD');
    expect(problems[0].message).toContain("Did you mean 'address.fibre_available'?");
  });

  it('accepts the field that was meant', () => {
    expect(
      conditionProblems(schema, { field: 'address.fibre_available', operator: 'eq', value: true })
    ).toEqual([]);
  });
});

describe('resolving a path', () => {
  it('walks one-cardinality relationships to a field', () => {
    const r = resolveField(schema, 'customer.age');
    expect(r?.kind).toBe('field');
    expect(typeOf(r!)).toBe('integer');
  });

  it('resolves a flat field on the root', () => {
    expect(typeOf(resolveField(schema, 'marketingConsent')!)).toBe('boolean');
  });

  it('resolves an aggregation as if it were a field', () => {
    const r = resolveField(schema, 'accounts.worst_arrears_days');
    expect(r?.kind).toBe('aggregation');
    expect(typeOf(r!)).toBe('integer');
  });

  it('does not resolve a path that stops on a relationship', () => {
    // `customer.address` names an object. No operator compares one usefully,
    // and returning it would let a policy be authored that can never pass.
    expect(resolveField(schema, 'customer')).toBeUndefined();
    expect(resolveField(schema, 'address')).toBeUndefined();
  });

  it('does not resolve through a many relationship', () => {
    // There is no single `arrears_days` to compare. That is what the
    // aggregation is for, and offering the raw path would promise the engine
    // can do something it cannot.
    expect(resolveField(schema, 'customer.accounts.arrears_days')).toBeUndefined();
  });
});

describe('the picker list', () => {
  it('offers every reachable field, and no many-relationship path', () => {
    const paths = listFieldPaths(schema).map((r) => r.path);

    expect(paths).toContain('customer.age');
    expect(paths).toContain('address.fibre_available');
    expect(paths).toContain('marketingConsent');
    expect(paths).toContain('accounts.worst_arrears_days');
    expect(paths).not.toContain('customer.accounts.arrears_days');
  });

  it('is sorted, so the picker does not reorder between renders', () => {
    const paths = listFieldPaths(schema).map((r) => r.path);
    expect(paths).toEqual([...paths].sort());
  });

  it('terminates on a relationship cycle', () => {
    // A household containing customers containing a household is a legitimate
    // model and an infinite walk. The bound is also what stops the picker
    // listing thousands of paths.
    const cyclic: ProfileSchema = {
      ...schema,
      entities: [
        {
          name: 'Input',
          description: '',
          fields: [],
          relationships: [{ name: 'customer', entity: 'Customer', cardinality: 'one', description: '' }],
        },
        {
          name: 'Customer',
          description: '',
          fields: [{ name: 'age', type: 'integer', description: '' }],
          relationships: [{ name: 'household', entity: 'Household', cardinality: 'one', description: '' }],
        },
        {
          name: 'Household',
          description: '',
          fields: [{ name: 'size', type: 'integer', description: '' }],
          relationships: [{ name: 'lead', entity: 'Customer', cardinality: 'one', description: '' }],
        },
      ],
      aggregations: [],
    };

    const paths = listFieldPaths(cyclic).map((r) => r.path);
    expect(paths).toContain('customer.age');
    expect(paths).toContain('customer.household.size');
    expect(paths.length).toBeLessThan(20);
  });
});

describe('type rules', () => {
  it('never offers a text operator on a number', () => {
    expect(operatorsFor('integer')).not.toContain('contains');
    expect(operatorsFor('string')).toContain('contains');
  });

  it('offers existence checks on every type', () => {
    for (const type of ['integer', 'string', 'boolean', 'enum', 'money'] as const) {
      expect(operatorsFor(type)).toContain('exists');
      expect(operatorsFor(type)).toContain('not_exists');
    }
  });

  it('refuses an operator the type does not admit', () => {
    const problems = conditionProblems(schema, {
      field: 'customer.age',
      operator: 'contains',
      value: 'x',
    });
    expect(problems.map((p) => p.code)).toContain('OPERATOR_NOT_ALLOWED');
  });

  it('refuses a value of the wrong type', () => {
    expect(
      conditionProblems(schema, { field: 'customer.age', operator: 'gt', value: '18' }).map((p) => p.code)
    ).toContain('VALUE_TYPE');

    expect(
      conditionProblems(schema, { field: 'address.fibre_available', operator: 'eq', value: 'true' }).map(
        (p) => p.code
      )
    ).toContain('VALUE_TYPE');
  });

  it('refuses a value outside an enum, and suggests the near miss', () => {
    // The bug this catches is the one a text box invites: `passed` for `pass`
    // reads correctly and matches nothing, so the rule suppresses everything.
    const problems = conditionProblems(schema, {
      field: 'customer.credit_status',
      operator: 'eq',
      value: 'passed',
    });
    expect(problems[0].code).toBe('NOT_A_MEMBER');
    expect(problems[0].message).toContain("Did you mean 'pass'?");
  });

  it('checks every member of an in-list, not just the first', () => {
    const problems = conditionProblems(schema, {
      field: 'customer.credit_status',
      operator: 'in',
      value: ['pass', 'referred'],
    });
    expect(problems.map((p) => p.code)).toEqual(['NOT_A_MEMBER']);
  });

  it('requires a list for in and not_in', () => {
    expect(
      conditionProblems(schema, { field: 'customer.credit_status', operator: 'in', value: 'pass' }).map(
        (p) => p.code
      )
    ).toContain('VALUE_TYPE');
  });

  it('ignores the value entirely for existence checks', () => {
    // `exists` takes no operand. Type-checking one that is not there would
    // reject a perfectly good condition.
    expect(conditionProblems(schema, { field: 'customer.age', operator: 'exists', value: undefined })).toEqual([]);
  });

  it('type-checks an aggregation like any other field', () => {
    expect(
      conditionProblems(schema, {
        field: 'accounts.worst_arrears_days',
        operator: 'gt',
        value: 'thirty',
      }).map((p) => p.code)
    ).toContain('VALUE_TYPE');
  });
});

describe('the schema itself', () => {
  it('passes when it is coherent', () => {
    expect(schemaProblems(schema)).toEqual([]);
  });

  it('catches a relationship pointing nowhere', () => {
    const broken: ProfileSchema = {
      ...schema,
      entities: schema.entities.map((e) =>
        e.name === 'Input'
          ? { ...e, relationships: [{ name: 'x', entity: 'Nope', cardinality: 'one', description: '' }] }
          : e
      ),
    };
    expect(schemaProblems(broken).join(' ')).toContain("undefined entity 'Nope'");
  });

  it('catches an enum with no members', () => {
    const broken: ProfileSchema = {
      ...schema,
      entities: schema.entities.map((e) =>
        e.name === 'Address'
          ? { ...e, fields: [{ name: 'band', type: 'enum' as const, description: '' }] }
          : e
      ),
    };
    expect(schemaProblems(broken).join(' ')).toContain('enum with no members');
  });

  it('catches an aggregation over a single related object', () => {
    // Aggregating over a `one` relationship is a field read in disguise, and
    // would be clearer written as one.
    const broken: ProfileSchema = {
      ...schema,
      aggregations: [
        { produces: 'x', description: '', over: ['address'], fn: 'max', field: 'fibre_available', type: 'integer' },
      ],
    };
    expect(schemaProblems(broken).join(' ')).toContain('not many');
  });

  it('catches an aggregation reading a field the target does not have', () => {
    const broken: ProfileSchema = {
      ...schema,
      aggregations: [
        { produces: 'x', description: '', over: ['customer', 'accounts'], fn: 'max', field: 'nope', type: 'integer' },
      ],
    };
    expect(schemaProblems(broken).join(' ')).toContain("reads 'nope'");
  });

  it('catches a rollup that names no field', () => {
    const broken: ProfileSchema = {
      ...schema,
      aggregations: [
        { produces: 'x', description: '', over: ['customer', 'accounts'], fn: 'sum', type: 'integer' },
      ],
    };
    expect(schemaProblems(broken).join(' ')).toContain('names no field');
  });
});

describe('suggestions', () => {
  it('suggests a near miss on the leaf when the prefix is right', () => {
    expect(didYouMean('address.fibre_availabl', ['address.fibre_available'])).toContain('Did you mean');
  });

  it('stays silent rather than sending the reader somewhere wrong', () => {
    // A loose bound suggests unrelated fields, which is worse than saying
    // nothing — the reader goes and looks at something irrelevant.
    expect(didYouMean('customer.completely_unrelated', ['address.fibre_available'])).toBe('');
  });
});
