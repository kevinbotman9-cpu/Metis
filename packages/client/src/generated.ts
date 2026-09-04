/**
 * GENERATED FROM docs/metis-api.openapi.yaml — DO NOT EDIT.
 *
 * Regenerate with:  npm run generate -w @metis/client
 *
 * Spec version 2.0.0. CI fails if this file and the spec disagree,
 * so an edit here is reverted by the next build; change the spec instead.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// --- Schemas ----------------------------------------------------------------

export interface CompiledArtifact {
  /** Artifact ID */
  id?: string;
  /** Semantic version */
  version?: string;
  metadata?: {
    id?: string;
    version?: string;
    tenantId?: string;
    createdAt?: string;
    createdBy?: string;
    signature?: string;
  };
  /** Decision Intermediate Representation */
  dirSchema?: Record<string, unknown>;
  costManifest?: {
    computeNodes?: number;
    modelInvocations?: string[];
    externalCalls?: number;
    estimatedP95LatencyMs?: number;
  };
  signature?: string;
}

export interface Money {
  /** Minor units, e.g. pence. 3500 = 35.00 */
  amount: number;
  currency: "GBP" | "USD" | "EUR";
}

export interface Issue {
  id: string;
  name: string;
  /** URL-safe stable key, e.g. "retention" */
  key: string;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  issueId: string;
  name: string;
  key: string;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ValidityWindow {
  startsAt: string;
  /** null means open-ended */
  endsAt: string | null;
}

export interface PropositionFinancials {
  price: Money;
  cost: Money;
  expectedMargin: Money;
  termMonths: number;
  oneOff: boolean;
}

export interface Proposition {
  id: string;
  groupId: string;
  /** Denormalised from the group for tree and breadcrumb rendering */
  issueId: string;
  name: string;
  key: string;
  description: string;
  status: "draft" | "active" | "paused" | "retired";
  financials: PropositionFinancials;
  validity: ValidityWindow;
  /** Business priority multiplier. 1.0 is neutral. */
  lever: number;
  policyIds: string[];
  treatmentIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Treatment {
  id: string;
  propositionId: string;
  name: string;
  channel: "email" | "sms" | "web" | "push" | "outbound_call";
  /** Channel-specific content; shape is discriminated by channel */
  content: Record<string, unknown>;
  active: boolean;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyScope {
  level: "tenant" | "issue" | "group" | "proposition";
  /** null when level is tenant */
  targetId: string | null;
}

export interface PolicyCondition {
  /** Dotted path into the customer data model */
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "contains" | "exists" | "not_exists";
  value: unknown;
}

export interface EngagementPolicy {
  id: string;
  name: string;
  /** eligibility = can we offer it; applicability = should we now; suitability = is it right for this customer */
  kind: "eligibility" | "applicability" | "suitability";
  description: string;
  conditions: PolicyCondition[];
  scope: PolicyScope;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactPolicy {
  id: string;
  name: string;
  description: string;
  /** null applies to every channel */
  channel: "email" | "sms" | "web" | "push" | "outbound_call" | null;
  maxContacts: number;
  period: "day" | "week" | "month";
  cooldownDaysAfterReject: number;
  scope: PolicyScope;
  active: boolean;
}

export interface ArbitrationConfig {
  id: string;
  tenantId: string;
  /** Exponent weights for Priority = P^wP x V^wV x L^wL x C^wC */
  weights: {
    propensity: number;
    value: number;
    lever: number;
    context: number;
  };
  formula: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Lever {
  id: string;
  name: string;
  scope: PolicyScope;
  /** Multiplier. 1.0 is neutral. */
  value: number;
  reason: string;
  validity: ValidityWindow | null;
  updatedAt: string;
  updatedBy: string;
}

export interface AutonomyGuardrails {
  maxBlastRadiusPct: number;
  allowedChangeTypes: ("lever_adjust" | "treatment_copy" | "policy_edit" | "proposition_create" | "proposition_retire" | "strategy_edit" | "arbitration_weights")[];
  /** Fraction. 0.1 permits +/-10%. */
  maxLeverDelta: number;
  maxBudgetDelta: Money;
  protectedAttributes: string[];
  requireSimulationPass: boolean;
  biasGateThreshold: number;
}

export interface AutonomySetting {
  id: string;
  scope: PolicyScope;
  /** L0 Observe, L1 Assist, L2 Propose, L3 Bounded, L4 Autonomous. Resolved most-specific-first: proposition > group > issue > tenant. */
  level: "L0" | "L1" | "L2" | "L3" | "L4";
  guardrails: AutonomyGuardrails;
  /** Why this scope was granted this level. Required for audit. */
  rationale: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AgentActivity {
  id: string;
  timestamp: string;
  agentId: string;
  level: "L0" | "L1" | "L2" | "L3" | "L4";
  scope: PolicyScope;
  changeType: "lever_adjust" | "treatment_copy" | "policy_edit" | "proposition_create" | "proposition_retire" | "strategy_edit" | "arbitration_weights";
  summary: string;
  outcome: "suggested" | "proposed" | "auto_applied" | "reverted" | "blocked";
  guardrailBreached: string | null;
  changeRequestId: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: ("architect" | "marketer" | "compliance" | "analyst" | "operator" | "admin")[];
  permissions: string[];
  tenantId: string;
}

/** One node's verdict on the candidate set, in execution order. */
export interface Elimination {
  nodeId: string;
  nodeType: string;
  reason: string;
  eliminated: string[];
  survived: string[];
}

/** The four arbitration terms and the priority they produce. */
export interface ScoreBreakdown {
  propensity: number;
  value: number;
  lever: number;
  context: number;
  priority: number;
}

export interface ConsentState {
  marketing: boolean;
  profiling: boolean;
  thirdParty: boolean;
}

/** A decision as it appears in search results, without the trace. */
export interface Decision {
  id: string;
  artifactId: string;
  artifactVersion: string;
  tenantId: string;
  /** Pseudonymised customer reference */
  customerId: string;
  timestamp: string;
  channel: string;
  placement: string;
  /** Action key of the winning candidate, or null if suppressed */
  winner: string | null;
  winnerPropositionId: string | null;
  candidateCount: number;
  totalMs: number;
}

/** A decision plus the full reasoning behind it. Everything here except
`timings` is reproducible: `chainHash` covers only that reproducible
half, which is what makes replay a byte-comparison rather than a
judgement call.
 */
export interface DecisionTrace {
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
  eliminations: Elimination[];
  /** Score breakdown per candidate action key */
  scores: Record<string, ScoreBreakdown>;
  arbitration: {
    formula: string;
    winner: string | null;
    runnerUp: string | null;
  };
  /** Measured, not reproducible. Excluded from the chain hash. */
  timings: Record<string, number>;
  constraintsApplied: string[];
  consentState: ConsentState;
  treatmentId?: string | null;
  /** sha256 over the reproducible half of the decision */
  chainHash: string;
  inputSnapshotHash: string;
}

/** The outcome of re-executing a historical decision. */
export interface ReplayResult {
  /** True when the two chain hashes match exactly */
  identical: boolean;
  decisionId: string;
  replayedAt: string;
  artifactVersion: string;
  originalWinner: string | null;
  replayedWinner: string | null;
  originalChainHash: string;
  replayedChainHash: string;
  /** Empty when identical is true */
  diff: {
    path: string;
    original?: unknown;
    replayed?: unknown;
  }[];
}

/** The whole offer catalogue - Issue > Group > Proposition. */
export interface Taxonomy {
  issues: Issue[];
  groups: Group[];
  propositions: Proposition[];
}

/** A proposition with everything needed to render its page. */
export interface PropositionDetail {
  proposition: Proposition;
  treatments: Treatment[];
  policies: EngagementPolicy[];
  /** Effective autonomy for this scope, or null if none resolves */
  autonomy: AutonomySetting | null;
}

export interface ChangeRequestSimulation {
  ran: boolean;
  passed: boolean;
  populationSize: number;
  projectedMarginDelta: string;
  /** Ratio between best and worst treated group. 1.0 is parity. */
  biasRatio: number;
  notes: string;
}

/** A proposed change awaiting approval, from a person or an agent. */
export interface ChangeRequest {
  id: string;
  title: string;
  description: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  autonomyTier: 1 | 2 | 3;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  targetScope: PolicyScope;
  changeType: string;
  diff: {
    field: string;
    before: string;
    after: string;
  }[];
  simulation: ChangeRequestSimulation | null;
}

/** One entry in the append-only log. Every write produces one. */
export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  actorType: "human" | "agent" | "system";
  eventType: string;
  scope: string;
  summary: string;
  changeRequestId: string | null;
}

/** One compiler finding, with the remedy where there is one. */
export interface Diagnostic {
  severity: "error" | "warning";
  code: string;
  /** Node id the finding attaches to */
  at?: string;
  message: string;
  remedy?: string;
}

/** What the compiler predicts this strategy will cost to run. */
export interface CostManifest {
  nodeCount: number;
  /** Longest path through the DAG, not the sum of all nodes */
  criticalPathMs: number;
  worstCaseMs: number;
  modelInvocations: {
    nodeId: string;
    model: string;
  }[];
  latencyBudgetMs: number;
  withinBudget: boolean;
}

export interface CompileResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  /** Null when compilation failed */
  artifact: {
    packageVersions: Record<string, string>;
    artifactHash: string;
    compiledAt: string;
    costManifest: CostManifest;
  } | null;
}

/** One node in a decision graph. */
export interface DirNode {
  id: string;
  type: string;
  label: string;
  description: string;
  estimatedMs: number;
  policyIds?: string[];
  model?: {
    id: string;
    /** Pinned. An unpinned model fails compilation. */
    version: string;
  };
  formula?: string;
  position: {
    x: number;
    y: number;
  };
}

export interface DirEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

/** A strategy as the console lists and renders it. Distinct from
CompiledArtifact, which is the registry's immutable executable form.
 */
export interface ArtifactSummary {
  id: string;
  name: string;
  description: string;
  activeVersion: string;
  versions: string[];
  nodeCount: number;
  estimatedP95LatencyMs: number;
  status: string;
  candidateKeys: string[];
  nodes: DirNode[];
  edges: DirEdge[];
  updatedAt: string;
  updatedBy: string;
  /** Compile summary. Present on the list endpoint. */
  compileOk?: boolean | null;
  errorCount?: number;
  warningCount?: number;
  /** Full compiler output. Present on the detail endpoint. */
  compilation?: CompileResult | null;
}

// --- Operations -------------------------------------------------------------

/** Every operation the spec declares, keyed by operationId. */
export const OPERATIONS = {
  approveChangeRequest: {
    method: 'POST',
    path: '/change-requests/{requestId}/approve',
    pathParams: ['requestId'],
    queryParams: [],
    statuses: ['200', '403'],
  },
  createChangeRequest: {
    method: 'POST',
    path: '/change-requests',
    pathParams: [],
    queryParams: [],
    statuses: ['201'],
  },
  createProposition: {
    method: 'POST',
    path: '/propositions/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['201', '403'],
  },
  getArbitrationConfig: {
    method: 'GET',
    path: '/arbitration/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200'],
  },
  getArtifact: {
    method: 'GET',
    path: '/registry/{tenantId}/{strategyName}',
    pathParams: ['tenantId', 'strategyName'],
    queryParams: ['version'],
    statuses: ['200', '404'],
  },
  getArtifactSummary: {
    method: 'GET',
    path: '/artifacts/{tenantId}/{artifactId}',
    pathParams: ['tenantId', 'artifactId'],
    queryParams: [],
    statuses: ['200', '404'],
  },
  getChangeRequest: {
    method: 'GET',
    path: '/change-requests/{requestId}',
    pathParams: ['requestId'],
    queryParams: [],
    statuses: ['200', '404'],
  },
  getCounterfactual: {
    method: 'POST',
    path: '/counterfactuals',
    pathParams: [],
    queryParams: [],
    statuses: ['200'],
  },
  getDecisionTrace: {
    method: 'GET',
    path: '/decisions/{decisionId}/trace',
    pathParams: ['decisionId'],
    queryParams: [],
    statuses: ['200', '404'],
  },
  getProposition: {
    method: 'GET',
    path: '/propositions/{tenantId}/{propositionId}',
    pathParams: ['tenantId', 'propositionId'],
    queryParams: [],
    statuses: ['200', '404'],
  },
  getRegistryAuditLog: {
    method: 'GET',
    path: '/registry/{tenantId}/{strategyName}/audit',
    pathParams: ['tenantId', 'strategyName'],
    queryParams: [],
    statuses: ['200'],
  },
  getSession: {
    method: 'GET',
    path: '/auth/session',
    pathParams: [],
    queryParams: [],
    statuses: ['200', '401'],
  },
  getTaxonomy: {
    method: 'GET',
    path: '/taxonomy/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200'],
  },
  listAgentActivity: {
    method: 'GET',
    path: '/agent-activity/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: ['outcome', 'limit'],
    statuses: ['200'],
  },
  listArtifacts: {
    method: 'GET',
    path: '/artifacts/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200'],
  },
  listAuditEvents: {
    method: 'GET',
    path: '/audit',
    pathParams: [],
    queryParams: ['limit'],
    statuses: ['200'],
  },
  listAutonomySettings: {
    method: 'GET',
    path: '/autonomy/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200'],
  },
  listChangeRequests: {
    method: 'GET',
    path: '/change-requests',
    pathParams: [],
    queryParams: ['status'],
    statuses: ['200'],
  },
  listContactPolicies: {
    method: 'GET',
    path: '/contact-policies/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200'],
  },
  listEngagementPolicies: {
    method: 'GET',
    path: '/engagement-policies/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: ['kind'],
    statuses: ['200'],
  },
  listPropositions: {
    method: 'GET',
    path: '/propositions/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: ['issueId', 'groupId', 'status', 'q'],
    statuses: ['200'],
  },
  listTreatments: {
    method: 'GET',
    path: '/treatments/{tenantId}/{propositionId}',
    pathParams: ['tenantId', 'propositionId'],
    queryParams: [],
    statuses: ['200'],
  },
  listVersions: {
    method: 'GET',
    path: '/registry/{tenantId}/{strategyName}/versions',
    pathParams: ['tenantId', 'strategyName'],
    queryParams: [],
    statuses: ['200'],
  },
  login: {
    method: 'POST',
    path: '/auth/login',
    pathParams: [],
    queryParams: [],
    statuses: ['200', '401'],
  },
  promoteVersion: {
    method: 'POST',
    path: '/registry/{tenantId}/{strategyName}/promote',
    pathParams: ['tenantId', 'strategyName'],
    queryParams: [],
    statuses: ['200'],
  },
  publishArtifact: {
    method: 'POST',
    path: '/registry/{tenantId}/{strategyName}',
    pathParams: ['tenantId', 'strategyName'],
    queryParams: [],
    statuses: ['201', '400'],
  },
  rejectChangeRequest: {
    method: 'POST',
    path: '/change-requests/{requestId}/reject',
    pathParams: ['requestId'],
    queryParams: [],
    statuses: ['200', '403'],
  },
  replayDecision: {
    method: 'POST',
    path: '/decisions/{decisionId}/replay',
    pathParams: ['decisionId'],
    queryParams: [],
    statuses: ['200', '404'],
  },
  rollbackVersion: {
    method: 'POST',
    path: '/registry/{tenantId}/{strategyName}/rollback',
    pathParams: ['tenantId', 'strategyName'],
    queryParams: [],
    statuses: ['200'],
  },
  searchDecisions: {
    method: 'GET',
    path: '/decisions/search',
    pathParams: [],
    queryParams: ['action', 'channel', 'customerId', 'dateFrom', 'dateTo', 'outcome', 'limit'],
    statuses: ['200'],
  },
  simulateStrategy: {
    method: 'POST',
    path: '/simulations',
    pathParams: [],
    queryParams: [],
    statuses: ['200'],
  },
  updateArbitrationConfig: {
    method: 'PUT',
    path: '/arbitration/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200', '403'],
  },
  updateAutonomySetting: {
    method: 'PUT',
    path: '/autonomy/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200', '403'],
  },
  updateProposition: {
    method: 'PUT',
    path: '/propositions/{tenantId}/{propositionId}',
    pathParams: ['tenantId', 'propositionId'],
    queryParams: [],
    statuses: ['200', '403'],
  },
} as const;

