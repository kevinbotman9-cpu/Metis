/**
 * Decision and trace records, adapted from real engine output.
 *
 * Nothing here is authored. Every field is derived from a DecisionRecord that
 * `@metis/runtime` actually produced - see ./engine.ts. This module's only job
 * is to flatten the engine's shape (which separates the reproducible decision
 * from the measured timings) into the flat records the console renders.
 *
 * The separation is preserved where it matters: `chainHash` covers the
 * decision only, so it is stable across runs, while `totalMs` and `timings`
 * are measurements and are not.
 */

import { creatives, connectors } from './catalogue';
import { executeAt, type GeneratedDecision } from './engine';
import index from './decision-index.json';
import type { SourceBinding, SourceCall } from '@metis/core/domain';

export interface Denial {
  key: string;
  code: string;
  ruleId: string | null;
}

export interface EliminationStep {
  nodeId: string;
  nodeType: string;
  reason: string;
  denials: Denial[];
  survived: string[];
}

export interface DecisionRecord {
  id: string;
  artifactId: string;
  artifactVersion: string;
  tenantId: string;
  customerId: string;
  timestamp: string;
  channel: string;
  placement: string;
  winner: string | null;
  winnerOfferId: string | null;
  candidateCount: number;
}

export interface TraceRecord extends DecisionRecord {
  /**
   * Measured when this trace was executed — here, when it was re-executed on
   * being opened. Not on the flat row: a frozen stopwatch reading in a committed
   * index changed on every regeneration and was shown as platform latency
   * (G-052).
   */
  totalMs: number;
  eliminations: EliminationStep[];
  scores: Record<
    string,
    { propensity: number; value: number; boost: number; context: number; priority: number }
  >;
  arbitration: { formula: string; winner: string | null; runnerUp: string | null };
  timings: Record<string, number>;
  constraintsApplied: string[];
  consentState: { marketing: boolean; profiling: boolean; thirdParty: boolean };
  creativeId: string | null;
  /** Which connector supplied which field. Reproducible. */
  sourceBindings: SourceBinding[];
  /**
   * What the integrations did on the wire.
   *
   * Reconstructed here from the connector's declared latency, because the
   * corpus records resolution rather than performing it. On the live decision
   * path these are measured. Either way they stay out of the hash.
   */
  sourceCalls: SourceCall[];
  /** sha256 over the reproducible half of the decision. */
  chainHash: string;
  inputSnapshotHash: string;
}

/** Pick the creative that would actually have been delivered on this channel. */
function resolveCreative(offerId: string | null, channel: string): string | null {
  if (!offerId) return null;
  const forChannel = creatives.find(
    (t) => t.offerId === offerId && t.channel === channel && t.active
  );
  if (forChannel) return forChannel.id;
  // No creative for the winning channel is a real condition the console
  // surfaces, so fall back rather than inventing one.
  return creatives.find((t) => t.offerId === offerId && t.active)?.id ?? null;
}

/**
 * The call record for a set of bindings.
 *
 * The 5,000-decision corpus is built synchronously and records what resolution
 * produced rather than performing it, so latency here comes from the
 * connector's own declaration rather than a stopwatch. Stated plainly because
 * a measured-looking number that was not measured is worse than none.
 */
function sourceCallsFor(bindings: SourceBinding[]): SourceCall[] {
  const byConnector = new Map<string, string[]>();
  for (const b of bindings) {
    byConnector.set(b.connectorId, [...(byConnector.get(b.connectorId) ?? []), b.field]);
  }
  return [...byConnector.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([connectorId, fields]) => {
      const connector = connectors.find((c) => c.id === connectorId);
      return {
        connectorId,
        ms: connector?.declaredP95Ms ?? 0,
        cacheHit: (connector?.cacheTtlSeconds ?? 0) > 0,
        outcome: 'ok' as const,
        fields: fields.sort(),
      };
    });
}

/**
 * The engine's record, in the shape the spec declares.
 *
 * Two types are called `DecisionRecord` in this repository: `@metis/runtime`'s,
 * which is what the engine emits and what the ledger stores whole, and the
 * OpenAPI one, which is flat and is what every console screen reads. This is
 * the projection between them.
 *
 * It was applied to seeded decisions and not to live ones until 2026-09-09,
 * so `GET /decisions/{id}/trace` answered 200 with `{ id, decision: {...} }`
 * for anything the storefront had decided and the page threw reading
 * `trace.scores`. `contract.spec.ts` did not catch it because it exercised the
 * seeded branch, which was correct. Exported so the ledger branch can use the
 * same one function rather than a second projection that would drift from it.
 */
