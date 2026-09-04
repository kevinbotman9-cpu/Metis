/**
 * Deterministic execution engine.
 *
 * Contract: given the same artifact, the same catalogue snapshot and the same
 * request, this produces a byte-identical DeterministicDecision - today, on
 * another machine, or in six months. That is the whole basis of replay, and
 * `tests/determinism.test.ts` fails the build if it stops holding.
 *
 * Rules that keep it true, all of which the previous executor broke:
 *   - No Date.now(), no RNG, no UUIDs anywhere in the decision path. Time
 *     arrives as request.occurredAt; randomness comes from seeded hashes.
 *   - Timings are measured but kept out of the hashed part of the trace.
 *   - Node visit order is a deterministic topological sort, not Set iteration.
 *   - The catalogue is a snapshot argument, never a live lookup.
 */

import type {
  Proposition,
  EngagementPolicy,
  PolicyCondition,
  Lever,
  PolicyScope,
} from '@metis/core/domain';
import { canonicalise, hash, shortHash, seededUnitInterval } from './canonical';
import type {
  ExecArtifact,
  ExecNode,
  CatalogueSnapshot,
  DecisionRequest,
  DecisionTrace,
  DeterministicDecision,
  EliminationStep,
  CandidateScore,
  ReplayResult,
} from './types';

// ---------------------------------------------------------------------------
// Policy evaluation
// ---------------------------------------------------------------------------

/** Read a dotted path such as "customer.age" out of the request input. */
function readPath(input: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc !== null && typeof acc === 'object'
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      input
    );
}

function compare(actual: unknown, operator: PolicyCondition['operator'], expected: unknown): boolean {
  switch (operator) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not_exists':
      return actual === undefined || actual === null;
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as never);
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(actual as never);
    case 'contains':
      return (
        (typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)) ||
        (Array.isArray(actual) && actual.includes(expected as never))
      );
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      // A missing value must not silently pass a numeric comparison: undefined
      // coerces to NaN, and every NaN comparison is false, which would read as
      // "failed the rule" rather than "could not evaluate it". Be explicit.
      if (typeof actual !== 'number' || typeof expected !== 'number') return false;
      if (operator === 'gt') return actual > expected;
      if (operator === 'gte') return actual >= expected;
      if (operator === 'lt') return actual < expected;
      return actual <= expected;
    }
    default:
      return false;
  }
}

/** All conditions must hold. Use separate policies to express OR. */
function policyPasses(policy: EngagementPolicy, input: Record<string, unknown>): boolean {
  return policy.conditions.every((c) => compare(readPath(input, c.field), c.operator, c.value));
}

/** Does this scope cover this proposition? */
function scopeCovers(scope: PolicyScope, p: Proposition): boolean {
  switch (scope.level) {
    case 'tenant':
      return true;
    case 'issue':
      return scope.targetId === p.issueId;
    case 'group':
      return scope.targetId === p.groupId;
    case 'proposition':
      return scope.targetId === p.id;
    default:
      return false;
  }
}

const SCOPE_RANK: Record<PolicyScope['level'], number> = {
  tenant: 0,
  issue: 1,
  group: 2,
  proposition: 3,
};

/**
 * Effective lever for a proposition: the most specific scope wins, matching how
 * autonomy resolves. Falls back to the proposition's own weight.
 */
function effectiveLever(levers: Lever[], p: Proposition, occurredAt: string): number {
  const applicable = levers.filter((l) => {
    if (!scopeCovers(l.scope, p)) return false;
    if (!l.validity) return true;
    const day = occurredAt.slice(0, 10);
    if (day < l.validity.startsAt) return false;
    if (l.validity.endsAt && day > l.validity.endsAt) return false;
    return true;
  });

  if (applicable.length === 0) return p.lever;

  return applicable.reduce((best, cur) =>
    SCOPE_RANK[cur.scope.level] > SCOPE_RANK[best.scope.level] ? cur : best
  ).value;
}