export type OperationId = keyof typeof OPERATIONS;

// --- Request and response bodies --------------------------------------------

/** Approve a change request, applying its diff */
export type ApproveChangeRequestResponse = ChangeRequest;

/** Propose a change */
export type CreateChangeRequestResponse = ChangeRequest;
export type CreateChangeRequestRequest = ChangeRequest;

/** Create a proposition */
export type CreatePropositionResponse = Proposition;
export type CreatePropositionRequest = Proposition;

/** Arbitration weights and the levers in force */
export type GetArbitrationConfigResponse = {
  config: ArbitrationConfig;
  levers: Lever[];
};

/** Fetch a compiled artifact */
export type GetArtifactResponse = CompiledArtifact;

/** One strategy, with its graph and full compiler output */
export type GetArtifactSummaryResponse = ArtifactSummary;

/** A change request with its diff and simulation */
export type GetChangeRequestResponse = ChangeRequest;

/** Find the smallest input change that flips a decision */
export type GetCounterfactualResponse = {
  found: boolean;
  changes: {
    field: string;
    from: unknown;
    to: unknown;
  }[];
};
export type GetCounterfactualRequest = {
  decisionId: string;
  targetWinner?: string;
};

/** The full reasoning behind one decision */
export type GetDecisionTraceResponse = DecisionTrace;

