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

/** What the compiler emits. Distinct from ArtifactSummary, which is how the
console renders a flow: this is the immutable, executable form the
registry stores and the engine runs.
 */
export interface CompiledDecisionFlow {
  id: string;
  version: string;
  tenantId: string;
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  candidateKeys: string[];
  /** Exact versions, locked at compile time so a replay is reproducible. */
  packageVersions: Record<string, string>;
  costManifest: CostManifest;
  /** sha256 over everything above. Excludes compiledAt, so two
compilations of the same source produce the same hash - which is
what lets the registry treat a republish as a no-op.
 */
  artifactHash: string;
  /** Metadata, not part of the hash. */
  compiledAt: string;
}

export interface Money {
  /** Minor units, e.g. pence. 3500 = 35.00 */
  amount: number;
  currency: "GBP" | "USD" | "EUR";
}

export interface Objective {
  id: string;
  name: string;
  /** URL-safe stable key, e.g. "retention" */
  key: string;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  objectiveId: string;
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

export interface OfferFinancials {
  price: Money;
  cost: Money;
  expectedMargin: Money;
  termMonths: number;
  oneOff: boolean;
}

export interface Offer {
  id: string;
  categoryId: string;
  /** Denormalised from the category for tree and breadcrumb rendering */
  objectiveId: string;
  name: string;
  key: string;
  description: string;
  status: "draft" | "active" | "paused" | "retired";
  financials: OfferFinancials;
  validity: ValidityWindow;
  /** Business priority multiplier. 1.0 is neutral. */
  boost: number;
  policyIds: string[];
  creativeIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Creative {
  id: string;
  offerId: string;
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
  level: "tenant" | "objective" | "category" | "offer";
  /** null when level is tenant */
  targetId: string | null;
}

export interface PolicyCondition {
  /** Dotted path into the customer data model */
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "contains" | "exists" | "not_exists";
  value: unknown;
}

export interface TargetingPolicy {
  id: string;
  name: string;
  /** eligibility = can we offer it; relevance = should we now; suitability = is it right for this customer */
  kind: "eligibility" | "relevance" | "suitability";
  description: string;
  conditions: PolicyCondition[];
  scope: PolicyScope;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FrequencyPolicy {
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
  /** Which ranking function computes priority. Required, with no default: a missing reference used to mean "whatever the engine hard-codes", which is the coupling this replaces. Publishing is gated on the function existing (UNKNOWN_UTILITY_FUNCTION) and on it reading only terms the engine produces (UTILITY_TERM_UNAVAILABLE).
 */
  utility: {
    id: string;
    /** Semver. Arithmetic changes are a new version, never an edit — decisions already point at the old one.
 */
    version: string;
  };
  /** Exponent weights for the multiplicative function. A function that reads no weights (expected-value) ignores these entirely.
 */
  weights: {
    propensity: number;
    value: number;
    boost: number;
    context: number;
  };
  formula: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Boost {
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
  allowedChangeTypes: ("boost_adjust" | "creative_copy" | "policy_edit" | "offer_create" | "offer_retire" | "flow_edit" | "arbitration_weights")[];
  /** Fraction. 0.1 permits +/-10%. */
  maxBoostDelta: number;
  maxBudgetDelta: Money;
  protectedAttributes: string[];
  requireSimulationPass: boolean;
  biasGateThreshold: number;
}

export interface AutonomySetting {
  id: string;
  scope: PolicyScope;
  /** L0 Observe, L1 Assist, L2 Propose, L3 Bounded, L4 Autonomous. Resolved most-specific-first: offer > category > objective > tenant. */
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
  changeType: "boost_adjust" | "creative_copy" | "policy_edit" | "offer_create" | "offer_retire" | "flow_edit" | "arbitration_weights";
  summary: string;
  outcome: "suggested" | "proposed" | "auto_applied" | "reverted" | "blocked";
  guardrailBreached: string | null;
  changeSetId: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: ("architect" | "marketer" | "compliance" | "analyst" | "operator" | "admin")[];
  permissions: string[];
  tenantId: string;
}

/** Why one candidate was removed. Stable, parseable and translatable, which the node's prose `reason` is not — this is what answers "why was this action not offered to me" for a single action.
 */
export interface Denial {
  /** The candidate this is about. */
  key: string;
  /** A closed set, never renamed. NOT_RANKED is not a fault: the candidate passed every gate and was beaten.
 */
  code: "ELIGIBILITY_FAILED" | "RELEVANCE_FAILED" | "SUITABILITY_FAILED" | "FREQUENCY_CAP_BREACHED" | "CONSENT_WITHHELD" | "OUT_OF_VALIDITY_WINDOW" | "NOT_ACTIVE" | "NOT_RANKED";
  /** The targeting or frequency policy that did it, where one is identifiable. Null for codes that are properties of the candidate rather than of a rule. Always present, never omitted — an optional key would mean two engines each deciding when to drop it, and the canonical form differs if they disagree.
 */
  ruleId: string | null;
}

/** One node's verdict on the candidate set, in execution order. */
export interface Elimination {
  nodeId: string;
  nodeType: string;
  /** Human sentence for the trace view. Not stable; do not parse it. */
  reason: string;
  /** One entry per candidate removed here, sorted by key. Sorted rather than left in evaluation order because within a node the removals are simultaneous, so order carries no information and would only be a way for two engines to disagree.
 */
  denials: Denial[];
  survived: string[];
}

/** Every term the engine produces for a candidate, and the priority the ranking function computed from them. All terms are present whichever function ran: a term appearing only when some function asks for it would make the decision shape depend on the ranking config, and two decisions from one tenant would hash over different structures.
 */
export interface ScoreBreakdown {
  propensity: number;
  value: number;
  boost: number;
  context: number;
  /** Delivery cost, normalised on the same scale as value. */
  cost: number;
  priority: number;
}

/** Something that happened to a decision afterwards. Storage only — nothing learns from these yet, and a table that quietly fed a model would be the opposite of the point.
 */
export interface OutcomeEvent {
  decisionId: string;
  type: "impression" | "click" | "acceptance" | "rejection" | "conversion";
  occurredAt: string;
  /** Realised value in minor units, where the outcome carries one. Null rather than zero when there is none: a click is not a conversion worth nothing, and averaging over zeros would say it was.
 */
  valueMinor: number | null;
  /** Whatever the channel reported. Never read by the engine. */
  detail?: Record<string, unknown>;
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
  winnerOfferId: string | null;
  candidateCount: number;
  totalMs: number;
}

/** A decision plus the full reasoning behind it. Everything here except
`timings` is reproducible: `chainHash` covers only that reproducible
half, which is what makes replay a byte-comparison rather than a
judgement call.
 */
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
  eliminations: Elimination[];
  /** Score breakdown per candidate action key */
  scores: Record<string, ScoreBreakdown>;
  arbitration: {
    formula: string;
    /** Which ranking function produced these priorities. In the hashed decision because a decision has to identify every version that produced it — without this, two decisions ranked by different functions over the same catalogue are indistinguishable after the fact.
 */
    utility: {
      id: string;
      version: string;
    };
    winner: string | null;
    runnerUp: string | null;
  };
  /** Measured, not reproducible. Excluded from the chain hash. */
  timings: Record<string, number>;
  constraintsApplied: string[];
  consentState: ConsentState;
  creativeId?: string | null;
  /** Which connector supplied which input field. Reproducible. */
  sourceBindings?: SourceBinding[];
  /** What the integrations did on the wire. Measured, so absent on a
replayed trace - replay calls no connectors.
 */
  sourceCalls?: SourceCall[];
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

/** The whole offer catalogue - Objective > Category > Offer. */
export interface Taxonomy {
  objectives: Objective[];
  categories: Category[];
  offers: Offer[];
}

/** An offer with everything needed to render its page. */
export interface OfferDetail {
  offer: Offer;
  creatives: Creative[];
  policies: TargetingPolicy[];
  /** Effective autonomy for this scope, or null if none resolves */
  autonomy: AutonomySetting | null;
}

export interface ChangeSetSimulation {
  ran: boolean;
  passed: boolean;
  populationSize: number;
  projectedMarginDelta: string;
  /** Ratio between best and worst treated group. 1.0 is parity. */
  biasRatio: number;
  notes: string;
}

/** A proposed change awaiting approval, from a person or an agent. */
export interface ChangeSet {
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
  simulation: ChangeSetSimulation | null;
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
  changeSetId: string | null;
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

/** What the compiler predicts this flow will cost to run. */
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
export interface FlowNode {
  id: string;
  type: string;
  label: string;
  description: string;
  estimatedMs: number;
  policyIds?: string[];
  /** Connectors a source node draws on. Their latency joins the critical path. */
  connectorIds?: string[];
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

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

/** One immutable version in the registry. */
export interface PublishedVersion {
  flowName: string;
  version: string;
  artifact: CompiledDecisionFlow;
  publishedAt: string;
  publishedBy: string;
  /** Kept with the version rather than discarded on success. A flow
that published near its latency budget is a different thing to
explain in six months than one that published clean.
 */
  warnings: Diagnostic[];
}

/** What an environment is running, and what rollback returns to. */
export interface EnvironmentState {
  environment: string;
  activeVersion: string | null;
  /** Null when there is nothing to roll back to. */
  previousVersion: string | null;
  /** A version running beside the active one and deciding nothing. Its output never reaches a customer — the active version's answer is always the one returned. What the shadow produces is compared and recorded, which is how a migration is evidenced rather than asserted. Null when nothing is shadowing, which is the normal state.
 */
  shadowVersion: string | null;
  promotedAt: string | null;
  promotedBy: string | null;
}

/** The result of a publish. `published` stored a new version, `unchanged`
found byte-identical content already there, and `rejected` stored
nothing - either the flow did not compile, or the version already
holds different content.
 */
export interface PublishOutcome {
  status: "published" | "unchanged" | "rejected";
  /** Present when status is `rejected`. */
  reason?: "compilation" | "immutable";
  artifact?: CompiledDecisionFlow | null;
  diagnostics: Diagnostic[];
  /** Present when refused as immutable. */
  existingHash?: string;
  /** Present when refused as immutable. */
  attemptedHash?: string;
}

export interface ShadowReport {
  flowName: string;
  activeVersion: string | null;
  shadowVersion: string | null;
  compared: number;
  agreed: number;
  /** 0 when nothing has been compared, never 1. */
  agreementRate: number;
  topDivergences: ({
    kind: "winner" | "ranking" | "reasons";
    summary: string;
    count: number;
  })[];
  shadowMsP50: number;
  /** The tail is the number that matters: a shadow whose p95 is 100ms is not free, whatever its median says.
 */
  shadowMsP95: number;
}

/** One entry in the registry's append-only log. */
export interface RegistryEvent {
  /** Monotonic. The order is a fact, not a sort key. */
  seq: number;
  at: string;
  actor: string;
  type: "ArtifactPublished" | "PublishRejected" | "VersionPromoted" | "VersionRolledBack";
  tenantId: string;
  flowName: string;
  version: string;
  environment?: string;
  summary: string;
  /** Present on PublishRejected. */
  diagnostics?: Diagnostic[];
}

/** One field a connector supplies, and where it lives in the response. */
export interface FieldBinding {
  /** The name the field takes in the decision input */
  field: string;
  /** Dotted path into the connector's response payload */
  path: string;
  type: "string" | "number" | "boolean";
  /** Used when the connector fails and its failure mode is `default` */
  defaultValue?: string | number | boolean;
}

/** A configured route to data the platform does not hold. Used at decision
time: a flow's source node names the connectors it needs, resolution
fetches them before execution, and the values land in the input the
engine hashes. Replay never calls a connector - it replays against the
recorded snapshot.
 */
export interface Connector {
  id: string;
  name: string;
  kind: "rest" | "feature-store" | "static";
  description: string;
  /** Endpoint, feature-store namespace, or empty for `static` */
  target: string;
  /** Declared, not measured. The compiler adds it to the critical path, so
a connector that cannot fit the latency budget fails compilation
rather than failing in production.
 */
  declaredP95Ms: number;
  timeoutMs: number;
  onFailure: "fail" | "omit" | "default";
  /** 0 disables caching. Caching is measured, never hashed. */
  cacheTtlSeconds: number;
  provides: FieldBinding[];
  active: boolean;
  updatedAt: string;
  updatedBy: string;
}

/** Which connector supplied a field. Reproducible; part of the hashed decision. */
export interface SourceBinding {
  field: string;
  connectorId: string;
  nodeId: string;
}

/** What an integration actually did. Measured; never hashed, absent on replay. */
export interface SourceCall {
  connectorId: string;
  ms: number;
  cacheHit: boolean;
  outcome: "ok" | "timeout" | "error" | "skipped";
  fields: string[];
  detail?: string;
}

/** A flow as the console lists and renders it. Distinct from
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
  nodes: FlowNode[];
  edges: FlowEdge[];
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
  approveChangeSet: {
    method: 'POST',
    path: '/change-sets/{changeSetId}/approve',
    pathParams: ['changeSetId'],
    queryParams: [],
    statuses: ['200', '403'],
  },
  createChangeSet: {
    method: 'POST',
    path: '/change-sets',
    pathParams: [],
    queryParams: [],
    statuses: ['201'],
  },
  createOffer: {
    method: 'POST',
    path: '/offers/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['201', '403'],
  },
  executeDecision: {
    method: 'POST',
    path: '/decisions',
    pathParams: [],
    queryParams: [],
    statuses: ['200', '400', '404', '409'],
  },
  getArbitrationConfig: {
    method: 'GET',
    path: '/arbitration/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200'],
  },
  getArtifactSummary: {
    method: 'GET',
    path: '/artifacts/{tenantId}/{artifactId}',
    pathParams: ['tenantId', 'artifactId'],
    queryParams: [],
    statuses: ['200', '404'],
  },
  getChangeSet: {
    method: 'GET',
    path: '/change-sets/{changeSetId}',
    pathParams: ['changeSetId'],
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
  getDecisionRecord: {
    method: 'GET',
    path: '/decisions/{decisionId}/trace',
    pathParams: ['decisionId'],
    queryParams: [],
    statuses: ['200', '404'],
  },
  getOffer: {
    method: 'GET',
    path: '/offers/{tenantId}/{offerId}',
    pathParams: ['tenantId', 'offerId'],
    queryParams: [],
    statuses: ['200', '404'],
  },
  getRegistryEntry: {
    method: 'GET',
    path: '/registry/{tenantId}/{flowName}',
    pathParams: ['tenantId', 'flowName'],
    queryParams: [],
    statuses: ['200', '404'],
  },
  getSession: {
    method: 'GET',
    path: '/auth/session',
    pathParams: [],
    queryParams: [],
    statuses: ['200', '401'],
  },
  getShadowReport: {
    method: 'GET',
    path: '/registry/{tenantId}/{flowName}/shadow-report',
    pathParams: ['tenantId', 'flowName'],
    queryParams: [],
    statuses: ['200', '404'],
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
  listChangeSets: {
    method: 'GET',
    path: '/change-sets',
    pathParams: [],
    queryParams: ['status'],
    statuses: ['200'],
  },
  listConnectors: {
    method: 'GET',
    path: '/connectors/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200'],
  },
  listCreatives: {
    method: 'GET',
    path: '/creatives/{tenantId}/{offerId}',
    pathParams: ['tenantId', 'offerId'],
    queryParams: [],
    statuses: ['200'],
  },
  listFrequencyPolicies: {
    method: 'GET',
    path: '/frequency-policies/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200'],
  },
  listOffers: {
    method: 'GET',
    path: '/offers/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: ['objectiveId', 'categoryId', 'status', 'q'],
    statuses: ['200'],
  },
  listOutcomes: {
    method: 'GET',
    path: '/outcomes/{tenantId}/{decisionId}',
    pathParams: ['tenantId', 'decisionId'],
    queryParams: [],
    statuses: ['200'],
  },
  listRegistryEvents: {
    method: 'GET',
    path: '/registry/{tenantId}/events',
    pathParams: ['tenantId'],
    queryParams: ['flowName', 'limit'],
    statuses: ['200'],
  },
  listRegistryFlows: {
    method: 'GET',
    path: '/registry/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200'],
  },
  listTargetingPolicies: {
    method: 'GET',
    path: '/targeting-policies/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: ['kind'],
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
    path: '/registry/{tenantId}/{flowName}/promote',
    pathParams: ['tenantId', 'flowName'],
    queryParams: [],
    statuses: ['200', '403', '404', '409'],
  },
  publishArtifact: {
    method: 'POST',
    path: '/registry/{tenantId}/{flowName}',
    pathParams: ['tenantId', 'flowName'],
    queryParams: [],
    statuses: ['201', '403', '409'],
  },
  recordOutcome: {
    method: 'POST',
    path: '/outcomes/{tenantId}/{decisionId}',
    pathParams: ['tenantId', 'decisionId'],
    queryParams: [],
    statuses: ['201', '404'],
  },
  rejectChangeSet: {
    method: 'POST',
    path: '/change-sets/{changeSetId}/reject',
    pathParams: ['changeSetId'],
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
    path: '/registry/{tenantId}/{flowName}/rollback',
    pathParams: ['tenantId', 'flowName'],
    queryParams: [],
    statuses: ['200', '403', '409'],
  },
  searchDecisions: {
    method: 'GET',
    path: '/decisions/search',
    pathParams: [],
    queryParams: ['action', 'channel', 'customerId', 'dateFrom', 'dateTo', 'outcome', 'limit'],
    statuses: ['200'],
  },
  setShadow: {
    method: 'POST',
    path: '/registry/{tenantId}/{flowName}/shadow',
    pathParams: ['tenantId', 'flowName'],
    queryParams: [],
    statuses: ['200', '403', '404', '409'],
  },
  simulateDecisionFlow: {
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
  updateConnector: {
    method: 'PUT',
    path: '/connectors/{tenantId}/{connectorId}',
    pathParams: ['tenantId', 'connectorId'],
    queryParams: [],
    statuses: ['200', '403'],
  },
  updateOffer: {
    method: 'PUT',
    path: '/offers/{tenantId}/{offerId}',
    pathParams: ['tenantId', 'offerId'],
    queryParams: [],
    statuses: ['200', '403'],
  },
} as const;

export type OperationId = keyof typeof OPERATIONS;

// --- Request and response bodies --------------------------------------------

/** Approve a change set, applying its diff */
export type ApproveChangeSetResponse = ChangeSet;

/** Propose a change */
export type CreateChangeSetResponse = ChangeSet;
export type CreateChangeSetRequest = ChangeSet;

/** Create an offer */
export type CreateOfferResponse = Offer;
export type CreateOfferRequest = Offer;

/** Make a decision */
export type ExecuteDecisionResponse = {
  /** Content-addressed. The first 16 characters of the chain hash. */
  id: string;
  /** The reproducible half, exactly as hashed. */
  decision: Record<string, unknown>;
  chainHash: string;
};
export type ExecuteDecisionRequest = {
  artifactId: string;
  request: {
    tenantId: string;
    customerId: string;
    channel: string;
    placement: string;
    /** An input, never the clock. */
    occurredAt: string;
    /** Customer and context attributes, already resolved. */
    input: Record<string, unknown>;
    contactHistory?: Record<string, unknown>;
    consent?: Record<string, unknown>;
    /** Makes a retry safe. The same key with the same request returns the original decision without re-executing; the same key with a *different* request is a 409, because the caller reused a token for a different question and answering quietly would hand them a decision about someone else's customer.
Excluded from the request hash — it identifies the attempt, not the question. Scoped per tenant.
 */
    idempotencyKey?: string;
    /** Tracing id, echoed back in the measured half of the trace. Never hashed, and excluded from the request hash: it differs on every retry, so including it would make each retry a new request.
 */
    correlationId?: string;
  };
};

/** Arbitration weights and the boosts in force */
export type GetArbitrationConfigResponse = {
  config: ArbitrationConfig;
  boosts: Boost[];
};

/** One flow, with its graph and full compiler output */
export type GetArtifactSummaryResponse = ArtifactSummary;

/** A change set with its diff and simulation */
export type GetChangeSetResponse = ChangeSet;

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
export type GetDecisionRecordResponse = DecisionRecord;

/** An offer with its creatives, policies and effective autonomy */
export type GetOfferResponse = OfferDetail;

/** Published versions and where each is running */
export type GetRegistryEntryResponse = {
  flowName: string;
  versions: PublishedVersion[];
  environments: EnvironmentState[];
};

/** Resolve the current session */
export type GetSessionResponse = {
  user: AuthUser;
};

/** How the shadow compares to what is running */
export type GetShadowReportResponse = ShadowReport;

/** The whole offer taxonomy in one call */
export type GetTaxonomyResponse = Taxonomy;

/** What the agents did, and what the guardrails stopped */
export type ListAgentActivityResponse = {
  activity: AgentActivity[];
};

/** List flows with their compile status */
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
export type ListChangeSetsResponse = {
  changeSets: ChangeSet[];
  total: number;
};

/** Configured integrations */
export type ListConnectorsResponse = {
  connectors: Connector[];
};

/** Creatives for an offer, one per channel */
export type ListCreativesResponse = {
  creatives: Creative[];
};

/** Frequency caps and cooldowns */
export type ListFrequencyPoliciesResponse = {
  policies: FrequencyPolicy[];
};

/** List offers, filtered */
export type ListOffersResponse = {
  offers: Offer[];
  total: number;
};

/** Outcomes recorded against a decision */
export type ListOutcomesResponse = {
  outcomes: OutcomeEvent[];
};

/** The registry's append-only log */
export type ListRegistryEventsResponse = {
  events: RegistryEvent[];
};

/** Flows in the registry */
export type ListRegistryFlowsResponse = {
  flows: string[];
};

/** Eligibility, relevance and suitability policies */
export type ListTargetingPoliciesResponse = {
  policies: TargetingPolicy[];
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

/** Point an environment at a published version */
export type PromoteVersionResponse = EnvironmentState;
export type PromoteVersionRequest = {
  version: string;
  environment: string;
};

/** Publish a version */
export type PublishArtifactResponse = PublishOutcome;
export type PublishArtifactRequest = {
  version: string;
  /** The flow as authored, before compilation. */
  source: Record<string, unknown>;
};

/** Record what happened to a decision */
export type RecordOutcomeResponse = OutcomeEvent;
export type RecordOutcomeRequest = {
  type: "impression" | "click" | "acceptance" | "rejection" | "conversion";
  occurredAt: string;
  valueMinor?: number | null;
  detail?: Record<string, unknown>;
};

/** Reject a change set */
export type RejectChangeSetResponse = ChangeSet;
export type RejectChangeSetRequest = {
  reason: string;
};

/** Re-execute a historical decision and compare it to the original */
export type ReplayDecisionResponse = ReplayResult;

/** Return an environment to the version it ran before */
export type RollbackVersionResponse = EnvironmentState;
export type RollbackVersionRequest = {
  environment: string;
};

/** Search decisions */
export type SearchDecisionsResponse = {
  decisions: Decision[];
  /** Matches before the limit, not the page size */
  total: number;
};

/** Start or stop a shadow */
export type SetShadowResponse = EnvironmentState;
export type SetShadowRequest = {
  /** Null stops the shadow. */
  version?: string | null;
  environment: string;
};

/** Run a population through a compiled flow */
export type SimulateDecisionFlowResponse = ChangeSetSimulation;
export type SimulateDecisionFlowRequest = {
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
    boost: number;
    context: number;
  };
};

/** Change an autonomy level or its guardrails */
export type UpdateAutonomySettingResponse = AutonomySetting;
export type UpdateAutonomySettingRequest = AutonomySetting;

/** Activate, deactivate or retune a connector */
export type UpdateConnectorResponse = Connector;
export type UpdateConnectorRequest = Connector;

/** Update an offer */
export type UpdateOfferResponse = Offer;
export type UpdateOfferRequest = Offer;

/** Response body type for each operation, by id. */
export interface ResponseOf {
  approveChangeSet: ApproveChangeSetResponse;
  createChangeSet: CreateChangeSetResponse;
  createOffer: CreateOfferResponse;
  executeDecision: ExecuteDecisionResponse;
  getArbitrationConfig: GetArbitrationConfigResponse;
  getArtifactSummary: GetArtifactSummaryResponse;
  getChangeSet: GetChangeSetResponse;
  getCounterfactual: GetCounterfactualResponse;
  getDecisionRecord: GetDecisionRecordResponse;
  getOffer: GetOfferResponse;
  getRegistryEntry: GetRegistryEntryResponse;
  getSession: GetSessionResponse;
  getShadowReport: GetShadowReportResponse;
  getTaxonomy: GetTaxonomyResponse;
  listAgentActivity: ListAgentActivityResponse;
  listArtifacts: ListArtifactsResponse;
  listAuditEvents: ListAuditEventsResponse;
  listAutonomySettings: ListAutonomySettingsResponse;
  listChangeSets: ListChangeSetsResponse;
  listConnectors: ListConnectorsResponse;
  listCreatives: ListCreativesResponse;
  listFrequencyPolicies: ListFrequencyPoliciesResponse;
  listOffers: ListOffersResponse;
  listOutcomes: ListOutcomesResponse;
  listRegistryEvents: ListRegistryEventsResponse;
  listRegistryFlows: ListRegistryFlowsResponse;
  listTargetingPolicies: ListTargetingPoliciesResponse;
  login: LoginResponse;
  promoteVersion: PromoteVersionResponse;
  publishArtifact: PublishArtifactResponse;
  recordOutcome: RecordOutcomeResponse;
  rejectChangeSet: RejectChangeSetResponse;
  replayDecision: ReplayDecisionResponse;
  rollbackVersion: RollbackVersionResponse;
  searchDecisions: SearchDecisionsResponse;
  setShadow: SetShadowResponse;
  simulateDecisionFlow: SimulateDecisionFlowResponse;
  updateArbitrationConfig: UpdateArbitrationConfigResponse;
  updateAutonomySetting: UpdateAutonomySettingResponse;
  updateConnector: UpdateConnectorResponse;
  updateOffer: UpdateOfferResponse;
}