function withinValidity(p: Proposition, occurredAt: string): boolean {
  const day = occurredAt.slice(0, 10);
  if (day < p.validity.startsAt) return false;
  if (p.validity.endsAt && day > p.validity.endsAt) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Graph ordering
// ---------------------------------------------------------------------------

/**
 * Kahn's algorithm with ties broken by node id.
 *
 * Deterministic order matters: two runs that visit filters in a different order
 * can attribute the same elimination to different nodes, so the traces differ
 * even though the winner does not.
 */
export function topologicalOrder(artifact: ExecArtifact): ExecNode[] {
  const byId = new Map(artifact.nodes.map((n) => [n.id, n]));
  const indegree = new Map(artifact.nodes.map((n) => [n.id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const e of artifact.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) {
      throw new Error(`Edge references a node that does not exist: ${e.from} -> ${e.to}`);
    }
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to]);
  }

  const ready = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id)
    .sort();

  const order: ExecNode[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(byId.get(id)!);
    for (const next of (outgoing.get(id) ?? []).slice().sort()) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }

  if (order.length !== artifact.nodes.length) {
    throw new Error('Strategy graph contains a cycle; execution must terminate');
  }
  return order;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * A cap this high is not a real frequency limit; it is a scope declaring itself
 * exempt, which is how service messages stay deliverable when commercial
 * offers are suppressed.
 */
const SERVICE_EXEMPT_THRESHOLD = 50;

const KIND_LABEL = {
  eligibility: 'Eligibility',
  applicability: 'Applicability',
  suitability: 'Suitability',
} as const;