/** A proposition with its treatments, policies and effective autonomy */
export type GetPropositionResponse = PropositionDetail;

/** Publish and promotion history for one strategy */
export type GetRegistryAuditLogResponse = {
  entries: Record<string, unknown>[];
};

/** Resolve the current session */
export type GetSessionResponse = {
  user: AuthUser;
};

/** The whole offer taxonomy in one call */
export type GetTaxonomyResponse = Taxonomy;

/** What the agents did, and what the guardrails stopped */
export type ListAgentActivityResponse = {
  activity: AgentActivity[];
};

/** List strategies with their compile status */
export type ListArtifactsResponse = {
  artifacts: ArtifactSummary[];
};

/** The append-only log of every write */
export type ListAuditEventsResponse = {
  events: AuditEvent[];
  total: number;
};

/** Autonomy settings, most specific scope wins at resolution time */
export type ListAutonomySettingsResponse = {
  settings: AutonomySetting[];
};

/** The approval queue */
export type ListChangeRequestsResponse = {
  changeRequests: ChangeRequest[];
  total: number;
};

/** Frequency caps and cooldowns */
export type ListContactPoliciesResponse = {
  policies: ContactPolicy[];
};

/** Eligibility, applicability and suitability policies */
export type ListEngagementPoliciesResponse = {
  policies: EngagementPolicy[];
};

