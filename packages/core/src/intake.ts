/**
 * Intake — landing a source shape and mapping it onto the data model.
 *
 * Every platform that does this well does it in two stages, and none of them
 * makes the source shape the model: Adobe maps sources onto XDM, Salesforce
 * maps a Data Lake Object onto a Data Model Object, Pega runs a Data Flow from
 * a Data Set into the Customer Analytic Record. The reason is the same
 * everywhere — a source is somebody else's schema, it changes without asking,
 * and rules written directly against it break when it does.
 *
 * So: **land** the rows as they arrive, **map** columns onto model paths,
 * **validate** the result against the schema, and only then **activate**. A
 * source that has not been validated cannot be activated, because the point of
 * the middle two stages is to fail before anything reads the data rather than
 * after.
 *
 * ## Transforms are declared, never written
 *
 * A mapping may transform a value, and the set of transforms is closed and
 * declarative. Not because expressions are hard, but because an arbitrary
 * expression in a mapping is code running over customer data on an ingest path,
 * versioned nowhere and reviewed by nobody. Every transform here is total,
 * deterministic, and reports its own failure rather than throwing.
 *
 * ## What this file does not do
 *
 * It does not store anything. Mapping and validation are pure, so they can be
 * run against a sample before a single row is retained — which is what makes it
 * possible to build and review an intake definition without yet deciding the
 * retention question ADR-004 is still open on.
 */

import type { ProfileSchema, SchemaField } from './profile-schema';
import { resolveField, NUMERIC_TYPES } from './profile-schema';

/** Where rows come from. Landing is the same for all three; only arrival differs. */
export type SourceKind = 'file' | 'http' | 'inline';

export type TransformKind =
  | 'none'
  | 'trim'
  | 'lowercase'
  | 'uppercase'
  | 'to_number'
  | 'to_boolean'
  | 'map_values'
  | 'years_since';

export interface Transform {
  kind: TransformKind;
  /**
   * For `map_values`: source value to model value, e.g. `{ A: 'pass' }`.
   *
   * Exhaustive by design. A source value with no entry produces a problem
   * rather than passing through, because a credit band the mapping has never
   * seen is exactly the case somebody needs to be told about.
   */
  values?: Record<string, string>;
}

export interface FieldMapping {
  /** Column name in the landed rows. */
  column: string;
  /** Dotted path in the data model, e.g. `customer.credit_status`. */
  path: string;
  transform?: Transform;
}

