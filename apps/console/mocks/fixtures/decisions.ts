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
import { generated, type GeneratedDecision } from './engine';
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
  totalMs: number;
}

export interface TraceRecord extends DecisionRecord {
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

export const traces: TraceRecord[] = generated.map(toTrace);

export const decisions: DecisionRecord[] = traces.map((t) => ({
  id: t.id,
  artifactId: t.artifactId,
  artifactVersion: t.artifactVersion,
  tenantId: t.tenantId,
  customerId: t.customerId,
  timestamp: t.timestamp,
  channel: t.channel,
  placement: t.placement,
  winner: t.winner,
  winnerOfferId: t.winnerOfferId,
  candidateCount: t.candidateCount,
  totalMs: t.totalMs,
}));

const byId = new Map(traces.map((t) => [t.id, t]));

export function findTrace(id: string): TraceRecord | undefined {
  return byId.get(id);
}