/** List propositions, filtered */
export type ListPropositionsResponse = {
  propositions: Proposition[];
  total: number;
};

/** Treatments for a proposition, one per channel */
export type ListTreatmentsResponse = {
  treatments: Treatment[];
};

/** List published versions */
export type ListVersionsResponse = {
  versions: string[];
};

/** Exchange credentials for a session token */
export type LoginResponse = {
  token: string;
  user: AuthUser;
};
export type LoginRequest = {
  email: string;
  password: string;
};

/** Promote a version between environments */
export type PromoteVersionResponse = CompiledArtifact;
export type PromoteVersionRequest = {
  version: string;
  to: string;
};

/** Publish a compiled artifact version */
export type PublishArtifactResponse = CompiledArtifact;
export type PublishArtifactRequest = CompiledArtifact;

/** Reject a change request */
export type RejectChangeRequestResponse = ChangeRequest;
export type RejectChangeRequestRequest = {
  reason: string;
};

/** Re-execute a historical decision and compare it to the original */
export type ReplayDecisionResponse = ReplayResult;

/** Roll back to the previous active version */
export type RollbackVersionResponse = CompiledArtifact;

/** Search decisions */
export type SearchDecisionsResponse = {
  decisions: Decision[];
  /** Matches before the limit, not the page size */
  total: number;
};

