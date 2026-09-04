/**
 * Decision and trace records, adapted from real engine output.
 *
 * Nothing here is authored. Every field is derived from a DecisionTrace that
 * `@metis/runtime` actually produced - see ./engine.ts. This module's only job
 * is to flatten the engine's shape (which separates the reproducible decision
 * from the measured timings) into the flat records the console renders.
 *
 * The separation is preserved where it matters: `chainHash` covers the
 * decision only, so it is stable across runs, while `totalMs` and `timings`
 * are measurements and are not.
 */

import { treatments } from './catalogue';
import { generated, type GeneratedDecision } from './engine';

export interface EliminationStep {
  nodeId: string;
  nodeType: string;
  reason: string;
  eliminated: string[];
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
  winnerPropositionId: string | null;
  candidateCount: number;
  totalMs: number;
}

export interface TraceRecord extends DecisionRecord {
  eliminations: EliminationStep[];
  scores: Record<
    string,
    { propensity: number; value: number; lever: number; context: number; priority: number }
  >;
  arbitration: { formula: string; winner: string | null; runnerUp: string | null };
  timings: Record<string, number>;
  constraintsApplied: string[];
  consentState: { marketing: boolean; profiling: boolean; thirdParty: boolean };
  treatmentId: string | null;
  /** sha256 over the reproducible half of the decision. */
  chainHash: string;
  inputSnapshotHash: string;
}

/** Pick the treatment that would actually have been delivered on this channel. */
function resolveTreatment(propositionId: string | null, channel: string): string | null {
  if (!propositionId) return null;
  const forChannel = treatments.find(
    (t) => t.propositionId === propositionId && t.channel === channel && t.active
  );
  if (forChannel) return forChannel.id;
  // No treatment for the winning channel is a real condition the console
  // surfaces, so fall back rather than inventing one.
  return treatments.find((t) => t.propositionId === propositionId && t.active)?.id ?? null;
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
    winnerPropositionId: d.winnerPropositionId,
    candidateCount: d.candidateKeys.length,
    totalMs: trace.measured.totalMs,
    eliminations: d.eliminations,
    scores: d.scores,
    arbitration: d.arbitration,
    timings: trace.measured.timingsByNode,
    constraintsApplied: d.constraintsApplied,
    consentState: d.consentState,
    treatmentId: resolveTreatment(d.winnerPropositionId, d.channel),
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
  winnerPropositionId: t.winnerPropositionId,
  candidateCount: t.candidateCount,
  totalMs: t.totalMs,
}));

const byId = new Map(traces.map((t) => [t.id, t]));

export function findTrace(id: string): TraceRecord | undefined {
  return byId.get(id);
}
