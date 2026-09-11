/**
 * The customer data model.
 *
 * `PolicyCondition.field` has always been documented as "a dotted path into the
 * customer data model". There was no such model — only a string, and a partial
 * check. The compiler's `UNRESOLVED_FIELD` diagnostic is opt-in and validates
 * the *root* segment only, because a root is all a connector can supply. So
 * `address.fibre_available` and `address.fibre_availabl` were equally valid to
 * every layer of the platform.
 *
 * That is not a missing feature, it is a correctness hole. Demonstrated against
 * the real engine: one character wrong in a leaf moved the winner from
 * `acq_fibre_900` to `acq_sim_30`, and the trace explained it as
 * `ELIGIBILITY_FAILED (pol_fibre_available)` — a confident reason code naming a
 * real policy. A typo does not error here. It decides, and then the audit trail
 * defends the wrong answer.
 *
 * `compare()` is careful about missing values — there is a comment there
 * explaining why `undefined` must not silently pass a numeric comparison — but
 * no amount of care at evaluation time can distinguish "this customer has no
 * value" from "this field has never existed". Only a declared model can.
 *
 * ## What this is, and what it deliberately is not
 *
 * It is a **contract**: what fields exist, what type each is, how entities
 * relate. It says nothing about where values come from. That is already two
 * separate answers today — the caller sends them, or a connector resolves them
 * — and will be a third when a profile store exists. Keeping the contract
 * independent of storage is what lets it land without retaining any customer
 * data, and therefore without waiting behind ADR-004.
 *
 * ## Why relationships do not reach the engine
 *
 * Entities may declare parents and children. The deterministic core never walks
 * them. Reading a live relational graph inside `execute` would end replay: the
 * same request would decide differently as the graph moved underneath it.
 *
 * So a child collection reaches a policy as a declared `SchemaAggregation`,
 * computed during `resolveInputs` — before the deterministic core, where
 * connector fields already resolve — and entering the hashed input as a scalar.
 * The number the decision saw is part of what was decided, so replay stays
 * byte-identical.
 *
 * This is the same split Pega, Adobe and Salesforce arrived at (interaction
 * history summaries, computed attributes, calculated insights). They did it for
 * latency; METIS needs it for replay. Convergent, not a workaround.
 */

import type { PolicyCondition, PolicyOperator } from './domain';

/**
 * Field types.
 *
 * `integer` and `decimal` are separate because the difference is a real
 * authoring constraint — an age of 29.4 is a data error — and because the value
 * control in the editor should differ.
 *
 * `money` carries a currency and is stored in minor units, matching `Money` in
 * the domain. Kept distinct from `integer` so nobody compares pence to a ratio
 * without noticing.
 */
export type FieldType =
  | 'string'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'timestamp'
  | 'enum'
  | 'money';

/** Numeric types, in one place so the operator and type rules cannot drift. */
export const NUMERIC_TYPES: readonly FieldType[] = ['integer', 'decimal', 'money'];

/**
 * How exposed a field is, which is retention's input rather than decoration.
 *
 * ADR-004 is still Proposed, and the shape of erasure depends on knowing which
 * fields are personal. Classifying at declaration time is far cheaper than
 * classifying a populated store later — which is the ADR's own warning.
 */
export type Sensitivity = 'none' | 'personal' | 'special_category';

/**
 * Where a field's value comes from. ADR-014 §2.
 *
 * Declared per field because it is what makes the boundary in §1 enforceable: a
 * caller may narrow a decision and never widen it, and that rule cannot be
 * checked unless each field says whether the caller is allowed to supply it at
 * all. `connector:<id>` names the integration, so the trace can attribute a
 * value to the system that produced it — which nothing could do while policies
 * read dotted paths and connectors declared flat names (G-069).
 */
export type FieldOrigin =
  | 'profile'
  | 'request'
  | 'interaction'
  | 'aggregation'
  | `connector:${string}`;