export function toApiTrace(record: GeneratedDecision['trace']): TraceRecord {
  return toTrace({ trace: record } as GeneratedDecision);
}

function toTrace({ trace }: GeneratedDecision): TraceRecord {
  const d = trace.decision;
  return {
    id: trace.id,
    artifactId: d.artifactId,
    artifactVersion: d.artifactVersion,
    tenantId: d.tenantId,
    customerId: d.customerRef,
    timestamp: d.occurredAt,
    channel: d.channel,
    placement: d.placement,
    winner: d.winner,
    winnerOfferId: d.winnerOfferId,
    candidateCount: d.candidateKeys.length,
    totalMs: trace.measured.totalMs,
    eliminations: d.eliminations,
    scores: d.scores,
    arbitration: d.arbitration,
    timings: trace.measured.timingsByNode,
    constraintsApplied: d.constraintsApplied,
    consentState: d.consentState,
    creativeId: resolveCreative(d.winnerOfferId, d.channel),
    sourceBindings: d.sourceBindings,
    sourceCalls: sourceCallsFor(d.sourceBindings),
    chainHash: trace.chainHash,
    inputSnapshotHash: d.inputSnapshotHash,
  };
}

/**
 * The flat rows, read from the committed index.
 *
 * This is what the grid, the search, the facets and every chart use, and it is
 * all they need. It is generated by `scripts/build-decision-index.mjs` from the
 * same deterministic engine that produces the traces below, so a row and its
 * trace are the same decision — `tests/unit/decision-index.test.ts` is what
 * holds that true.
 */
export const decisions: DecisionRecord[] = (index.rows as unknown[][]).map((row) => ({
  id: row[1] as string,
  artifactId: row[2] as string,
  artifactVersion: row[3] as string,
  tenantId: 'telco-uk',
  customerId: row[4] as string,
  timestamp: row[5] as string,
  channel: row[6] as string,
  placement: row[7] as string,
  winner: row[8] as string | null,
  winnerOfferId: row[9] as string | null,
  candidateCount: row[10] as number,
}));

/**
 * Where in the generator each decision came from.
 *
 * Carried as a column rather than derived. The index is sorted newest-first for
 * display and the generator is ordered by seed, so deriving this meant
 * executing all 10,400 to learn their ids — fourteen seconds on the first
 * trace anybody opened, which is the cost this whole file exists to avoid.
 */
const slotById = new Map(
  (index.rows as unknown[][]).map((row) => [row[1] as string, row[0] as number])
);

const slotFor = (id: string): number | undefined => slotById.get(id);

const traceCache = new Map<string, TraceRecord>();

/**
 * The full cascade for one decision, re-executed on demand.
 *
 * Costs about 0.6ms. Holding all 10,400 instead would cost 80 MB and thirteen
 * seconds at every import, to answer a question asked of one decision at a time.
 */
export function findTrace(id: string): TraceRecord | undefined {
  const cached = traceCache.get(id);
  if (cached) return cached;

  const slot = slotFor(id);
  if (slot === undefined) return undefined;

  const trace = toTrace(executeAt(slot));
  traceCache.set(id, trace);
  return trace;
}

/**
 * A deterministic sample of full traces.
 *
 * For checks that need to hold over many decisions rather than one. Every
 * caller that used to iterate `traces` wants this: the invariants are
 * properties of the generator, and a fixed slice of it either has them or does
 * not. `n` executions cost about 0.6ms each.
 */
export function findGeneratedDecision(id: string): GeneratedDecision | undefined {
  const slot = slotFor(id);
  return slot === undefined ? undefined : executeAt(slot);
}

export function sampleTraces(n: number): TraceRecord[] {
  const step = Math.max(1, Math.floor(decisions.length / n));
  const out: TraceRecord[] = [];
  for (let i = 0; i < decisions.length && out.length < n; i += step) {
    out.push(toTrace(executeAt(i)));
  }
  return out;
}

