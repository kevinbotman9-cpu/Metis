/**
 * Rollups over child records, computed before the deterministic core.
 *
 * A schema may declare that a Customer has many Accounts. The engine never
 * walks that relationship: reading a live relational graph inside `execute`
 * would end replay, because the same request would decide differently as the
 * graph moved underneath it.
 *
 * So a child collection reaches a policy as a scalar. `accounts.worst_arrears_days`
 * is computed here, merged into the input, and hashed with it — which is what
 * keeps replay byte-identical. The number the decision saw is part of what was
 * decided, exactly as a connector-supplied field is.
 *
 * This is where Pega, Adobe and Salesforce also put it (interaction history
 * summaries, computed attributes, calculated insights). They arrived at the
 * split for latency; the reason here is replay, and the shape is the same.
 *
 * ## Absent is not zero
 *
 * The single most important rule in this file. A collection that is *absent* —
 * nobody loaded the customer's accounts — must not produce `0`, because
 * `accounts.active_count < 2` would then be **true** and the offer would go to
 * somebody whose accounts were never checked. That is fail-open, on exactly the
 * gates that exist to fail closed.
 *
 * An absent collection produces no value at all. The comparison against
 * `undefined` is then false for every numeric operator, the candidate is
 * denied, and the trace says so. An *empty* collection is different and does
 * count as zero: nobody has any accounts is a fact, not a gap.
 */

import { compare, readPath } from '../deterministic/engine';
import type { ProfileSchema, SchemaAggregation } from '@metis/core/profile-schema';

export interface AggregationResult {
  /** Values to merge into the decision input, by the path each declares. */
  values: Record<string, number | boolean>;
  /**
   * Aggregations that produced nothing, and why.
   *
   * Carried rather than dropped so a caller can tell "this customer has no
   * accounts in arrears" from "we never loaded their accounts". The two look
   * identical in the input and mean opposite things.
   */
  unresolved: { produces: string; reason: string }[];
}

/** Walk `over` to the child array, or report why there isn't one. */
function collectionAt(
  input: Record<string, unknown>,
  over: string[]
): { rows: Record<string, unknown>[] } | { reason: string } {
  const path = over.join('.');
  const raw = readPath(input, path);

  if (raw === undefined || raw === null) {
    return { reason: `no '${path}' in the input` };
  }
  if (!Array.isArray(raw)) {
    return { reason: `'${path}' is not a collection` };
  }
  // A row that is not an object cannot have the field an aggregation reads.
  // Refusing the whole rollup beats quietly aggregating the subset that
  // happens to be well formed, which would give a confident wrong number.
  if (raw.some((r) => r === null || typeof r !== 'object')) {
    return { reason: `'${path}' holds something that is not a record` };
  }
  return { rows: raw as Record<string, unknown>[] };
}

/** Apply the aggregation's `where`, using the same comparison policies use. */
function matching(rows: Record<string, unknown>[], agg: SchemaAggregation) {
  if (!agg.where?.length) return rows;
  return rows.filter((row) =>
    agg.where!.every((c) => compare(readPath(row, c.field), c.operator, c.value))
  );
}

/**
 * Compute one rollup.
 *
 * Returns `undefined` when it cannot be computed, never a stand-in. Every
 * caller of this treats undefined as "unknown", and a default here would erase
 * that distinction at the one point where it still exists.
 */
function apply(
  rows: Record<string, unknown>[],
  agg: SchemaAggregation
): { value: number | boolean } | { reason: string } {
  if (agg.fn === 'count') return { value: rows.length };

  if (!agg.field) {
    return { reason: `${agg.fn} names no field` };
  }

  const raw = rows.map((r) => readPath(r, agg.field!));

  if (agg.fn === 'any' || agg.fn === 'all') {
    // Truthiness of the named field. `all` over an empty set is true — vacuous
    // truth, and worth knowing: "every account is in good standing" holds for a
    // customer with no accounts. That is mathematically right and can still
    // surprise, so a rule that must not fire on absent history should test the
    // count as well.
    const truthy = raw.map((v) => v === true || (typeof v === 'number' && v !== 0));
    return { value: agg.fn === 'any' ? truthy.some(Boolean) : truthy.every(Boolean) };
  }

  const numbers = raw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (numbers.length !== raw.length) {
    return {
      reason: `'${agg.field}' is not a number on every record`,
    };
  }

  switch (agg.fn) {
    case 'sum':
      return { value: numbers.reduce((a, b) => a + b, 0) };
    case 'min':
    case 'max':
      // No elements means no minimum. Zero would be a value nobody has.
      if (numbers.length === 0) return { reason: 'no records to aggregate' };
      return { value: agg.fn === 'min' ? Math.min(...numbers) : Math.max(...numbers) };
    default:
      return { reason: `unsupported function '${agg.fn}'` };
  }
}

/**
 * Compute every rollup the schema declares, from the input as it stands.
 *
 * Deterministic: same input, same values, in the same order. Nothing here
 * touches the network — that would put an unrecorded dependency inside a
 * decision, and `no-egress.test.ts` guards the boundary this sits behind.
 */
export function resolveAggregations(
  schema: ProfileSchema,
  input: Record<string, unknown>
): AggregationResult {
  const values: Record<string, number | boolean> = {};
  const unresolved: { produces: string; reason: string }[] = [];

  // Sorted so the merge order is fixed. Two aggregations cannot collide on one
  // path — `schemaProblems` would have to allow it first — but a stable order
  // is worth having regardless of what the schema currently permits.
  for (const agg of [...schema.aggregations].sort((a, b) => a.produces.localeCompare(b.produces))) {
    // A caller that already sent the value keeps it, matching how connector
    // fields resolve: the request wins over anything computed for it.
    if (readPath(input, agg.produces) !== undefined) continue;

    const found = collectionAt(input, agg.over);
    if ('reason' in found) {
      unresolved.push({ produces: agg.produces, reason: found.reason });
      continue;
    }

    const result = apply(matching(found.rows, agg), agg);
    if ('reason' in result) {
      unresolved.push({ produces: agg.produces, reason: result.reason });
      continue;
    }
    values[agg.produces] = result.value;
  }

  return { values, unresolved };
}

/**
 * Merge rollup values into the input at their declared paths.
 *
 * `accounts.worst_arrears_days` is a dotted path, so it nests: the engine's
 * `readPath` walks objects, and a flat key containing a dot would never be
 * found. Returns a new object; the caller's input is not mutated, because the
 * request it came from may be recorded elsewhere.
 */
export function mergeAggregations(
  input: Record<string, unknown>,
  values: Record<string, number | boolean>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };

  for (const [path, value] of Object.entries(values)) {
    const segments = path.split('.');
    const leaf = segments.pop()!;

    let cursor = out;
    for (const segment of segments) {
      const existing = cursor[segment];
      // Copied rather than written through: the nested objects belong to the
      // caller's input, and rewriting one would change a request that may
      // already have been recorded.
      const next =
        existing !== null && typeof existing === 'object' && !Array.isArray(existing)
          ? { ...(existing as Record<string, unknown>) }
          : {};
      cursor[segment] = next;
      cursor = next;
    }
    cursor[leaf] = value;
  }

  return out;
}