/**
 * What a field *is*, as opposed to what it holds. ADR-014 §2.
 *
 * Sharper than `sensitivity`, which nothing enforces: consent and contact
 * points are handled by rules of their own — ADR-014 §7 and §8 — and those
 * rules need to find their fields without matching on names.
 *
 * Declared now and enforced later, deliberately: §7 flips the consent default
 * in both engines, which is its own chain-hash move and its own slice.
 */
export type FieldClass = 'attribute' | 'consent' | 'contact_point' | 'identifier';

export interface SchemaField {
  /** The path segment, e.g. `age` in `customer.age`. */
  name: string;
  type: FieldType;
  description: string;
  /** Where the value comes from. Required: an undeclared origin is the gap. */
  origin: FieldOrigin;
  /** What the field is, for the rules that treat some fields differently. */
  class: FieldClass;
  /** Allowed values, for `enum`. The editor renders these; the compiler checks them. */
  members?: string[];
  /**
   * Whether a decision can be made without it.
   *
   * Not enforced by the engine — a missing optional field simply fails its
   * comparisons. It drives the coverage question: which fields must a caller or
   * connector supply for this flow to mean anything.
   */
  required?: boolean;
  sensitivity?: Sensitivity;
  /** `days`, `pence`, `ratio`, `months`. Shown beside the value input. */
  unit?: string;
}

export interface SchemaRelationship {
  /** The path segment, e.g. `accounts`. */
  name: string;
  /** Target entity name. */
  entity: string;
  cardinality: 'one' | 'many';
  description: string;
}

export interface SchemaEntity {
  name: string;
  description: string;
  fields: SchemaField[];
  relationships?: SchemaRelationship[];
}

export type AggregationFn = 'count' | 'sum' | 'min' | 'max' | 'any' | 'all';

/**
 * A rollup over a `many` relationship, declared on the schema and resolved
 * before the engine runs.
 *
 * Declared here rather than written inside a policy on purpose: it keeps the
 * policy language small, keeps the cost of a decision predictable, and makes
 * the rollup a named, reviewable object rather than an expression buried in one
 * rule.
 */
export interface SchemaAggregation {
  /** The flat path it produces in the input, e.g. `accounts.worst_arrears_days`. */
  produces: string;
  description: string;
  /** Relationship names from the root entity, e.g. `['accounts']`. */
  over: string[];
  fn: AggregationFn;
  /** Field on the target entity. Omitted for `count`, required otherwise. */
  field?: string;
  /** Restricts which children count. Reuses the policy condition shape. */
  where?: PolicyCondition[];
  /** Result type, so the picker and the compiler can treat it like any field. */
  type: FieldType;
}

/**
 * A root, and the path segment that addresses it.
 *
 * `{ alias: 'customer', entity: 'Customer' }` makes `customer.age` resolve to
 * the `age` field of `Customer`. The alias is declared rather than derived
 * from the entity name so a rename of one is not silently a rename of every
 * policy's field path.
 */
export interface SchemaRoot {
  alias: string;
  entity: string;
}

/**
 * The two roots. ADR-014 §2.
 *
 * A decision reads a subject and a request, and they are different things with
 * different lifetimes: the profile is held against a customer and written by
 * ingestion; the context is what only the caller can know — session, basket,
 * the event that triggered the decision — and is never stored. One root called
 * `DecisionInput` modelled a request body and called it a customer, and the
 * fixture that declared it said so on its first day.
 */
export interface SchemaRoots {
  profile: SchemaRoot;
  request: SchemaRoot;
}

/**
 * The schema a decision was read against. ADR-014 §2.
 *
 * A compiled artifact pins it, and the decision carries the same triple, so
 * every decision names the model its fields were resolved through. Without it
 * a replay six months later reads today's schema and cannot tell that the
 * meaning of a path changed underneath it.
 */
export interface SchemaPin {
  id: string;
  version: string;
  /** sha256 over the schema's content, so a silent edit is not the same pin. */
  hash: string;
}

