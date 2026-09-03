/**
 * Core type definitions for METIS platform
 */

export interface Tenant {
  id: string;
  name: string;
  latencyBudgetMs: number;
  maxNodesPerArtifact: number;
}

export interface CostEstimate {
  computeNodes: number;
  modelInvocations: string[];
  externalCalls: number;
  estimatedP95LatencyMs: number;
  estimatedCostPerThousand: number;
}

export interface PackageVersion {
  id: string;
  version: string;
}

export interface ArtifactMetadata {
  id: string;
  version: string;
  tenantId: string;
  createdAt: string;
  createdBy: string;
  publishedAt?: string;
  publishedBy?: string;
  signature: string;
}

export interface DecisionIR {
  id: string;
  name: string;
  version: string;
  nodes: IRNode[];
  edges: IREdge[];
  entryNode: string;
  exitNodes: string[];
  packageDependencies: Record<string, string>;
}

export interface IRNode {
  id: string;
  type: string;
  label: string;
  packageId?: string;
  packageVersion?: string;
  config: Record<string, unknown>;
  inputs?: Record<string, IRNodeInput>;
  outputs?: Record<string, IRNodeOutput>;
}

export interface IRNodeInput {
  name: string;
  type: string;
  required: boolean;
}

export interface IRNodeOutput {
  name: string;
  type: string;
}

export interface IREdge {
  from: string;
  to: string;
  fromOutput?: string;
  toInput?: string;
}

export interface CompiledArtifact {
  id: string;
  version: string;
  metadata: ArtifactMetadata;
  dirSchema: DecisionIR;
  packageVersions: Record<string, string>;
  costManifest: CostEstimate;
  binary: Buffer;
  signature: string;
}

export interface DecisionRequest {
  tenantId: string;
  strategyName: string;
  version?: string;
  customerId: string;
  context: Record<string, unknown>;
}

export interface DecisionCandidate {
  actionId: string;
  score: number;
  features: Record<string, unknown>;
}

export interface DecisionResponse {
  decisionId: string;
  decision: {
    winner?: string;
    candidates: DecisionCandidate[];
  };
  trace: DecisionTrace;
  cost: CostBreakdown;
}

export interface DecisionTrace {
  decisionId: string;
  tenantId: string;
  customerRef: string;
  artifactVersion: string;
  packageVersions: Record<string, string>;
  inputSnapshotHash: string;
  candidateSet: TraceCandidate[];
  eliminations: TraceElimination[];
  scores: TraceScore[];
  arbitration: TraceArbitration;
  constraintsApplied: TraceConstraint[];
  consentState: Record<string, boolean>;
  complianceChecks: TraceCompliance[];
  timingsByNode: Record<string, number>;
  totalMs: number;
  chainHash: string;
  prevHash?: string;
}

export interface TraceCandidate {
  actionId: string;
  enteredAtNode: string;
  score?: number;
}

export interface TraceElimination {
  actionId: string;
  nodeId: string;
  ruleId: string;
  reasonCode: string;
  humanReason: string;
}

export interface TraceScore {
  actionId: string;
  component: 'propensity' | 'value' | 'context' | 'lever';
  value: number;
  modelVersion?: string;
  topFeatures?: string[];
}

export interface TraceArbitration {
  formulaVersion: string;
  ranked: string[];
  winner?: string;
}

export interface TraceConstraint {
  nodeId: string;
  constraintId: string;
  applied: boolean;
  reason?: string;
}

export interface TraceCompliance {
  checkId: string;
  passed: boolean;
  reason?: string;
}

export interface CostBreakdown {
  computeMs: number;
  modelServingMs: number;
  dataEgressBytes: number;
  authroringAmortisedMs?: number;
  totalMs: number;
  estimatedCostPerThousand?: number;
}
