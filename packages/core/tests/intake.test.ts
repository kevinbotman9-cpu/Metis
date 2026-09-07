import { describe, it, expect } from 'vitest';
import {
  applyTransform,
  mapRow,
  validateRows,
  activationProblems,
  type DataSourceDefinition,
  type FieldMapping,
} from '../src/intake';
import type { ProfileSchema } from '../src/profile-schema';

/**
 * Landing a source shape and mapping it onto the model.
 *
 * The property under test is that nothing reaches the model unchecked. A source
 * is somebody else's schema — it changes without asking — so the value of the
 * middle two stages is entirely in what they refuse.
 */

const schema: ProfileSchema = {
  id: 's',
  tenantId: 't',
  version: '1.0.0',
  root: 'Input',
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'test',
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
      fields: [
        { name: 'age', type: 'integer', description: '', required: true },
        { name: 'credit_status', type: 'enum', members: ['pass', 'refer', 'fail'], description: '' },
        { name: 'ratio', type: 'decimal', description: '' },
        { name: 'optedIn', type: 'boolean', description: '' },
        { name: 'name', type: 'string', description: '' },
      ],
    },
  ],
  aggregations: [],
};

const NOW = new Date('2026-09-07T00:00:00.000Z');

const source = (mappings: FieldMapping[], columns: string[] = []): DataSourceDefinition => ({
  id: 'src',
  tenantId: 't',
  name: 'CRM',
  description: '',
  kind: 'file',
  columns,
  mappings,
  status: 'draft',
  landedRows: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'test',
});

describe('transforms', () => {
  it('derives an age from a date of birth', () => {
    expect(applyTransform({ kind: 'years_since' }, '1990-01-15', NOW)).toEqual({ value: 36 });
  });

  it('handles a birthday that has not happened yet this year', () => {
    // The off-by-one that would make a 17-year-old eligible for a credit
    // agreement, which is the first rule anybody writes.
    expect(applyTransform({ kind: 'years_since' }, '2008-12-31', NOW)).toEqual({ value: 17 });
    expect(applyTransform({ kind: 'years_since' }, '2008-01-01', NOW)).toEqual({ value: 18 });
  });

  it('refuses a date in the future rather than returning a negative age', () => {
    expect(applyTransform({ kind: 'years_since' }, '2030-01-01', NOW)).toEqual({
      problem: "'2030-01-01' is in the future",
    });
  });

  it('reads numbers with thousands separators', () => {
    expect(applyTransform({ kind: 'to_number' }, '1,250')).toEqual({ value: 1250 });
  });

  it('refuses a number it cannot read', () => {
    expect(applyTransform({ kind: 'to_number' }, 'n/a')).toEqual({
      problem: "'n/a' is not a number",
    });
  });

  it('reads the ways a source spells yes', () => {
    for (const yes of ['true', 'Y', 'yes', '1']) {
      expect(applyTransform({ kind: 'to_boolean' }, yes)).toEqual({ value: true });
    }
    expect(applyTransform({ kind: 'to_boolean' }, 'N')).toEqual({ value: false });
    expect(applyTransform({ kind: 'to_boolean' }, 'maybe')).toEqual({
      problem: "'maybe' is not a yes or a no",
    });
  });

  it('maps declared values and refuses undeclared ones', () => {
    const t = { kind: 'map_values' as const, values: { A: 'pass', B: 'pass', C: 'refer' } };
    expect(applyTransform(t, 'B')).toEqual({ value: 'pass' });
    // Deliberately not a pass-through. An unmapped band reaching the model
    // becomes an enum member nobody declared, rejected one layer later with a
    // worse message.
    const refused = applyTransform(t, 'Z');
    expect('problem' in refused && refused.problem).toContain("'Z' is not in the mapping");
  });

  it('treats blank as absent rather than as a value', () => {
    expect(applyTransform({ kind: 'to_number' }, '')).toEqual({ value: undefined });
    expect(applyTransform({ kind: 'to_number' }, null)).toEqual({ value: undefined });
  });
});