export function execute(
  artifact: ExecArtifact,
  catalogue: CatalogueSnapshot,
  request: DecisionRequest
): DecisionTrace {
  const startedAt = Date.now();
  const timingsByNode: Record<string, number> = {};

  const byKey = new Map(catalogue.propositions.map((p) => [p.key, p]));
  const policyById = new Map(catalogue.engagementPolicies.map((p) => [p.id, p]));

  // Initial candidate set, in artifact order so it is reproducible.
  let candidates: Proposition[] = artifact.candidateKeys
    .map((k) => byKey.get(k))
    .filter((p): p is Proposition => Boolean(p));

  const consent = request.consent ?? { marketing: true, profiling: true, thirdParty: false };
  const eliminations: EliminationStep[] = [];
  const scores: Record<string, CandidateScore> = {};
  const constraintsApplied: string[] = [];
  let winner: string | null = null;
  let runnerUp: string | null = null;

  const record = (node: ExecNode, reason: string, before: Proposition[], after: Proposition[]) => {
    const survivedKeys = after.map((p) => p.key);
    eliminations.push({
      nodeId: node.id,
      nodeType: node.type,
      reason,
      eliminated: before.filter((p) => !after.includes(p)).map((p) => p.key),
      survived: survivedKeys,
    });
  };

  for (const node of topologicalOrder(artifact)) {
    const nodeStart = Date.now();
    const before = candidates;

    switch (node.type) {
      case 'source': {
        // Validity and status are intrinsic to the candidate set: a retired or
        // out-of-window proposition was never really a candidate.
        candidates = before.filter(
          (p) => p.status === 'active' && withinValidity(p, request.occurredAt)
        );
        record(
          node,
          candidates.length === before.length
            ? `Loaded profile for ${request.customerId}. All ${before.length} candidates are active and in their validity window.`
            : `Loaded profile for ${request.customerId}. Removed ${before.length - candidates.length} candidate(s) that were retired, paused or outside their validity window.`,
          before,
          candidates
        );
        break;
      }

      case 'filter':
      case 'constraint': {
        const policies = (node.policyIds ?? [])
          .map((id) => policyById.get(id))
          .filter((p): p is EngagementPolicy => Boolean(p) && p!.active);

        candidates = before.filter((p) =>
          policies.every((policy) => {
            // A policy only applies where its scope covers the candidate, and
            // where the candidate has opted into it.
            if (!scopeCovers(policy.scope, p)) return true;
            if (!p.policyIds.includes(policy.id) && policy.scope.level === 'proposition') {
              return true;
            }
            return policyPasses(policy, request.input);
          })
        );

        // Contact policy and consent are enforced at constraint nodes only.
        if (node.type === 'constraint') {
          const used = request.contactHistory?.withinPeriod ?? {};

          // A contact policy binds to a scope, exactly like an engagement
          // policy. Applying them all to every candidate is wrong: a
          // once-a-month cooldown scoped to one group would otherwise suppress
          // the entire catalogue.
          const relevantTo = (p: Proposition) =>
            catalogue.contactPolicies.filter(
              (c) =>
                c.active &&
                scopeCovers(c.scope, p) &&
                (!c.channel || c.channel === request.channel)
            );

          for (const p of candidates) {
            for (const c of relevantTo(p)) constraintsApplied.push(c.id);
          }

          if (!consent.marketing) {
            // Withheld consent removes commercial offers, but not duty-of-care
            // messages, which are the reason a scope can raise its own cap.
            candidates = candidates.filter((p) =>
              relevantTo(p).some((c) => c.maxContacts >= SERVICE_EXEMPT_THRESHOLD)
            );
          } else {
            candidates = candidates.filter((p) => {
              const breached = relevantTo(p).filter(
                (c) => (used[c.period] ?? 0) >= c.maxContacts
              );
              return breached.length === 0;
            });
          }
        }

        const kinds = [...new Set(policies.map((p) => KIND_LABEL[p.kind]))].sort();
        const removed = before.length - candidates.length;
        record(
          node,
          removed > 0
            ? `${kinds.join(' and ') || node.label} removed ${removed} candidate(s).`
            : `All ${before.length} candidate(s) passed ${kinds.join(' and ').toLowerCase() || node.label.toLowerCase()}.`,
          before,
          candidates
        );
        break;
      }

      case 'score-model':
      case 'score-adaptive': {
        const modelKey = node.model ? `${node.model.id}@${node.model.version}` : node.id;
        for (const p of candidates) {
          // Deterministic stand-in for a pinned model. Same customer, same
          // proposition, same model version always yields the same propensity.
          const propensity = round(
            0.05 + seededUnitInterval(request.customerId, p.key, modelKey) * 0.9,
            6
          );
          const value = round(Math.max(0.01, p.financials.expectedMargin.amount / 60000), 6);
          const lever = effectiveLever(catalogue.levers, p, request.occurredAt);
          const context = round(
            0.4 + seededUnitInterval(request.channel, p.key, request.placement) * 0.6,
            6
          );
          scores[p.key] = { propensity, value, lever, context, priority: 0 };
        }
        record(node, `Scored ${candidates.length} candidate(s) with ${modelKey}.`, before, candidates);
        break;
      }

      case 'arbitrate': {
        const w = catalogue.arbitration.weights;

        // A candidate with no model score is not disqualified. Some strategies
        // legitimately rank without a propensity model - anonymous web traffic
        // has no customer to score - and their formula says so. A missing term
        // is neutral, which under exponentiation means 1.0, not 0.
        for (const p of candidates) {
          if (scores[p.key]) continue;
          scores[p.key] = {
            propensity: 1,
            value: round(Math.max(0.01, p.financials.expectedMargin.amount / 60000), 6),
            lever: effectiveLever(catalogue.levers, p, request.occurredAt),
            context: 1,
            priority: 0,
          };
        }

        for (const p of candidates) {
          const s = scores[p.key];
          if (!s) continue;
          s.priority = round(
            Math.pow(s.propensity, w.propensity) *
              Math.pow(s.value, w.value) *
              Math.pow(s.lever, w.lever) *
              Math.pow(s.context, w.context),
            8
          );
        }

        // Sort by priority, then by key so equal scores never flip between runs.
        const ranked = candidates
          .filter((p) => scores[p.key])
          .sort((a, b) => {
            const d = scores[b.key].priority - scores[a.key].priority;
            return d !== 0 ? d : a.key.localeCompare(b.key);
          });

        winner = ranked[0]?.key ?? null;
        runnerUp = ranked[1]?.key ?? null;
        candidates = ranked.slice(0, 1);

        record(
          node,
          winner
            ? `Ranked ${ranked.length} finalist(s) by ${catalogue.arbitration.formula}. Winner: ${winner}.`
            : 'No candidates reached arbitration; decision returned no offer.',
          before,
          candidates
        );
        break;
      }

      case 'switch':
      case 'explain-annotate':
        record(node, `${node.label} passed ${before.length} candidate(s) through.`, before, candidates);
        break;

      default: {
        // Exhaustiveness guard: a new node type must be handled explicitly
        // rather than silently behaving as a pass-through.
        const never: never = node.type;
        throw new Error(`Unhandled node type: ${String(never)}`);
      }
    }

    timingsByNode[node.id] = round(Date.now() - nodeStart, 3);
  }

  const winnerProposition = winner ? byKey.get(winner) ?? null : null;

  const decision: DeterministicDecision = {
    tenantId: request.tenantId,
    artifactId: artifact.id,
    artifactVersion: artifact.version,
    customerRef: request.customerId,
    occurredAt: request.occurredAt,
    channel: request.channel,
    placement: request.placement,
    inputSnapshotHash: hash(request.input),
    catalogueSnapshotHash: hash(catalogue),
    packageVersions: artifact.packageVersions,
    candidateKeys: artifact.candidateKeys,
    eliminations,
    scores,
    arbitration: { formula: catalogue.arbitration.formula, winner, runnerUp },
    constraintsApplied: [...new Set(constraintsApplied)].sort(),
    consentState: consent,
    winner,
    winnerPropositionId: winnerProposition?.id ?? null,
  };

  return {
    // Content-addressed: the same decision computed twice carries the same id.
    id: `dec_${shortHash(decision, 16)}`,
    decision,
    measured: {
      timingsByNode,
      totalMs: round(Date.now() - startedAt, 3),
      executedAt: new Date().toISOString(),
    },
    chainHash: hash(decision),
  };
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

/**
 * Re-execute a recorded decision and compare the reproducible half.
 *
 * The inputs are passed in rather than read off the trace: a trace stores only
 * the input *hash*, never the customer attributes themselves, so that it can be
 * retained and shown without carrying personal data around. The caller fetches
 * the inputs from wherever they are held and hands them over here.
 *
 * A mismatched input is caught rather than silently producing a false negative:
 * if the supplied inputs do not hash to what the trace recorded, that is a
 * different question from "did the engine drift", and it is reported as such.
 *
 * Anything that differs is reported with its path, so a divergence is
 * diagnosable rather than just a failed boolean.
 */
export function replay(
  artifact: ExecArtifact,
  catalogue: CatalogueSnapshot,
  trace: DecisionTrace,
  input: Record<string, unknown>,
  contactHistory?: DecisionRequest['contactHistory']
): ReplayResult {
  const d = trace.decision;

  const suppliedHash = hash(input);
  if (suppliedHash !== d.inputSnapshotHash) {
    return {
      identical: false,
      decisionId: trace.id,
      originalChainHash: trace.chainHash,
      replayedChainHash: '',
      differences: [
        {
          path: '$.inputSnapshotHash',
          original: d.inputSnapshotHash,
          replayed: suppliedHash,
        },
      ],
    };
  }

  const fresh = execute(artifact, catalogue, {
    tenantId: d.tenantId,
    customerId: d.customerRef,
    channel: d.channel,
    placement: d.placement,
    occurredAt: d.occurredAt,
    input,
    contactHistory,
    consent: d.consentState,
  });

  const identical = fresh.chainHash === trace.chainHash;

  return {
    identical,
    decisionId: trace.id,
    originalChainHash: trace.chainHash,
    replayedChainHash: fresh.chainHash,
    differences: identical ? [] : diff(d, fresh.decision),
  };
}

/** Structural diff between two canonical values, reported by path. */
export function diff(a: unknown, b: unknown, path = '$'): ReplayResult['differences'] {
  if (canonicalise(a) === canonicalise(b)) return [];

  const bothObjects =
    a !== null && b !== null && typeof a === 'object' && typeof b === 'object' &&
    Array.isArray(a) === Array.isArray(b);

  if (!bothObjects) return [{ path, original: a, replayed: b }];

  const keys = [
    ...new Set([
      ...Object.keys(a as Record<string, unknown>),
      ...Object.keys(b as Record<string, unknown>),
    ]),
  ].sort();

  return keys.flatMap((k) =>
    diff(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
      `${path}.${k}`
    )
  );
}

/** Fixed-precision rounding, so float noise cannot change a hash. */
function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