export interface ProfileSchema {
  id: string;
  tenantId: string;
  /** Bumped whenever the shape changes. Recorded with the decision. */
  version: string;
  /**
   * The two roots a path can start from.
   *
   * Was a single `root` naming one entity until 2026-09-11 (ADR-014 §2).
   */
  roots: SchemaRoots;
  entities: SchemaEntity[];
  aggregations: SchemaAggregation[];
  updatedAt: string;
  updatedBy: string;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type ResolvedPath =
  | { kind: 'field'; path: string; entity: SchemaEntity; field: SchemaField }
  | { kind: 'aggregation'; path: string; aggregation: SchemaAggregation };

/** The type a resolved path holds, whichever kind it is. */
export function typeOf(resolved: ResolvedPath): FieldType {
  return resolved.kind === 'field' ? resolved.field.type : resolved.aggregation.type;
}

const entityByName = (schema: ProfileSchema, name: string) =>
  schema.entities.find((e) => e.name === name);

/**
 * Resolve a dotted path against the schema.
 *
 * Walks relationships for every segment but the last, which must be a field.
 * A path ending on a relationship (`customer.address`) does not resolve: it
 * names an object, and no operator compares one usefully.
 */
/** The root a path addresses, by its first segment. */
export function rootFor(schema: ProfileSchema, path: string): SchemaRoot | undefined {
  const head = path.split('.')[0];
  return [schema.roots.profile, schema.roots.request].find((r) => r.alias === head);
}

export function resolveField(schema: ProfileSchema, path: string): ResolvedPath | undefined {
  const aggregation = schema.aggregations.find((a) => a.produces === path);
  if (aggregation) return { kind: 'aggregation', path, aggregation };

  const root = rootFor(schema, path);
  if (!root) return undefined;

  // The first segment named the root; everything after it walks from there.
  const segments = path.split('.').slice(1);
  const leaf = segments.pop();
  if (!leaf) return undefined;

  let entity = entityByName(schema, root.entity);
  for (const segment of segments) {
    const rel = entity?.relationships?.find((r) => r.name === segment);
    if (!rel) return undefined;
    // A `many` hop has no single value at the end of it. Resolving through one
    // would hand back a field the engine can never evaluate — `readPath` walks
    // objects, not arrays — and a policy built on it would suppress everything
    // while looking correct. That is the whole defect class this module is
    // here to close, so it must not be reintroduced by the resolver itself.
    if (rel.cardinality === 'many') return undefined;
    entity = entityByName(schema, rel.entity);
  }
  if (!entity) return undefined;

  const field = entity.fields.find((f) => f.name === leaf);
  return field ? { kind: 'field', path, entity, field } : undefined;
}

/**
 * Every path a policy may reference, for the editor's picker and for
 * `didYouMean` suggestions.
 *
 * Only `one`-cardinality relationships are walked. A `many` relationship has no
 * single value to compare, and offering `accounts.arrears_days` would promise
 * something the engine cannot evaluate — that is what an aggregation is for,
 * and aggregations appear in this list on their own terms.
 */
export function listFieldPaths(schema: ProfileSchema): ResolvedPath[] {
  const out: ResolvedPath[] = [];
  const seen = new Set<string>();

  const walk = (entityName: string, prefix: string, depth: number) => {
    // A relationship cycle (customer → household → customer) would otherwise
    // recur forever. Depth-bounded rather than cycle-detected: the bound is
    // also what keeps the picker from listing thousands of paths.
    if (depth > 4) return;
    const entity = entityByName(schema, entityName);
    if (!entity) return;

    for (const field of entity.fields) {
      const path = prefix ? `${prefix}.${field.name}` : field.name;
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ kind: 'field', path, entity, field });
    }
    for (const rel of entity.relationships ?? []) {
      if (rel.cardinality !== 'one') continue;
      walk(rel.entity, prefix ? `${prefix}.${rel.name}` : rel.name, depth + 1);
    }
  };

  walk(schema.roots.profile.entity, schema.roots.profile.alias, 0);
  walk(schema.roots.request.entity, schema.roots.request.alias, 0);
  for (const aggregation of schema.aggregations) {
    out.push({ kind: 'aggregation', path: aggregation.produces, aggregation });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// ---------------------------------------------------------------------------
// Type rules
// ---------------------------------------------------------------------------

/**
 * Which operators a type admits.
 *
 * This is the list the editor renders and the list the compiler enforces, from
 * one definition — so an operator that cannot be offered also cannot be
 * authored by hand or imported from a fixture.
 *
 * `exists` and `not_exists` are on everything: "did we get a value" is a
 * legitimate question about any field, and it is the honest way to write a rule
 * that must not fire on absent data.
 */
export function operatorsFor(type: FieldType): PolicyOperator[] {
  const always: PolicyOperator[] = ['exists', 'not_exists'];
  switch (type) {
    case 'integer':
    case 'decimal':
    case 'money':
    case 'timestamp':
      return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', ...always];
    case 'enum':
      return ['eq', 'ne', 'in', 'not_in', ...always];
    case 'boolean':
      return ['eq', 'ne', ...always];
    case 'string':
      return ['eq', 'ne', 'in', 'not_in', 'contains', ...always];
    default:
      return always;
  }
}

/** One thing wrong with a condition, as the compiler and the editor report it. */
export interface ConditionProblem {
  code: 'UNKNOWN_FIELD' | 'OPERATOR_NOT_ALLOWED' | 'VALUE_TYPE' | 'NOT_A_MEMBER';
  message: string;
}

const isNumber = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/**
 * Check a condition against the schema.
 *
 * Returns every problem rather than the first, because these are authoring
 * errors shown beside the three controls that produced them, and fixing one at
 * a time is a worse experience than seeing all three.
 */
export function conditionProblems(
  schema: ProfileSchema,
  condition: PolicyCondition
): ConditionProblem[] {
  const problems: ConditionProblem[] = [];

  const resolved = resolveField(schema, condition.field);
  if (!resolved) {
    return [
      {
        code: 'UNKNOWN_FIELD',
        message:
          `No field '${condition.field}' in the data model.` +
          didYouMean(condition.field, listFieldPaths(schema).map((r) => r.path)),
      },
    ];
  }

  const type = typeOf(resolved);
  const allowed = operatorsFor(type);
  if (!allowed.includes(condition.operator)) {
    problems.push({
      code: 'OPERATOR_NOT_ALLOWED',
      message: `'${condition.operator}' does not apply to ${type} '${condition.field}'. Allowed: ${allowed.join(', ')}.`,
    });
  }

  // `exists` and `not_exists` take no value, so nothing below applies to them.
  if (condition.operator === 'exists' || condition.operator === 'not_exists') return problems;

  const values =
    condition.operator === 'in' || condition.operator === 'not_in'
      ? Array.isArray(condition.value)
        ? condition.value
        : [condition.value]
      : [condition.value];

  if ((condition.operator === 'in' || condition.operator === 'not_in') && !Array.isArray(condition.value)) {
    problems.push({
      code: 'VALUE_TYPE',
      message: `'${condition.operator}' needs a list of values.`,
    });
  }

  for (const value of values) {
    if (NUMERIC_TYPES.includes(type) || type === 'timestamp') {
      if (!isNumber(value)) {
        problems.push({
          code: 'VALUE_TYPE',
          message: `'${condition.field}' is ${type}; ${JSON.stringify(value)} is not a number.`,
        });
      }
    } else if (type === 'boolean') {
      if (typeof value !== 'boolean') {
        problems.push({
          code: 'VALUE_TYPE',
          message: `'${condition.field}' is boolean; ${JSON.stringify(value)} is not.`,
        });
      }
    } else if (type === 'enum' && resolved.kind === 'field') {
      const members = resolved.field.members ?? [];
      if (typeof value !== 'string') {
        problems.push({
          code: 'VALUE_TYPE',
          message: `'${condition.field}' is an enum; ${JSON.stringify(value)} is not a string.`,
        });
      } else if (members.length > 0 && !members.includes(value)) {
        problems.push({
          code: 'NOT_A_MEMBER',
          message:
            `'${value}' is not a value of '${condition.field}'. Allowed: ${members.join(', ')}.` +
            didYouMean(value, members),
        });
      }
    } else if (type === 'string' && typeof value !== 'string') {
      problems.push({
        code: 'VALUE_TYPE',
        message: `'${condition.field}' is a string; ${JSON.stringify(value)} is not.`,
      });
    }
  }

  return problems;
}

/**
 * Structural problems with the schema itself.
 *
 * A schema that names an entity it does not define, or aggregates over a
 * relationship that is not `many`, would produce confident nonsense downstream.
 */
export function schemaProblems(schema: ProfileSchema): string[] {
  const problems: string[] = [];
  const names = new Set(schema.entities.map((e) => e.name));

  for (const [role, root] of Object.entries(schema.roots)) {
    if (!names.has(root.entity)) {
      problems.push(`Root entity '${root.entity}' (${role}) is not defined.`);
    }
  }
  if (schema.roots.profile.alias === schema.roots.request.alias) {
    problems.push(`Both roots are addressed by '${schema.roots.profile.alias}'.`);
  }

  // A request field the caller cannot be trusted to widen with, or a profile
  // field nothing can write, is a modelling mistake this catches at
  // declaration rather than at decision time. ADR-014 §4.
  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      const underRequest = entity.name === schema.roots.request.entity;
      if (underRequest && field.origin === 'profile') {
        problems.push(`${entity.name}.${field.name} is under the request root and declares origin 'profile'.`);
      }
    }
  }

  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.type === 'enum' && (field.members ?? []).length === 0) {
        problems.push(`${entity.name}.${field.name} is an enum with no members.`);
      }
    }
    for (const rel of entity.relationships ?? []) {
      if (!names.has(rel.entity)) {
        problems.push(`${entity.name}.${rel.name} points at undefined entity '${rel.entity}'.`);
      }
    }
  }

  for (const agg of schema.aggregations) {
    if (agg.fn !== 'count' && !agg.field) {
      problems.push(`Aggregation '${agg.produces}' uses ${agg.fn} and names no field.`);
    }
    // Walk the relationship chain, and require the last hop to be `many` —
    // aggregating over a single related object is a field read wearing a
    // disguise, and would be better written as one.
    let entity = entityByName(schema, schema.roots.profile.entity);
    let last: SchemaRelationship | undefined;
    for (const hop of agg.over) {
      last = entity?.relationships?.find((r) => r.name === hop);
      if (!last) {
        problems.push(`Aggregation '${agg.produces}' walks '${hop}', which is not a relationship.`);
        break;
      }
      entity = entityByName(schema, last.entity);
    }
    if (last && last.cardinality !== 'many') {
      problems.push(
        `Aggregation '${agg.produces}' aggregates over '${last.name}', which holds one ${last.entity}, not many.`
      );
    }
    if (last && agg.field && entity && !entity.fields.some((f) => f.name === agg.field)) {
      problems.push(`Aggregation '${agg.produces}' reads '${agg.field}', absent from ${entity.name}.`);
    }
  }

  return problems;
}

/**
 * A suggestion, or nothing.
 *
 * Edit distance over the last path segment as well as the whole path, because
 * the mistake being caught is usually one character in a leaf and the prefix
 * matches exactly.
 */
export function didYouMean(typed: string, candidates: Iterable<string>): string {
  let best: string | null = null;
  let bestScore = Infinity;

  for (const candidate of candidates) {
    const whole = distance(typed, candidate);
    const leaf = distance(typed.split('.').pop()!, candidate.split('.').pop()!);
    const score = Math.min(whole, leaf);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  // Two edits at most. A looser bound starts suggesting unrelated fields, which
  // is worse than no suggestion because it sends the reader somewhere wrong.
  return best !== null && bestScore <= 2 ? ` Did you mean '${best}'?` : '';
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return rows[a.length][b.length];
}
