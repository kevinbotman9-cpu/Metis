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
  Offer,
  TargetingPolicy,
  PolicyCondition,
  Boost,
  PolicyScope,
  SourceBinding,
} from '@metis/core/domain';
import {
  resolveUtility,
  evaluateUtility,
  utilityKey,
  type UtilityFunction,
} from '@metis/core/utility';
import { canonicalise, hash, seededUnitInterval, round } from './canonical';
import {
  modelKeyOf,
  scorerFor,
  ScoresNotResolved,
  type ResolvedScores,
} from '../scoring';
import type {
  ExecArtifact,
  ExecNode,
  CatalogueSnapshot,
  DecisionRequest,
  DecisionRecord,
  DeterministicDecision,
  EliminationStep,
  CandidateScore,
  ReplayResult,
  Denial,
  ReasonCode,
} from './types';

// ---------------------------------------------------------------------------
// Policy evaluation
// ---------------------------------------------------------------------------

/**
 * Read a dotted path such as "customer.age" out of the request input.
 *
 * Exported because aggregation resolution walks the same paths before the core
 * runs, and two implementations of "what does this path mean" would eventually
 * disagree about something like a null intermediate — which is the kind of
 * difference that shows up as an unexplainable decision rather than an error.
 */
export function readPath(input: Record<string, unknown>, path: string): unknown {
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

/**
 * Compare one value. Exported for the same reason as `readPath`: an
 * aggregation's `where` filter and a policy condition must mean the same thing
 * by the same code, or a rollup could count a record a policy would reject.
 */
export function compare(actual: unknown, operator: PolicyCondition['operator'], expected: unknown): boolean {
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
function policyPasses(policy: TargetingPolicy, input: Record<string, unknown>): boolean {
  return policy.conditions.every((c) => compare(readPath(input, c.field), c.operator, c.value));
}

/** Does this scope cover this offer? */
function scopeCovers(scope: PolicyScope, p: Offer): boolean {
  switch (scope.level) {
    case 'tenant':
      return true;
    case 'objective':
      return scope.targetId === p.objectiveId;
    case 'category':
      return scope.targetId === p.categoryId;
    case 'offer':
      return scope.targetId === p.id;
    default:
      return false;
  }
}

const SCOPE_RANK: Record<PolicyScope['level'], number> = {
  tenant: 0,
  objective: 1,
  category: 2,
  offer: 3,
};

/**
 * Effective boost for an offer: the most specific scope wins, matching how
 * autonomy resolves. Falls back to the offer's own weight.
 */
function effectiveBoost(boosts: Boost[], p: Offer, occurredAt: string): number {
  const applicable = boosts.filter((l) => {
    if (!scopeCovers(l.scope, p)) return false;
    if (!l.validity) return true;
    const day = occurredAt.slice(0, 10);
    if (day < l.validity.startsAt) return false;
    if (l.validity.endsAt && day > l.validity.endsAt) return false;
    return true;
  });

  if (applicable.length === 0) return p.boost;

  return applicable.reduce((best, cur) =>
    SCOPE_RANK[cur.scope.level] > SCOPE_RANK[best.scope.level] ? cur : best
  ).value;
}

function withinValidity(p: Offer, occurredAt: string): boolean {
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
    throw new Error('Flow graph contains a cycle; execution must terminate');
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

/**
 * The catalogue snapshot hash, memoised per snapshot object.
 *
 * Hashing the whole catalogue on every decision is O(catalogue) work in the hot
 * path: with a few thousand offers it dominated execution entirely
 * (1.5ms per decision, almost all of it re-hashing identical data). The
 * snapshot is immutable for the life of a request batch, so caching on object
 * identity is safe, and a WeakMap lets the entry go when the snapshot does.
 */
const catalogueHashes = new WeakMap<CatalogueSnapshot, string>();

function catalogueHash(catalogue: CatalogueSnapshot): string {
  const cached = catalogueHashes.get(catalogue);
  if (cached !== undefined) return cached;
  const computed = hash(catalogue);
  catalogueHashes.set(catalogue, computed);
  return computed;
}

const KIND_LABEL = {
  eligibility: 'Eligibility',
  relevance: 'Relevance',
  suitability: 'Suitability',
} as const;

/**
 * The three qualification tiers, as reason codes.
 *
 * Deliberately one code per tier rather than one per policy: the tier is what
 * a customer or a regulator can act on ("we cannot offer you this" is a
 * different conversation from "not right now"), and the specific policy is
 * carried alongside in `ruleId`.
 */
const KIND_CODE: Record<TargetingPolicy['kind'], ReasonCode> = {
  eligibility: 'ELIGIBILITY_FAILED',
  relevance: 'RELEVANCE_FAILED',
  suitability: 'SUITABILITY_FAILED',
};

export function execute(
  artifact: ExecArtifact,
  catalogue: CatalogueSnapshot,
  request: DecisionRequest,
  /**
   * Propensities resolved before this ran — ADR-009 §2.
   *
   * Optional while the only scorer is a pure function, because requiring it
   * would change seventy call sites in one commit and each is a chance to move
   * a chain hash. The `pure` guard above is what keeps that transitional shape
   * honest: a scorer that reaches anything is refused here rather than run.
   */
  resolved?: ResolvedScores
): DecisionRecord {
  const startedAt = Date.now();
  const timingsByNode: Record<string, number> = {};
  /** Candidates that fell back because nothing scored them. */
  const missingScoreApplied: string[] = [];

  const byKey = new Map(catalogue.offers.map((p) => [p.key, p]));
  const policyById = new Map(catalogue.targetingPolicies.map((p) => [p.id, p]));
  const connectorById = new Map((catalogue.connectors ?? []).map((c) => [c.id, c]));
  const sourceBindings: SourceBinding[] = [];

  // Initial candidate set, in artifact order so it is reproducible.
  let candidates: Offer[] = artifact.candidateKeys
    .map((k) => byKey.get(k))
    .filter((p): p is Offer => Boolean(p));

  const consent = request.consent ?? { marketing: true, profiling: true, thirdParty: false };
  const eliminations: EliminationStep[] = [];
  const scores: Record<string, CandidateScore> = {};
  const constraintsApplied: string[] = [];
  let winner: string | null = null;
  let runnerUp: string | null = null;

  /**
   * `denials` is passed in rather than derived from the before/after diff.
   *
   * The diff can say which candidates went; only the code that removed them
   * knows why. Deriving here is what produced the node-level prose this
   * replaces.
   */
  /**
   * Resolved once, at the top, and thrown on rather than defaulted.
   *
   * A config naming a function that does not exist is a deployment fault. The
   * alternative — quietly falling back to `multiplicative` — would produce a
   * decision that looks correct, hashes correctly, and was ranked by something
   * other than what the tenant configured. The compiler refuses to publish
   * this case (UNKNOWN_UTILITY_FUNCTION), so reaching here means the artifact
   * bypassed it.
   */
  const utility: UtilityFunction = (() => {
    const found = resolveUtility(catalogue.arbitration.utility);
    if (!found) {
      throw new Error(
        `Unknown ranking function ${utilityKey(catalogue.arbitration.utility)}. ` +
          'Publish is gated on this, so an artifact reaching the engine with one ' +
          'has skipped the compiler.'
      );
    }
    return found;
  })();

  const record = (
    node: ExecNode,
    reason: string,
    after: Offer[],
    denials: Denial[]
  ) => {
    eliminations.push({
      nodeId: node.id,
      nodeType: node.type,
      reason,
      denials: [...denials].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
      survived: after.map((p) => p.key),
    });
  };

  for (const node of topologicalOrder(artifact)) {
    const nodeStart = Date.now();
    const before = candidates;

    switch (node.type) {
      case 'source': {
        // Record which connector was configured to supply which field. The
        // engine does not fetch anything: `resolveInputs` already ran, outside
        // the deterministic core, and the values are in request.input. This is
        // provenance, derived from the artifact and the catalogue, and it is
        // reproducible for exactly that reason.
        for (const connectorId of node.connectorIds ?? []) {
          const connector = connectorById.get(connectorId);
          if (!connector || !connector.active) continue;
          for (const binding of connector.provides) {
            // By path, not by key. A connector declares where its value lands as
            // a path into the profile (ADR-014 §2), and `field in input` asked
            // whether the input had a key literally called
            // `customer.monthly_spend` — which it never does, so every binding
            // was dropped and the trace could attribute nothing (G-069).
            if (readPath(request.input, binding.field) === undefined) continue;
            sourceBindings.push({ field: binding.field, connectorId, nodeId: node.id });
          }
        }

        // Validity and status are intrinsic to the candidate set: a retired or
        // out-of-window offer was never really a candidate. Status is checked
        // first, so a retired offer that is also out of window is reported as
        // retired — the more fundamental fact, and the one that has to change
        // first.
        const sourceDenials: Denial[] = [];
        candidates = before.filter((p) => {
          if (p.status !== 'active') {
            sourceDenials.push({ key: p.key, code: 'NOT_ACTIVE', ruleId: null });
            return false;
          }
          if (!withinValidity(p, request.occurredAt)) {
            sourceDenials.push({ key: p.key, code: 'OUT_OF_VALIDITY_WINDOW', ruleId: null });
            return false;
          }
          return true;
        });

        const sourced = node.connectorIds?.length
          ? ` Fields from ${node.connectorIds.length} connector(s): ${sourceBindings
              .filter((b) => b.nodeId === node.id)
              .map((b) => b.field)
              .join(', ') || 'none resolved'}.`
          : '';

        record(
          node,
          (candidates.length === before.length
            ? `Loaded profile for ${request.customerId}. All ${before.length} candidates are active and in their validity window.`
            : `Loaded profile for ${request.customerId}. Removed ${before.length - candidates.length} candidate(s) that were retired, paused or outside their validity window.`) +
            sourced,
          candidates,
          sourceDenials
        );
        break;
      }

      case 'filter':
      case 'constraint': {
        const policies = (node.policyIds ?? [])
          .map((id) => policyById.get(id))
          .filter((p): p is TargetingPolicy => Boolean(p) && p!.active);

        const denials: Denial[] = [];

        // The first failing policy is the one recorded. A candidate can breach
        // several at once, and reporting all of them would be honest but not
        // useful: the answer to "why not this offer" is one thing to fix, and
        // policy order is the artifact's own declared order, so the choice is
        // deterministic rather than arbitrary.
        candidates = before.filter((p) => {
          const failed = policies.find((policy) => {
            // A policy only applies where its scope covers the candidate, and
            // where the candidate has opted into it.
            if (!scopeCovers(policy.scope, p)) return false;
            if (!p.policyIds.includes(policy.id) && policy.scope.level === 'offer') {
              return false;
            }
            return !policyPasses(policy, request.input);
          });
          if (failed) {
            denials.push({ key: p.key, code: KIND_CODE[failed.kind], ruleId: failed.id });
            return false;
          }
          return true;
        });

        // Frequency policy and consent are enforced at constraint nodes only.
        if (node.type === 'constraint') {
          const used = request.contactHistory?.withinPeriod ?? {};

          // A frequency policy binds to a scope, exactly like an engagement
          // policy. Applying them all to every candidate is wrong: a
          // once-a-month cooldown scoped to one category would otherwise suppress
          // the entire catalogue.
          const relevantTo = (p: Offer) =>
            catalogue.frequencyPolicies.filter(
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
            candidates = candidates.filter((p) => {
              const exempt = relevantTo(p).some(
                (c) => c.maxContacts >= SERVICE_EXEMPT_THRESHOLD
              );
              if (!exempt) {
                denials.push({ key: p.key, code: 'CONSENT_WITHHELD', ruleId: null });
              }
              return exempt;
            });
          } else {
            candidates = candidates.filter((p) => {
              const breached = relevantTo(p).filter(
                (c) => (used[c.period] ?? 0) >= c.maxContacts
              );
              if (breached.length > 0) {
                // The first breached cap, in catalogue order. Naming which one
                // is the difference between "we contacted them too much" and a
                // policy someone can go and look at.
                denials.push({
                  key: p.key,
                  code: 'FREQUENCY_CAP_BREACHED',
                  ruleId: breached[0].id,
                });
              }
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
          candidates,
          denials
        );
        break;
      }

      // `score-adaptive` is retained here and refused by the compiler. A case in
      // `docs/conformance/decision-corpus.json` recorded on 2026-09-05 carries
      // it inside its hashed eliminations, so deleting the node type would move
      // a chain hash that is a statement about something that happened. History
      // replays; nothing new can use it. See ADR-009 §7 and G-012.
      case 'score-model':
      case 'score-adaptive': {
        const modelKey = modelKeyOf(node);
        // Resolved before the core ran, or resolved here when the scorer is
        // pure. A model-backed scorer reaches the network and the core opens no
        // sockets, so it must have been resolved by the caller — ADR-009 §2.
        const scorer = scorerFor(node);
        const byOffer = resolved?.get(modelKey);
        if (!byOffer && !scorer.pure) throw new ScoresNotResolved(node.id, scorer.id);
        for (const p of candidates) {
          const propensity =
            byOffer?.get(p.key) ??
            scorer.score({
              tenantId: request.tenantId,
              customerId: request.customerId,
              offerKey: p.key,
              modelKey,
            });
          const value = round(Math.max(0.01, p.financials.expectedMargin.amount / 60000), 6);
          const boost = effectiveBoost(catalogue.boosts, p, request.occurredAt);
          const context = round(
            0.4 + seededUnitInterval(request.channel, p.key, request.placement) * 0.6,
            6
          );
          // Normalised on the same scale as value, so a function can subtract
          // one from the other and get a number that means something.
          const cost = round(Math.max(0, p.financials.cost.amount / 60000), 6);
          scores[p.key] = { propensity, value, boost, context, cost, priority: 0 };
        }
        // Scoring never removes a candidate, so there is nothing to deny.
        //
        // The sentence says what kind of scorer ran, because the trace is the
        // artefact this project asks people to trust literally and it used to
        // read "Scored 3 candidate(s) with adm_accept_v4@4.2.0" while the
        // propensity was a seeded function. Nobody wrote a false claim; a
        // pinned id that looks like a trained model made one anyway. When the
        // model gateway lands (W-029) this sentence changes, which is correct:
        // by then it will be describing something else.
        record(
          node,
          `Scored ${candidates.length} candidate(s) with ${modelKey} — a pinned deterministic function, not a trained model (W-029).`,
          candidates,
          []
        );
        break;
      }

      case 'arbitrate': {
        const w = catalogue.arbitration.weights;

        // A candidate with no model score is not disqualified. Some flows
        // legitimately rank without a propensity model - anonymous web traffic
        // has no customer to score - and their formula says so.
        //
        // What stands in is the flow's *approved* default where it declares
        // one, and a neutral 1.0 where it does not. Neutral is correct
        // arithmetic - under exponentiation a missing term is 1, not 0 - but
        // it is a number nobody chose, and "the engine assumes 1.0" is not an
        // answer to why an unscored offer outranked a scored one.
        const approvedDefault = artifact.missingScoreDefault ?? null;
        for (const p of candidates) {
          if (scores[p.key]) continue;
          missingScoreApplied.push(p.key);
          scores[p.key] = {
            propensity: approvedDefault ? approvedDefault.propensity : 1,
            value: round(Math.max(0.01, p.financials.expectedMargin.amount / 60000), 6),
            boost: effectiveBoost(catalogue.boosts, p, request.occurredAt),
            context: approvedDefault ? approvedDefault.context : 1,
            // Cost is a catalogue fact, not a model output, so it is known
            // even when nothing scored this candidate. Neutral here means the
            // real number, not 1.
            cost: round(Math.max(0, p.financials.cost.amount / 60000), 6),
            priority: 0,
          };
        }

        for (const p of candidates) {
          const s = scores[p.key];
          if (!s) continue;
          // Rounding stays here rather than inside the evaluator: it is a
          // property of how this engine records a priority, not of the
          // arithmetic the function describes, and moving it would make the
          // same function round differently in a different caller.
          s.priority = round(
            evaluateUtility(
              utility,
              {
                propensity: s.propensity,
                value: s.value,
                boost: s.boost,
                context: s.context,
                cost: s.cost,
              },
              w
            ),
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

        // Everyone who reached ranking and did not win. NOT_RANKED is not a
        // fault: these candidates passed every gate and were simply beaten, so
        // the code has to be distinguishable from the ones that mean something
        // was wrong.
        record(
          node,
          winner
            ? `Ranked ${ranked.length} finalist(s) by ${catalogue.arbitration.formula}. Winner: ${winner}.`
            : 'No candidates reached arbitration; decision returned no offer.',
          candidates,
          before
            .filter((p) => !candidates.includes(p))
            .map((p) => ({ key: p.key, code: 'NOT_RANKED' as const, ruleId: null }))
        );
        break;
      }

      case 'switch':
      case 'explain-annotate':
        record(node, `${node.label} passed ${before.length} candidate(s) through.`, candidates, []);
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

  const winnerOffer = winner ? byKey.get(winner) ?? null : null;

  const decision: DeterministicDecision = {
    tenantId: request.tenantId,
    artifactId: artifact.id,
    artifactVersion: artifact.version,
    customerRef: request.customerId,
    occurredAt: request.occurredAt,
    channel: request.channel,
    placement: request.placement,
    inputSnapshotHash: hash(request.input),
    catalogueSnapshotHash: catalogueHash(catalogue),
    sourceBindings: [...sourceBindings].sort(
      (a, b) =>
        a.field.localeCompare(b.field) ||
        a.connectorId.localeCompare(b.connectorId) ||
        a.nodeId.localeCompare(b.nodeId)
    ),
    packageVersions: artifact.packageVersions,
    // Explicitly null rather than omitted when the artifact pins none: a
    // decision that cannot name its model should say so (ADR-014 §2).
    schema: artifact.schema ?? null,
    candidateKeys: artifact.candidateKeys,
    eliminations,
    scores,
    arbitration: {
      formula: catalogue.arbitration.formula,
      utility: { id: utility.id, version: utility.version },
      missingScore: {
        // Sorted so the record is stable, and de-duplicated because a
        // candidate cannot fall back twice.
        applied: [...new Set(missingScoreApplied)].sort(),
        approved: artifact.missingScoreDefault ?? null,
      },
      winner,
      runnerUp,
    },
    constraintsApplied: [...new Set(constraintsApplied)].sort(),
    consentState: consent,
    winner,
    winnerOfferId: winnerOffer?.id ?? null,
  };

  // One hash, used twice. `shortHash` is a prefix of `hash`, so computing both
  // canonicalised and sha256'd the entire decision twice per call — and at 400
  // candidates that object carries a score and an elimination entry for every
  // one of them. Serialisation and hashing were 71% of execution time.
  const chainHash = hash(decision);

  return {
    // Content-addressed: the same decision computed twice carries the same id.
    id: `dec_${chainHash.slice(0, 16)}`,
    decision,
    measured: {
      timingsByNode,
      totalMs: round(Date.now() - startedAt, 3),
      executedAt: new Date().toISOString(),
      // Echoed, not generated. If the caller sent no correlation id there is
      // nothing to correlate, and inventing one would put a value in the trace
      // that appears nowhere in their logs.
      ...(request.correlationId === undefined
        ? {}
        : { correlationId: request.correlationId }),
    },
    chainHash,
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
  trace: DecisionRecord,
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