export interface DataSourceDefinition {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  kind: SourceKind;
  /** Column names observed when rows were landed. */
  columns: string[];
  mappings: FieldMapping[];
  /**
   * Lifecycle. `active` is only reachable through a validation that found no
   * errors — see `activationProblems`.
   */
  status: 'draft' | 'validated' | 'active';
  /** How many rows are held. Kept separate from the rows themselves. */
  landedRows: number;
  updatedAt: string;
  updatedBy: string;
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

type TransformResult = { value: unknown } | { problem: string };

const TRUE = new Set(['true', 'yes', 'y', '1', 't']);
const FALSE = new Set(['false', 'no', 'n', '0', 'f']);

/**
 * Apply one transform.
 *
 * Total: every input produces either a value or a stated problem, and nothing
 * throws. A transform that threw on row 40,000 of an import would abandon the
 * run somewhere nobody can resume from.
 */
export function applyTransform(
  transform: Transform | undefined,
  raw: unknown,
  now: Date = new Date()
): TransformResult {
  if (raw === undefined || raw === null || raw === '') return { value: undefined };
  const kind = transform?.kind ?? 'none';

  switch (kind) {
    case 'none':
      return { value: raw };
    case 'trim':
      return { value: String(raw).trim() };
    case 'lowercase':
      return { value: String(raw).trim().toLowerCase() };
    case 'uppercase':
      return { value: String(raw).trim().toUpperCase() };

    case 'to_number': {
      const n = Number(String(raw).trim().replace(/,/g, ''));
      return Number.isFinite(n) ? { value: n } : { problem: `'${String(raw)}' is not a number` };
    }

    case 'to_boolean': {
      const s = String(raw).trim().toLowerCase();
      if (TRUE.has(s)) return { value: true };
      if (FALSE.has(s)) return { value: false };
      return { problem: `'${String(raw)}' is not a yes or a no` };
    }

    case 'map_values': {
      const table = transform?.values ?? {};
      const key = String(raw).trim();
      if (key in table) return { value: table[key] };
      // Deliberately not a pass-through. An unmapped value reaching the model
      // is how a credit band nobody anticipated becomes an enum member nobody
      // declared, which the schema check would then reject one layer later
      // with a worse message.
      return {
        problem: `'${key}' is not in the mapping. Mapped: ${Object.keys(table).sort().join(', ') || 'nothing'}`,
      };
    }

    case 'years_since': {
      const then = new Date(String(raw));
      if (Number.isNaN(then.getTime())) return { problem: `'${String(raw)}' is not a date` };
      if (then.getTime() > now.getTime()) return { problem: `'${String(raw)}' is in the future` };
      let years = now.getUTCFullYear() - then.getUTCFullYear();
      const beforeBirthday =
        now.getUTCMonth() < then.getUTCMonth() ||
        (now.getUTCMonth() === then.getUTCMonth() && now.getUTCDate() < then.getUTCDate());
      if (beforeBirthday) years -= 1;
      return { value: years };
    }

    default:
      return { problem: `unknown transform '${kind}'` };
  }
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export interface RowProblem {
  /** Index in the landed rows, so a report can point at one. */
  row: number;
  column: string;
  path: string;
  message: string;
}

export interface MappedRow {
  record: Record<string, unknown>;
  problems: RowProblem[];
}

/** Set a dotted path on a nested record. */
function assign(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split('.');
  const leaf = segments.pop()!;
  let cursor = target;
  for (const segment of segments) {
    const existing = cursor[segment];
    cursor[segment] =
      existing !== null && typeof existing === 'object' && !Array.isArray(existing)
        ? existing
        : {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[leaf] = value;
}

/**
 * Does this value satisfy the field the model declares?
 *
 * The same rules the policy editor enforces on a condition's value, applied to
 * data instead. One definition of "is this an integer" for both, or an import
 * could land something a rule can never match.
 */
function fieldProblem(field: SchemaField, value: unknown): string | null {
  if (NUMERIC_TYPES.includes(field.type) || field.type === 'timestamp') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `expected a number`;
    if (field.type === 'integer' && !Number.isInteger(value)) return `expected a whole number`;
    return null;
  }
  if (field.type === 'boolean') return typeof value === 'boolean' ? null : 'expected true or false';
  if (field.type === 'enum') {
    if (typeof value !== 'string') return 'expected one of the declared values';
    const members = field.members ?? [];
    return members.includes(value)
      ? null
      : `'${value}' is not one of ${members.join(', ')}`;
  }
  return typeof value === 'string' ? null : 'expected text';
}

/**
 * Map one landed row onto the model.
 *
 * A row with problems still returns whatever mapped cleanly. Discarding the
 * whole row would make a report say "40,000 rows failed" where the truth is
 * "one column is wrong in 40,000 rows", and those need different fixes.
 */
export function mapRow(
  schema: ProfileSchema,
  mappings: FieldMapping[],
  row: Record<string, unknown>,
  index = 0,
  now?: Date
): MappedRow {
  const record: Record<string, unknown> = {};
  const problems: RowProblem[] = [];

  for (const mapping of mappings) {
    const resolved = resolveField(schema, mapping.path);
    if (!resolved || resolved.kind !== 'field') {
      problems.push({
        row: index,
        column: mapping.column,
        path: mapping.path,
        message: `No field '${mapping.path}' in the data model.`,
      });
      continue;
    }

    const transformed = applyTransform(mapping.transform, row[mapping.column], now);
    if ('problem' in transformed) {
      problems.push({
        row: index,
        column: mapping.column,
        path: mapping.path,
        message: transformed.problem,
      });
      continue;
    }

    if (transformed.value === undefined) {
      // Absent, not wrong. Required-ness is reported once per column by
      // `validateRows` rather than once per row, which is the difference
      // between a readable report and 40,000 identical lines.
      continue;
    }

    const bad = fieldProblem(resolved.field, transformed.value);
    if (bad) {
      problems.push({
        row: index,
        column: mapping.column,
        path: mapping.path,
        message: `${bad}, got ${JSON.stringify(transformed.value)}`,
      });
      continue;
    }

    assign(record, mapping.path, transformed.value);
  }

  return { record, problems };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ColumnSummary {
  column: string;
  path: string;
  /** Rows where this column produced a usable value. */
  filled: number;
  /** Rows where it produced a problem. */
  failed: number;
  /** Up to three, so a report shows the shape of the failure without the volume. */
  examples: string[];
}

export interface ValidationReport {
  rows: number;
  /** Rows with no problem in any column. */
  clean: number;
  columns: ColumnSummary[];
  /** Model paths marked required that no mapping fills. */
  missingRequired: string[];
  /** Columns in the landed rows that no mapping uses. */
  unmapped: string[];
  errors: number;
}

/**
 * Validate mapped rows and summarise by column.
 *
 * By column rather than by row on purpose. An import fails for a handful of
 * reasons repeated thousands of times, and a per-row list buries that: the
 * question somebody actually has is "which column is wrong, and what does the
 * bad value look like".
 */
export function validateRows(
  schema: ProfileSchema,
  source: Pick<DataSourceDefinition, 'mappings' | 'columns'>,
  rows: Record<string, unknown>[],
  now?: Date
): ValidationReport {
  const summaries = new Map<string, ColumnSummary>(
    source.mappings.map((m) => [
      m.column,
      { column: m.column, path: m.path, filled: 0, failed: 0, examples: [] },
    ])
  );

  let clean = 0;
  for (const [index, row] of rows.entries()) {
    const { record, problems } = mapRow(schema, source.mappings, row, index, now);
    if (problems.length === 0) clean += 1;

    for (const problem of problems) {
      const summary = summaries.get(problem.column);
      if (!summary) continue;
      summary.failed += 1;
      if (summary.examples.length < 3) summary.examples.push(problem.message);
    }
    for (const mapping of source.mappings) {
      const resolved = resolveField(schema, mapping.path);
      if (!resolved) continue;
      const filled = mapping.path.split('.').reduce<unknown>(
        (acc, key) => (acc !== null && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
        record
      );
      if (filled !== undefined) summaries.get(mapping.column)!.filled += 1;
    }
  }

  const mappedPaths = new Set(source.mappings.map((m) => m.path));
  const missingRequired: string[] = [];
  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (!field.required) continue;
      // Only paths reachable from the root are candidates; an entity nothing
      // relates to cannot be filled by any mapping and is not this source's
      // problem to report.
      for (const candidate of pathsTo(schema, entity.name, field.name)) {
        if (!mappedPaths.has(candidate)) missingRequired.push(candidate);
      }
    }
  }

  const usedColumns = new Set(source.mappings.map((m) => m.column));
  const unmapped = source.columns.filter((c) => !usedColumns.has(c)).sort();

  const columns = [...summaries.values()].sort((a, b) => a.column.localeCompare(b.column));
  return {
    rows: rows.length,
    clean,
    columns,
    missingRequired: [...new Set(missingRequired)].sort(),
    unmapped,
    errors: columns.reduce((n, c) => n + c.failed, 0),
  };
}

/** Every dotted path that reaches `field` on `entity`, walking `one` relationships. */
function pathsTo(schema: ProfileSchema, entity: string, field: string): string[] {
  const out: string[] = [];
  const walk = (current: string, prefix: string, depth: number) => {
    if (depth > 4) return;
    if (current === entity) out.push(prefix ? `${prefix}.${field}` : field);
    const e = schema.entities.find((x) => x.name === current);
    for (const rel of e?.relationships ?? []) {
      if (rel.cardinality !== 'one') continue;
      walk(rel.entity, prefix ? `${prefix}.${rel.name}` : rel.name, depth + 1);
    }
  };
  walk(schema.root, '', 0);
  return out;
}

/**
 * Why this source cannot go live yet, or nothing.
 *
 * Activation is gated on a validation that found no errors, because the whole
 * point of landing and mapping first is to fail before anything reads the data.
 * A source that activates with known-bad columns has skipped the two stages
 * that justify the pipeline existing.
 */
export function activationProblems(
  source: DataSourceDefinition,
  report: ValidationReport | null
): string[] {
  const problems: string[] = [];
  if (source.mappings.length === 0) problems.push('Nothing is mapped yet.');
  if (!report) {
    problems.push('This source has not been validated.');
    return problems;
  }
  if (report.rows === 0) problems.push('No rows have been landed, so nothing was checked.');
  if (report.errors > 0) {
    problems.push(`${report.errors} value(s) do not satisfy the model. Fix the mapping or the source.`);
  }
  if (report.missingRequired.length > 0) {
    problems.push(`Required fields nothing fills: ${report.missingRequired.join(', ')}.`);
  }
  return problems;
}
