/**
 * Types for the deterministic execution core.
 *
 * The central design decision: a trace is split into a deterministic part and
 * a measured part.
 *
 *   DecisionRecord.decision  - what was decided and why. Reproducible.
 *   DecisionRecord.measured  - how long it took. Not reproducible, by nature.
 *
 * Only the deterministic part is hashed into `chainHash`, and only that part is
 * compared on replay. The previous executor hashed wall-clock timings into the
 * trace, which meant two runs of the same decision could never match - the
 * platform's central claim was false by construction.
 */

import type {
  Offer,
  TargetingPolicy,
  FrequencyPolicy,
  ArbitrationConfig,
  Boost,
  Connector,
  SourceBinding,
  SourceCall,
} from '@metis/core/domain';

/** Node kinds the engine can execute. Mirrors what the canvas renders. */
export type ExecNodeType =
  | 'source'
  | 'filter'
  | 'constraint'
  | 'score-model'
  | 'score-adaptive'
  | 'switch'
  | 'explain-annotate'
  | 'arbitrate';

export interface ExecNode {
  id: string;
  type: ExecNodeType;
  label: string;
  /** Targeting policies this node evaluates. */
  policyIds?: string[];
  /** Pinned model, for score nodes. Pinning is what makes replay possible. */
  model?: { id: string; version: string };
  /** Frequency policies this node enforces, for constraint nodes. */
  frequencyPolicyIds?: string[];
  /**
   * Connectors this node draws on, for source nodes.
   *
   * The engine never calls them - `resolveInputs` does, before execution, and
   * the values arrive in `request.input`. What the engine does with these is
   * record which connector was configured to supply which field, so the trace
   * can answer "where did this credit score come from".
   */
  connectorIds?: string[];
}

export interface ExecEdge {
  from: string;
  to: string;
}

/** A compiled, immutable flow. Everything needed to reproduce a decision. */
export interface ExecArtifact {
  id: string;
  version: string;
  tenantId: string;
  nodes: ExecNode[];
  edges: ExecEdge[];
  /** Offer keys forming the initial candidate set. */
  candidateKeys: string[];
  /** Package versions pinned at compile time. */
  packageVersions: Record<string, string>;
}

/**
 * The catalogue as it stood when the decision was made.
 *
 * Passed in rather than read from a live store, because replaying against
 * today's catalogue would reproduce today's answer, not the original one.
 */
export interface CatalogueSnapshot {
  offers: Offer[];
  targetingPolicies: TargetingPolicy[];
  frequencyPolicies: FrequencyPolicy[];
  arbitration: ArbitrationConfig;
  boosts: Boost[];
  /**
   * Configured integrations.
   *
   * Part of the snapshot, and therefore part of the catalogue hash: changing a
   * connector's field mapping changes what decisions see, so it has to change
   * the hash too. A connector list that lived outside the snapshot would let
   * the same hash describe two different decisions.
   */
  connectors: Connector[];
}

export interface DecisionRequest {
  tenantId: string;
  customerId: string;
  channel: string;
  placement: string;
  /**
   * When the decision is considered to have happened.
   *
   * An explicit input, never read from the system clock, so a replay lands on
   * the same validity windows and the same answer.
   */
  occurredAt: string;
  /** Customer and context attributes the policies are evaluated against. */
  input: Record<string, unknown>;
  /** Prior contact counts, for frequency-policy enforcement. */
  contactHistory?: { channel: string; withinPeriod: Record<string, number> };
  consent?: { marketing: boolean; profiling: boolean; thirdParty: boolean };
}

export interface EliminationStep {
  nodeId: string;
  nodeType: ExecNodeType;
  reason: string;
  eliminated: string[];
  survived: string[];
}

export interface CandidateScore {
  propensity: number;
  value: number;
  boost: number;
  context: number;
  priority: number;
}

/** The reproducible half of a trace. */
export interface DeterministicDecision {
  tenantId: string;
  artifactId: string;
  artifactVersion: string;
  customerRef: string;
  occurredAt: string;
  channel: string;
  placement: string;
  inputSnapshotHash: string;
  catalogueSnapshotHash: string;
  /**
   * Which connector was configured to supply which input field.
   *
   * Reproducible, so it belongs in the hashed half: it is derived from the
   * artifact and the catalogue snapshot, both already pinned. It is redundant
   * in the strict sense and kept anyway, because "the credit score came from
   * the bureau connector, at this node" is precisely the question a compliance
   * officer asks, and reconstructing it from two other hashes is not an answer.
   *
   * The *values* are not here. They are in the input snapshot, which is hashed
   * but never stored, so a trace can be kept without keeping the customer data
   * it was made from.
   */
  sourceBindings: SourceBinding[];
  packageVersions: Record<string, string>;
  candidateKeys: string[];
  eliminations: EliminationStep[];
  scores: Record<string, CandidateScore>;
  arbitration: { formula: string; winner: string | null; runnerUp: string | null };
  constraintsApplied: string[];
  consentState: { marketing: boolean; profiling: boolean; thirdParty: boolean };
  winner: string | null;
  winnerOfferId: string | null;
}

/** The measured half. Observability only - never hashed, never replayed. */
export interface Measurements {
  timingsByNode: Record<string, number>;
  totalMs: number;
  executedAt: string;
  /**
   * What the integrations actually did: latency, cache hits, failures.
   *
   * Measured by definition, and so kept well away from the hash. Whether the
   * bureau answered from cache in 2ms or from the wire in 180ms changes nothing
   * about what was decided, and a replay six months later must not be judged
   * against today's cache state.
   *
   * Absent on a replayed trace, because replay calls no connectors.
   */
  sourceCalls?: SourceCall[];
}

export interface DecisionRecord {
  id: string;
  decision: DeterministicDecision;
  measured: Measurements;
  /** sha256 over `decision` alone. */
  chainHash: string;
}

export interface ReplayResult {
  identical: boolean;
  decisionId: string;
  originalChainHash: string;
  replayedChainHash: string;
  /** Populated only when the two differ. */
  differences: { path: string; original: unknown; replayed: unknown }[];
}