describe('mapping a row', () => {
  const mappings: FieldMapping[] = [
    { column: 'dob', path: 'customer.age', transform: { kind: 'years_since' } },
    {
      column: 'band',
      path: 'customer.credit_status',
      transform: { kind: 'map_values', values: { A: 'pass', D: 'fail' } },
    },
  ];

  it('nests values at their model paths', () => {
    const { record, problems } = mapRow(schema, mappings, { dob: '1990-01-15', band: 'A' }, 0, NOW);
    expect(record).toEqual({ customer: { age: 36, credit_status: 'pass' } });
    expect(problems).toEqual([]);
  });

  it('keeps what mapped and reports what did not', () => {
    // Discarding the row would make a report say "40,000 rows failed" where
    // the truth is "one column is wrong in 40,000 rows". Those need different
    // fixes.
    const { record, problems } = mapRow(schema, mappings, { dob: '1990-01-15', band: 'Z' }, 7, NOW);
    expect(record).toEqual({ customer: { age: 36 } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ row: 7, column: 'band', path: 'customer.credit_status' });
  });

  it('refuses a mapping onto a field the model does not have', () => {
    const { problems } = mapRow(schema, [{ column: 'x', path: 'customer.nope' }], { x: 1 });
    expect(problems[0].message).toContain("No field 'customer.nope'");
  });

  it('refuses a value the field type cannot hold', () => {
    const { record, problems } = mapRow(schema, [{ column: 'a', path: 'customer.age' }], {
      a: 'forty',
    });
    expect(record).toEqual({});
    expect(problems[0].message).toContain('expected a number');
  });

  it('refuses a fraction where the model says whole', () => {
    const { problems } = mapRow(schema, [{ column: 'a', path: 'customer.age' }], { a: 40.5 });
    expect(problems[0].message).toContain('expected a whole number');
  });

  it('refuses a value outside the enum even when the transform succeeded', () => {
    const { problems } = mapRow(
      schema,
      [{ column: 'b', path: 'customer.credit_status', transform: { kind: 'lowercase' } }],
      { b: 'PASSED' }
    );
    expect(problems[0].message).toContain('is not one of pass, refer, fail');
  });
});

describe('the validation report', () => {
  const mappings: FieldMapping[] = [
    { column: 'dob', path: 'customer.age', transform: { kind: 'years_since' } },
    {
      column: 'band',
      path: 'customer.credit_status',
      transform: { kind: 'map_values', values: { A: 'pass' } },
    },
  ];

  const rows = [
    { dob: '1990-01-15', band: 'A', spare: 1 },
    { dob: '1985-06-01', band: 'Z', spare: 2 },
    { dob: 'not a date', band: 'A', spare: 3 },
  ];

  it('summarises by column rather than by row', () => {
    // An import fails for a handful of reasons repeated thousands of times.
    // The question somebody has is which column is wrong and what the bad
    // value looks like, which a per-row list buries.
    const report = validateRows(schema, source(mappings, ['dob', 'band', 'spare']), rows, NOW);

    expect(report.rows).toBe(3);
    expect(report.clean).toBe(1);
    expect(report.errors).toBe(2);

    const band = report.columns.find((c) => c.column === 'band')!;
    expect(band.filled).toBe(2);
    expect(band.failed).toBe(1);
    expect(band.examples[0]).toContain("'Z' is not in the mapping");
  });

  it('names columns nothing uses', () => {
    const report = validateRows(schema, source(mappings, ['dob', 'band', 'spare']), rows, NOW);
    expect(report.unmapped).toEqual(['spare']);
  });

  it('names required model fields nothing fills', () => {
    const report = validateRows(schema, source([mappings[1]], ['band']), rows, NOW);
    expect(report.missingRequired).toEqual(['customer.age']);
  });

  it('reports no errors for a clean import', () => {
    const report = validateRows(schema, source(mappings, ['dob', 'band']), [rows[0]], NOW);
    expect(report.errors).toBe(0);
    expect(report.clean).toBe(1);
  });
});

describe('activation', () => {
  const good: FieldMapping[] = [
    { column: 'dob', path: 'customer.age', transform: { kind: 'years_since' } },
  ];

  it('refuses a source that has not been validated', () => {
    expect(activationProblems(source(good), null)).toContain('This source has not been validated.');
  });

  it('refuses a source with nothing mapped', () => {
    expect(activationProblems(source([]), null)).toContain('Nothing is mapped yet.');
  });

  it('refuses a source whose validation found errors', () => {
    // The whole point of landing and mapping first is to fail before anything
    // reads the data. Activating over known-bad columns skips the two stages
    // that justify the pipeline existing.
    const report = validateRows(schema, source(good, ['dob']), [{ dob: 'nope' }], NOW);
    expect(activationProblems(source(good), report).join(' ')).toContain(
      'do not satisfy the model'
    );
  });

  it('refuses a source where nothing was landed', () => {
    const report = validateRows(schema, source(good, ['dob']), [], NOW);
    expect(activationProblems(source(good), report)).toContain(
      'No rows have been landed, so nothing was checked.'
    );
  });

  it('allows one that lands clean and fills what is required', () => {
    const report = validateRows(schema, source(good, ['dob']), [{ dob: '1990-01-15' }], NOW);
    expect(activationProblems(source(good), report)).toEqual([]);
  });
});
