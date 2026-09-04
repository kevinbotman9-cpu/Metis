/**
 * Types for the deterministic execution core.
 *
 * The central design decision: a trace is split into a deterministic part and
 * a measured part.
 *
 *   DecisionTrace.decision  - what was decided and why. Reproducible.
 *   DecisionTrace.measured  - how long it took. Not reproducible, by nature.
 *
 * Only the deterministic part is hashed into `chainHash`, and only that part is
 * compared on replay. The previous executor hashed wall-clock timings into the
 * trace, which meant two runs of the same decision could never match - the
 * platform's central claim was false by construction.
 */

import type {
  Proposition,
  EngagementPolicy,
  ContactPolicy,
  ArbitrationConfig,
  Lever,
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
  /** Engagement policies this node evaluates. */
  policyIds?: string[];
  /** Pinned model, for score nodes. Pinning is what makes replay possible. */
  model?: { id: string; version: string };
  /** Contact policies this node enforces, for constraint nodes. */
  contactPolicyIds?: string[];
}

export interface ExecEdge {
  from: string;
  to: string;
}

/** A compiled, immutable strategy. Everything needed to reproduce a decision. */
export interface ExecArtifact {
  id: string;
  version: string;
  tenantId: string;
  nodes: ExecNode[];
  edges: ExecEdge[];
  /** Proposition keys forming the initial candidate set. */
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
  propositions: Proposition[];
  engagementPolicies: EngagementPolicy[];
  contactPolicies: ContactPolicy[];
  arbitration: ArbitrationConfig;
  levers: Lever[];
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
  /** Prior contact counts, for contact-policy enforcement. */
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
  lever: number;
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
  packageVersions: Record<string, string>;
  candidateKeys: string[];
  eliminations: EliminationStep[];
  scores: Record<string, CandidateScore>;
  arbitration: { formula: string; winner: string | null; runnerUp: string | null };
  constraintsApplied: string[];
  consentState: { marketing: boolean; profiling: boolean; thirdParty: boolean };
  winner: string | null;
  winnerPropositionId: string | null;
}

/** The measured half. Observability only - never hashed, never replayed. */
export interface Measurements {
  timingsByNode: Record<string, number>;
  totalMs: number;
  executedAt: string;
}

export interface DecisionTrace {
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