/** Run a population through a compiled strategy */
export type SimulateStrategyResponse = ChangeRequestSimulation;
export type SimulateStrategyRequest = {
  artifactId: string;
  version?: string;
  populationSize: number;
};

/** Publish new arbitration weights */
export type UpdateArbitrationConfigResponse = ArbitrationConfig;
export type UpdateArbitrationConfigRequest = {
  weights: {
    propensity: number;
    value: number;
    lever: number;
    context: number;
  };
};

/** Change an autonomy level or its guardrails */
export type UpdateAutonomySettingResponse = AutonomySetting;
export type UpdateAutonomySettingRequest = AutonomySetting;

/** Update a proposition */
export type UpdatePropositionResponse = Proposition;
export type UpdatePropositionRequest = Proposition;

/** Response body type for each operation, by id. */
export interface ResponseOf {
  approveChangeRequest: ApproveChangeRequestResponse;
  createChangeRequest: CreateChangeRequestResponse;
  createProposition: CreatePropositionResponse;
  getArbitrationConfig: GetArbitrationConfigResponse;
  getArtifact: GetArtifactResponse;
  getArtifactSummary: GetArtifactSummaryResponse;
  getChangeRequest: GetChangeRequestResponse;
  getCounterfactual: GetCounterfactualResponse;
  getDecisionTrace: GetDecisionTraceResponse;
  getProposition: GetPropositionResponse;
  getRegistryAuditLog: GetRegistryAuditLogResponse;
  getSession: GetSessionResponse;
  getTaxonomy: GetTaxonomyResponse;
  listAgentActivity: ListAgentActivityResponse;
  listArtifacts: ListArtifactsResponse;
  listAuditEvents: ListAuditEventsResponse;
  listAutonomySettings: ListAutonomySettingsResponse;
  listChangeRequests: ListChangeRequestsResponse;
  listContactPolicies: ListContactPoliciesResponse;
  listEngagementPolicies: ListEngagementPoliciesResponse;
  listPropositions: ListPropositionsResponse;
  listTreatments: ListTreatmentsResponse;
  listVersions: ListVersionsResponse;
  login: LoginResponse;
  promoteVersion: PromoteVersionResponse;
  publishArtifact: PublishArtifactResponse;
  rejectChangeRequest: RejectChangeRequestResponse;
  replayDecision: ReplayDecisionResponse;
  rollbackVersion: RollbackVersionResponse;
  searchDecisions: SearchDecisionsResponse;
  simulateStrategy: SimulateStrategyResponse;
  updateArbitrationConfig: UpdateArbitrationConfigResponse;
  updateAutonomySetting: UpdateAutonomySettingResponse;
  updateProposition: UpdatePropositionResponse;
}
