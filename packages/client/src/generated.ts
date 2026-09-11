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
  nodes: CompiledNode[];
  edges: CompiledEdge[];
  candidateKeys: string[];
  /** Exact versions, locked at compile time so a replay is reproducible. */
  packageVersions: Record<string, string>;
  /** Which pack supplied each targeting policy this flow references,
keyed by policy id. packageVersions pins the packs a decision
compiled against; this says which of them a given rule came from,
so a refusal can be attributed to a pack rather than to a bare
policy id. Policies no pack claims are absent: a tenant authoring
its own rule is the answer, not a hole in the record.
 */
  policySources?: Record<string, PolicySource>;
  costManifest: CostManifest;
  /** sha256 over everything above. Excludes compiledAt, so two
compilations of the same source produce the same hash - which is
what lets the registry treat a republish as a no-op.
 */
  artifactHash: string;
  /** Metadata, not part of the hash. */
  compiledAt: string;
}

/** A node as compiled: what the author wrote, plus what compilation
worked out.
 */
export interface CompiledNode {
  id: string;
  type: "source" | "filter" | "constraint" | "score-model" | "score-adaptive" | "switch" | "explain-annotate" | "arbitrate";
  label: string;
  policyIds?: string[];
  frequencyPolicyIds?: string[];
  connectorIds?: string[];
  model?: {
    id: string;
    version: string;
  };
  estimatedMs?: number;
  /** Which question the node answers, derived at compile time from the
kinds of the targeting policies it declares. type says how a node
behaves - an affordability tier and a weekly contact cap are both
constraint - so without this a reader has to infer the tier from
the node id.

It names the node's declared policies, not everything it enforces:
the engine applies frequency caps and consent at every constraint
node, so a CONSENT_WITHHELD denial can be recorded against a node
whose tier is suitability. A denial's reason code says why a
candidate went; this says what the node was built to ask. Absent
when a node's policies span more than one tier.
 */
  tier?: "eligibility" | "relevance" | "suitability" | "frequency";
}

/** An edge in a compiled flow. Distinct from FlowEdge, which is the canvas shape. */
export interface CompiledEdge {
  from: string;
  to: string;
}

/** Which pack supplied a rule, as pinned in a compiled artifact. */
export interface PolicySource {
  packId: string;
  name: string;
  version: string;
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
  /** Link to the contractual terms the customer is agreeing to. Optional, because not every offer has separate terms; where one does, the trace should be able to reach what was actually promised. */
  contractUrl?: string;
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
  /** Channel-specific content; shape is discriminated by channel.

On `web`, two separate fields describe where it goes and how it
looks. `placement` is a slot key, joining to a configured
`Placement`; empty means the creative can fill any slot on the
channel. `placementType` is the shape — one of carousel,
feature_band, footer_bar, hero, page_takeover, tile.

Separate because they are separate decisions, usually made by
different people: a slot and a design. A slot declares its own
`type`, so a creative can inherit one and the two can be compared
rather than assumed to agree.
 */
  content: Record<string, unknown>;
  active: boolean;
  locale: string;
  /** Why this content reads the way it does — a claim substantiation, a legal sign-off reference, a note about wording somebody argued over. Optional, and carried into the trace so a regulator asking "why did it say that" reaches the reasoning rather than only the text. */
  reviewNote?: string;
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

export interface SchemaField {
  /** The path segment, e.g. `age` in `customer.age`. */
  name: string;
  /** integer and decimal are separate because the difference is a real authoring constraint, and because the value control differs. */
  type: "string" | "integer" | "decimal" | "boolean" | "timestamp" | "enum" | "money";
  description: string;
  /** Allowed values, for `enum`. The editor renders these and the compiler checks them. */
  members?: string[];
  required?: boolean;
  /** Retention's input, not decoration. Classifying at declaration time is far cheaper than classifying a populated store later. */
  sensitivity?: "none" | "personal" | "special_category";
  /** days, pence, ratio, months. Shown beside the value input. */
  unit?: string;
}

export interface SchemaRelationship {
  name: string;
  /** Target entity name. */
  entity: string;
  cardinality: "one" | "many";
  description: string;
}

export interface SchemaEntity {
  name: string;
  description: string;
  fields: SchemaField[];
  relationships?: SchemaRelationship[];
}

/** A rollup over a `many` relationship, resolved before the deterministic core and entering the hashed input as a scalar. Declared on the schema rather than written inside a policy, so it is a named reviewable object and the cost of a decision stays predictable. */
export interface SchemaAggregation {
  /** The flat path it produces in the input, e.g. `accounts.worst_arrears_days`. */
  produces: string;
  description: string;
  /** Relationship names from the root entity. */
  over: string[];
  fn: "count" | "sum" | "min" | "max" | "any" | "all";
  /** Field on the target entity. Omitted for `count`, required otherwise. */
  field?: string;
  where?: PolicyCondition[];
  type: "string" | "integer" | "decimal" | "boolean" | "timestamp" | "enum" | "money";
}

/** A declared transform. The set is closed on purpose: an arbitrary expression in a mapping is code running over customer data on an ingest path, versioned nowhere and reviewed by nobody. */
export interface Transform {
  kind: "none" | "trim" | "lowercase" | "uppercase" | "to_number" | "to_boolean" | "map_values" | "years_since";
  /** For map_values. Exhaustive - a source value with no entry is a problem rather than a pass-through. */
  values?: Record<string, string>;
}

export interface FieldMapping {
  /** Column name in the landed rows. */
  column: string;
  /** Dotted path in the data model. */
  path: string;
  transform?: Transform;
}

export interface ColumnSummary {
  column: string;
  path: string;
  filled: number;
  failed: number;
  examples: string[];
}

/** Summarised by column rather than by row. An import fails for a handful of reasons repeated thousands of times, and the question is which column is wrong and what the bad value looks like. */
export interface ValidationReport {
  rows: number;
  /** Rows with no problem in any column. */
  clean: number;
  columns: ColumnSummary[];
  missingRequired: string[];
  unmapped: string[];
  errors: number;
}

/** A source of customer records, and the mapping from its shape onto the data model. Land, map, validate, activate - a source that has not validated cleanly cannot be activated. */
export interface DataSource {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  kind: "file" | "http" | "inline";
  /** Column names observed when rows were landed. */
  columns: string[];
  mappings: FieldMapping[];
  status: "draft" | "validated" | "active";
  landedRows: number;
  updatedAt: string;
  updatedBy: string;
}

export interface ExperimentArm {
  /** Stable identifier. Appears in policies and reports, so it must not change. */
  key: string;
  name: string;
  /** Relative share. Not required to sum to 100 - weights are normalised. */
  weight: number;
  /** The untreated group. Marked rather than inferred from the name - control, holdout and baseline all appear in the wild. */
  holdout?: boolean;
}

/** An arm assignment is an input to a decision, not a wrapper around one. It is a pure function of the customer reference, so an arm is recomputed from a decision record months later rather than stored - which is why a running experiment's arms are frozen. */
export interface Experiment {
  id: string;
  tenantId: string;
  /** The arm reaches policies at `experiments.<key>`. */
  key: string;
  name: string;
  description: string;
  arms: ExperimentArm[];
  status: "draft" | "running" | "stopped";
  startedAt: string;
  stoppedAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ArmPerformance {
  experimentKey: string;
  arm: string;
  holdout: boolean;
  offered: number;
  measured: number;
  acceptances: number;
  /** Null when nothing was measured. Zero would claim the arm was seen and refused. */
  acceptanceRate: number;
  valueMinor: number;
}

export interface PerformanceRow {
  action: string;
  channel: string;
  flowId: string;
  /** Decisions where this action won. */
  offered: number;
  /** Decisions with any outcome recorded. The denominator for every rate here - a rate over `offered` would divide by decisions nobody reported on, turning silence into 0%. */
  measured: number;
  impressions: number;
  clicks: number;
  acceptances: number;
  rejections: number;
  conversions: number;
  /** Null when no outcome carried a value, which is distinct from zero - zero would claim the offers were worth nothing rather than that nobody said. */
  valueMinor: number;
  /** Null when nothing was measured. Zero would claim the offer was seen and refused; null says nobody reported back. */
  acceptanceRate: number;
  clickRate: number;
}

/** Where the numbers in this response came from.

The seeded `demo-telco-uk` tenant became indistinguishable from real
reporting on 2026-09-09: 10,400 decisions, 2,101 measured outcomes,
plausible click rates and realised value in pounds, all derived from
`seededUnitInterval` and none of it from a customer. The only marker was
a badge in a corner of the console's nav rail, which no API response
carried and no screenshot was obliged to include.

So a response whose numbers are synthetic says so, in the payload. A
marker that lives only in the interface is a marker that does not
survive an export, a screenshot, or a `curl`.
 */
export interface Provenance {
  /** `synthetic` when every figure derives from the seed, `recorded` when every figure derives from something that actually happened, `mixed` when a report joins both - which is the normal state of a demo tenant somebody has clicked in. */
  source: "synthetic" | "recorded" | "mixed";
  /** Rows or records in this response that derive from the seed. */
  syntheticCount?: number;
  /** Rows or records that derive from real traffic. */
  recordedCount?: number;
  /** A sentence a person can read in an exported file months later, without this document in front of them. */
  note: string;
}

export interface PerformanceReport {
  rows: PerformanceRow[];
  decisions: number;
  offered: number;
  /** Decisions that offered nothing. Reported beside the rest rather than hidden - on a platform whose suitability tier exists to refuse profitable offers, suppression is a result, not a shortfall. */
  suppressed: number;
  /** Decisions with at least one outcome recorded against them. */
  measured: number;
  /** Offered decisions on a channel something actually delivers.

The stage the loop breaks at: a decision can be correct, recorded
and replayable and still reach nobody, because the channel that won
it has no sender. ADR-013.

Null when the caller did not say which channels deliver — absent
rather than zero, because "nothing is deliverable" and "nobody told
us" are different answers and a screen must not render the second as
the first.
 */
  deliverable: number | null;
  /** Decisions with a click, acceptance or conversion. The customer did something. */
  acted: number;
  /** The same five stages per channel, so a rate below the break can name the population it describes. */
  channels: ChannelStages[];
  /** Daily, oldest first. What the rail's sparklines are drawn from. */
  series: LoopDay[];
  from?: string;
  to?: string;
  provenance?: Provenance;
  /** Per-arm counts for every running or stopped experiment, recomputed from each decision's customer reference rather than read from a stored assignment. */
  arms?: ArmPerformance[];
}

/** One channel's path through the loop.

Every field is a subset of the one before it. That nesting is the
property the Cascade pattern rests on — `METIS_CONSOLE_SPEC.md` §4.7 —
and a figure that exceeds the one above it means the two are counting
different populations.
 */
export interface ChannelStages {
  channel: "email" | "sms" | "web" | "push" | "outbound_call";
  /** Whether anything carries a decision on this channel to a customer. */
  delivers: boolean;
  decisions: number;
  offered: number;
  deliverable: number;
  seen: number;
  acted: number;
}

/** One day of the loop, for the rail's sparklines. */
export interface LoopDay {
  /** `YYYY-MM-DD`, from the decision's own timestamp rather than a clock. */
  date: string;
  decisions: number;
  offered: number;
  deliverable: number;
  seen: number;
  acted: number;
}

/** The tenant's customer data model. A contract about what fields exist and how entities relate; it says nothing about where values come from, which is already two separate answers (the caller sends them, or a connector resolves them). */
export interface ProfileSchema {
  id: string;
  tenantId: string;
  /** Bumped whenever the shape changes. */
  version: string;
  /** The entity the decision input *is*. */
  root: string;
  entities: SchemaEntity[];
  aggregations: SchemaAggregation[];
  updatedAt: string;
  updatedBy: string;
}

/** One selectable path, as the policy editor's field picker lists them. */
export interface SchemaFieldPath {
  path: string;
  type: "string" | "integer" | "decimal" | "boolean" | "timestamp" | "enum" | "money";
  kind: "field" | "aggregation";
  description: string;
  entity?: string;
  members?: string[];
  unit?: string;
  sensitivity?: "none" | "personal" | "special_category";
  /** The operators this type admits. Served rather than derived in the client so the editor and the compiler cannot offer different sets. */
  operators: string[];
}

export interface TargetingPolicyWrite {
  name: string;
  kind: "eligibility" | "relevance" | "suitability";
  description: string;
  conditions: PolicyCondition[];
  scope: PolicyScope;
  active: boolean;
}

/** Per-condition reasons, so a form can put each one against the control that produced it. A validation error rendered as one sentence at the top of a dialog makes the person hunt for the field. */
export interface PolicyRejected {
  error: string;
  message: string;
  problems: {
    /** Dotted path into the submitted object, e.g. `conditions.0.value`. */
    field: string;
    message: string;
    code?: string;
  }[];
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
  /** What this account may do. Left as free strings rather than an enum because a tenant may carry permissions from an installed pack, but the set the console itself gates on is closed and listed here.

Reads: `view:offers`, `view:flows`, `view:decisions`, `view:audit`, `view:policies`, `view:integrations`, `view:autonomy`. Writes: `edit:offers`, `edit:flows`, `edit:policies`, `edit:arbitration`, `edit:integrations`, `edit:autonomy`, `publish:flows`, `promote:flows`, `request:changes`, `approve:changes`, `admin:settings`.

`view:integrations` and `view:autonomy` were added on 2026-09-10. The four screens they gate had no read permission and the only candidates were `edit:integrations` and `edit:autonomy`; gating a read behind a write means nobody may look who may not change, which is backwards on a product built around a compliance officer who changes nothing.

A route is gated by declaring the permission on its entry in the console's navigation manifest. `RequireAuth` reads the same declaration, so the rail and the route cannot disagree.
 */
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

/** A decision as it appears in search results, without the trace.

Carries no latency. A decision's duration is a measurement of one
execution and is read from its trace (`DecisionRecord.totalMs`). Until
2026-09-11 this schema required `totalMs`, and the only thing that
ever served it was a stopwatch reading of the fixture generator, frozen
on whichever machine last built the index (G-052). An aggregate over
decisions needs a measured source, and none exists (G-061).
 */
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
  provenance?: Provenance;
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
    /** What ranking did about candidates nothing scored. A missing score must never become a silent zero: a neutral term is 1 under exponentiation, not 0, and a flow may declare an approved default instead of relying on that. Present on every decision, including when nothing was missing, so "no default configured" stays distinguishable from "written by an older engine".
 */
    missingScore: {
      /** Candidate keys that fell back, sorted. Empty when every candidate was scored.
 */
      applied: string[];
      /** The default the flow declared, or null when it declared none and the engine used a neutral 1.0. The approver and date are what make this a default rather than a constant.
 */
      approved: {
        propensity: number;
        context: number;
        approvedBy: string;
        approvedAt: string;
      } | null;
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
  /** Null when compilation failed. The whole artifact, which is what the
registry stores and the engine runs: this described four of its
fields until 2026-09-11, so a reader could not see the nodes, and
the tier each one implements was invisible to the console that
needed it.
 */
  artifact: CompiledDecisionFlow | null;
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

/** One side of a call. JSON bodies are parsed so a client can render them
structurally; anything else is kept as text, because a proxy's HTML
error page is exactly what somebody debugging needs to see. A body over
the cap is truncated and says so rather than being dropped.
 */
export interface RecordedBody {
  /** The parsed body, when it was JSON and within the cap. */
  json?: unknown;
  /** The raw body, when it was not JSON or was truncated. */
  text?: string;
  /** Size of the original body in bytes, before any truncation. */
  bytes: number;
  truncated: boolean;
}

/** A single request/response pair served by the API. */
export interface InboundCall {
  id: string;
  /** When the request arrived, not when it completed. */
  at: string;
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: string;
  status: number;
  durationMs: number;
  request?: RecordedBody;
  response?: RecordedBody;
  /** Derived from `Referer`. A label for reading the log, never
authentication — it is trivially spoofed and nothing is gated on it.
 */
  origin: "storefront" | "console" | "unknown";
  /** Lifted from the response when the call produced a decision, so the row can link to its trace. */
  decisionId?: string;
  error?: string;
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

/** A content slot in a customer journey, configured rather than assumed.

`placement` has been a string on a decision request since the beginning
— the engine reads it for the context term and records it. This is that
string given a configuration: how many actions the slot holds, and which
flow answers for it.

Not part of the catalogue the engine hashes. A placement governs how a
decision is delivered, not what is decided, so changing a slot count
moves no chain hash. The consequence is that a slate is reproducible
from its decision *plus* the placement that composed it.
 */
export interface Placement {
  id: string;
  /** The value a decision request carries, and a creative names. */
  key: string;
  name: string;
  description: string;
  channel: "email" | "sms" | "web" | "push" | "outbound_call";
  /** The shape this slot renders in. Web only — a hero and a tile are
different designs, and a creative declares which it was made for.
An email placement carries none rather than a value that means
nothing.
 */
  type?: "carousel" | "feature_band" | "footer_bar" | "hero" | "page_takeover" | "tile";
  /** At most this many actions. A hero is 1, a grid is 3. The decision is
the same either way; this governs how much of the ranking the caller
is given.
 */
  slotCount: number;
  artifactId: string;
  /** May a decision be made for this slot. `decidePlacement` answers 404
when it is false.

This was `active`, a boolean with no description, and it was
answering two questions at once — whether a decision may be made,
and whether anything delivers the result. The two came apart exactly
where this platform is: it decides on five channels and delivers on
one. `weekly_offers_send` was `active: false` on the grounds that
nothing sent it, while the corpus decided for it 2,042 times.
ADR-013 §2, G-043.
 */
  decidable: boolean;
  /** Who gets the result of a decision to the customer, and `null` when
nothing does.

`null` is not a defect to be corrected away. It is the honest state
of a slot that is worth deciding for and has no far end, which is
four of the demo tenant's five channels.
 */
  delivery: {
    /** `caller` — the platform returns a slate and whoever asked
renders it. That is what web has always been: `decidePlacement`
answers and the website delivers. An outbound call is the same
shape with a person as the renderer.

`adapter` — the platform sends it. Nothing does yet; W-017 is
blocked on W-008, because no recipient address exists anywhere
in the profile schema.
 */
    mode: "caller" | "adapter";
    /** Which adapter. Absent while `mode` is `caller`. */
    adapterId?: string;
  } | null;
  updatedAt: string;
  updatedBy: string;
}

/** What the platform did about getting one decision to a customer.

**Not an outcome.** An outcome is something the customer did; this is
something the platform did. `OutcomeType` is a nested, monotone funnel —
conversion ⊆ acceptance ⊆ click ⊆ impression — that `buildPerformance`
computes rates over, and folding the platform's own actions into it
would make every rate a ratio over a denominator that mixes the two.
ADR-013 §1.

Bound to a decision id and nothing else, per ADR-008 §2, and refused
when that decision cannot be found — the same invariant `recordOutcome`
enforces.
 */
export interface DeliveryAttempt {
  tenantId: string;
  /** The decision this was an attempt to deliver. The whole binding. */
  decisionId: string;
  placementKey: string;
  channel: "email" | "sms" | "web" | "push" | "outbound_call";
  /** `accepted` the platform took responsibility for sending it ·
`deferred` held for quiet hours, throttle or backoff ·
`dispatched` handed to whoever delivers it ·
`delivered` arrival confirmed ·
`failed` it will not arrive ·
`suppressed` not attempted, and `reason` says why.

Phase one writes `dispatched` and `suppressed` only. The other four
need an adapter, and the states are declared now so the record does
not have to change shape when one arrives.
 */
  state: "accepted" | "deferred" | "dispatched" | "delivered" | "failed" | "suppressed";
  at: string;
  /** Why, for a state that needs one. `no_adapter` where the placement
has no delivery mode; `adapter_not_built` where it names one that
does not exist yet.
 */
  reason?: string | null;
  /** Whether a failure is worth retrying. Null where the state is not a
failure. A permanent failure is information about the address rather
than about the offer, and belongs to contactability (W-013) rather
than to the offer's performance.
 */
  permanent?: boolean | null;
  /** The deliverer's own id for this send.

Stored because bounce and complaint webhooks arrive keyed by the
provider's id and not by ours, so without it the return path would
have to be reconstructed from customer and time — which ADR-008 §2
forbids. Null while nothing sends.
 */
  providerRef?: string | null;
}

/** One filled slot. */
export interface SlateEntry {
  rank: number;
  /** The action key, as the decision named it. */
  action: string;
  /** The priority ranking gave it — the same number that chose the winner. */
  priority: number;
  /** The offer this action belongs to, resolved from the catalogue. */
  offerId?: string | null;
}

/** Why a creative was refused, one entry per problem. Every problem at
once: a caller fixing one field per round trip is a caller making five.
 */
export interface CreativeRejected {
  error: "invalid_creative";
  message: string;
  problems: {
    /** Dotted path into the creative, e.g. `content.text`. */
    field: string;
    message: string;
  }[];
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
  /** When this decision asked for the value. ms says how long the answer
took; a duration on its own cannot place a call in time.
 */
  fetchedAt: string;
  /** When the value itself was computed at the source. The same as
fetchedAt for a call that reached the connector; for a cache hit it
is when the cached value was fetched, which may be much older.

Absent when a cache cannot say. A cache that does not record when it
stored a value leaves a decision unable to say whether the flag it
used was current, and that is recorded as unknown rather than
filled in with the time of the cache read.
 */
  observedAt?: string;
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
  activateDataSource: {
    method: 'POST',
    path: '/data-sources/{tenantId}/{sourceId}/activation',
    pathParams: ['tenantId', 'sourceId'],
    queryParams: [],
    statuses: ['200', '403', '409'],
  },
  approveChangeSet: {
    method: 'POST',
    path: '/change-sets/{changeSetId}/approve',
    pathParams: ['changeSetId'],
    queryParams: [],
    statuses: ['200', '403'],
  },
  clearInboundCalls: {
    method: 'POST',
    path: '/inbound-calls/clear',
    pathParams: [],
    queryParams: [],
    statuses: ['200'],
  },
  createCategory: {
    method: 'POST',
    path: '/categories/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['201', '400', '403', '409'],
  },
  createChangeSet: {
    method: 'POST',
    path: '/change-sets',
    pathParams: [],
    queryParams: [],
    statuses: ['201'],
  },
  createCreative: {
    method: 'POST',
    path: '/creatives/{tenantId}/{offerId}',
    pathParams: ['tenantId', 'offerId'],
    queryParams: [],
    statuses: ['201', '400', '403', '404', '409'],
  },
  createDataSource: {
    method: 'POST',
    path: '/data-sources/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['201', '403'],
  },
  createExperiment: {
    method: 'POST',
    path: '/experiments/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['201', '400', '403'],
  },
  createObjective: {
    method: 'POST',
    path: '/objectives/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['201', '400', '403', '409'],
  },
  createOffer: {
    method: 'POST',
    path: '/offers/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['201', '403'],
  },
  createPlacement: {
    method: 'POST',
    path: '/placements/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['201', '400', '403', '409'],
  },
  createTargetingPolicy: {
    method: 'POST',
    path: '/targeting-policies/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['201', '400', '403'],
  },
  decidePlacement: {
    method: 'POST',
    path: '/placements/{tenantId}/{placementKey}/decisions',
    pathParams: ['tenantId', 'placementKey'],
    queryParams: [],
    statuses: ['200', '400', '404', '409', '503'],
  },
  executeDecision: {
    method: 'POST',
    path: '/decisions',
    pathParams: [],
    queryParams: [],
    statuses: ['200', '400', '404', '409', '503'],
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
  getPerformance: {
    method: 'GET',
    path: '/performance/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: ['flowId', 'channel', 'limit'],
    statuses: ['200'],
  },
  getProfileSchema: {
    method: 'GET',
    path: '/profile-schema/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200'],
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
  landRows: {
    method: 'POST',
    path: '/data-sources/{tenantId}/{sourceId}/rows',
    pathParams: ['tenantId', 'sourceId'],
    queryParams: [],
    statuses: ['200', '403'],
  },
  listAgentActivity: {
    method: 'GET',
    path: '/agent-activity/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: ['outcome', 'limit'],
    statuses: ['200'],
  },
  listAllCreatives: {
    method: 'GET',
    path: '/creatives/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: ['channel', 'active', 'q'],
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
  listDataSources: {
    method: 'GET',
    path: '/data-sources/{tenantId}',
    pathParams: ['tenantId'],
    queryParams: [],
    statuses: ['200'],
  },
  listDeliveries: {
    method: 'GET',
    path: '/deliveries/{tenantId}/{decisionId}',
    pathParams: ['tenantId', 'decisionId'],
    queryParams: [],
    statuses: ['200', '404'],
  },
  listExperiments: {
    method: 'GET',
    path: '/experiments/{tenantId}',
    pathParams: ['tenantId'],
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
  listInboundCalls: {
    method: 'GET',
    path: '/inbound-calls',
    pathParams: [],
    queryParams: ['limit'],
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
  listPlacements: {
    method: 'GET',
    path: '/placements/{tenantId}',
    pathParams: ['tenantId'],
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
    statuses: ['200', '404', '422'],
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
  updateCategory: {
    method: 'PUT',
    path: '/categories/{tenantId}/{categoryId}',
    pathParams: ['tenantId', 'categoryId'],
    queryParams: [],
    statuses: ['200', '400', '403', '404'],
  },
  updateConnector: {
    method: 'PUT',
    path: '/connectors/{tenantId}/{connectorId}',
    pathParams: ['tenantId', 'connectorId'],
    queryParams: [],
    statuses: ['200', '403'],
  },
  updateCreative: {
    method: 'PUT',
    path: '/creatives/{tenantId}/{offerId}/{creativeId}',
    pathParams: ['tenantId', 'offerId', 'creativeId'],
    queryParams: [],
    statuses: ['200', '400', '403', '404', '409'],
  },
  updateDataSource: {
    method: 'PUT',
    path: '/data-sources/{tenantId}/{sourceId}',
    pathParams: ['tenantId', 'sourceId'],
    queryParams: [],
    statuses: ['200', '403', '404'],
  },
  updateDecisionFlowDraft: {
    method: 'PUT',
    path: '/artifacts/{tenantId}/{artifactId}/draft',
    pathParams: ['tenantId', 'artifactId'],
    queryParams: [],
    statuses: ['200', '403', '404'],
  },
  updateExperiment: {
    method: 'PUT',
    path: '/experiments/{tenantId}/{experimentId}',
    pathParams: ['tenantId', 'experimentId'],
    queryParams: [],
    statuses: ['200', '403', '404', '409'],
  },
  updateObjective: {
    method: 'PUT',
    path: '/objectives/{tenantId}/{objectiveId}',
    pathParams: ['tenantId', 'objectiveId'],
    queryParams: [],
    statuses: ['200', '403', '404'],
  },
  updateOffer: {
    method: 'PUT',
    path: '/offers/{tenantId}/{offerId}',
    pathParams: ['tenantId', 'offerId'],
    queryParams: [],
    statuses: ['200', '403'],
  },
  updatePlacement: {
    method: 'PUT',
    path: '/placements/{tenantId}/{placementKey}',
    pathParams: ['tenantId', 'placementKey'],
    queryParams: [],
    statuses: ['200', '400', '403', '404'],
  },
  updateTargetingPolicy: {
    method: 'PUT',
    path: '/targeting-policies/{tenantId}/{policyId}',
    pathParams: ['tenantId', 'policyId'],
    queryParams: [],
    statuses: ['200', '400', '403', '404'],
  },
  validateDataSource: {
    method: 'POST',
    path: '/data-sources/{tenantId}/{sourceId}/validation',
    pathParams: ['tenantId', 'sourceId'],
    queryParams: [],
    statuses: ['200'],
  },
} as const;

export type OperationId = keyof typeof OPERATIONS;

// --- Request and response bodies --------------------------------------------

/** Activate a validated source */
export type ActivateDataSourceResponse = DataSource;

/** Approve a change set, applying its diff */
export type ApproveChangeSetResponse = ChangeSet;

/** Empty the traffic buffer */
export type ClearInboundCallsResponse = {
  cleared: boolean;
};

/** Create a category */
export type CreateCategoryResponse = Category;
export type CreateCategoryRequest = Category;

/** Propose a change */
export type CreateChangeSetResponse = ChangeSet;
export type CreateChangeSetRequest = ChangeSet;

/** Add a creative to an offer */
export type CreateCreativeResponse = Creative;
export type CreateCreativeRequest = Creative;

/** Define a source */
export type CreateDataSourceResponse = DataSource;
export type CreateDataSourceRequest = {
  name: string;
  description?: string;
  kind: "file" | "http" | "inline";
};

/** Define an experiment */
export type CreateExperimentResponse = Experiment;
export type CreateExperimentRequest = Experiment;

/** Create an objective */
export type CreateObjectiveResponse = Objective;
export type CreateObjectiveRequest = Objective;

/** Create an offer */
export type CreateOfferResponse = Offer;
export type CreateOfferRequest = Offer;

/** Configure a placement */
export type CreatePlacementResponse = Placement;
export type CreatePlacementRequest = Placement;

/** Create a targeting policy */
export type CreateTargetingPolicyResponse = TargetingPolicy;
export type CreateTargetingPolicyRequest = TargetingPolicyWrite;

/** Decide what fills a placement */
export type DecidePlacementResponse = {
  placement: string;
  slotCount: number;
  /** One decision behind every slot. Its trace explains all of them. */
  decisionId: string;
  chainHash: string;
  entries: SlateEntry[];
  /** Slots no surviving candidate could fill. */
  unfilled: number;
  /** How many candidates reached ranking, so a caller can say
"3 of 5 shown" rather than implying it saw everything.
 */
  rankedCount: number;
};
export type DecidePlacementRequest = {
  /** As `executeDecision`, minus `placement`, which the path
already names. Supplying a different one is a 400 rather
than a silent preference for one of them.
 */
  request: {
    tenantId: string;
    customerId: string;
    channel: string;
    /** An input, never the clock. */
    occurredAt: string;
    input: Record<string, unknown>;
    contactHistory?: Record<string, unknown>;
    consent?: Record<string, unknown>;
    idempotencyKey?: string;
    correlationId?: string;
  };
};

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

/** What happened after the decisions */
export type GetPerformanceResponse = PerformanceReport;

/** The tenant's customer data model */
export type GetProfileSchemaResponse = {
  schema: ProfileSchema;
  paths: SchemaFieldPath[];
  /** Structural problems with the model itself, if any. */
  problems?: string[];
};

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

/** Land rows against a source */
export type LandRowsResponse = DataSource;
export type LandRowsRequest = {
  rows: Record<string, unknown>[];
  /** Discard what was landed before rather than appending. */
  replace?: boolean;
};

/** What the agents did, and what the guardrails stopped */
export type ListAgentActivityResponse = {
  activity: AgentActivity[];
};

/** Every creative in the catalogue */
export type ListAllCreativesResponse = {
  creatives: Creative[];
  total: number;
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

/** Configured sources of customer records */
export type ListDataSourcesResponse = {
  sources: DataSource[];
};

/** What the platform did about delivering one decision */
export type ListDeliveriesResponse = {
  deliveries: DeliveryAttempt[];
};

/** Experiments and holdouts */
export type ListExperimentsResponse = {
  experiments: Experiment[];
};

/** Frequency caps and cooldowns */
export type ListFrequencyPoliciesResponse = {
  policies: FrequencyPolicy[];
};

/** The HTTP traffic this API has served */
export type ListInboundCallsResponse = {
  /** False when recording is switched off; `calls` is then empty rather than stale. */
  enabled: boolean;
  calls: InboundCall[];
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

/** Configured placements */
export type ListPlacementsResponse = {
  placements: Placement[];
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
export type ReplayDecisionRequest = {
  /** The decision's original input, exactly as it was. */
  input?: Record<string, unknown>;
  contactHistory?: Record<string, unknown>;
};

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

/** Update a category */
export type UpdateCategoryResponse = Category;
export type UpdateCategoryRequest = Category;

/** Activate, deactivate or retune a connector */
export type UpdateConnectorResponse = Connector;
export type UpdateConnectorRequest = Connector;

/** Edit a creative, or switch it on and off */
export type UpdateCreativeResponse = Creative;
export type UpdateCreativeRequest = Creative;

/** Update a source and its mappings */
export type UpdateDataSourceResponse = DataSource;
export type UpdateDataSourceRequest = {
  name?: string;
  description?: string;
  mappings?: FieldMapping[];
};

/** Edit a flow's graph */
export type UpdateDecisionFlowDraftResponse = {
  artifact: ArtifactSummary;
  compile: CompileResult;
};
export type UpdateDecisionFlowDraftRequest = {
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  candidateKeys?: string[];
};

/** Edit an experiment, or start and stop it */
export type UpdateExperimentResponse = Experiment;
export type UpdateExperimentRequest = Experiment;

/** Update an objective */
export type UpdateObjectiveResponse = Objective;
export type UpdateObjectiveRequest = Objective;

/** Update an offer */
export type UpdateOfferResponse = Offer;
export type UpdateOfferRequest = Offer;

/** Update a placement */
export type UpdatePlacementResponse = Placement;
export type UpdatePlacementRequest = Placement;

/** Update a targeting policy */
export type UpdateTargetingPolicyResponse = TargetingPolicy;
export type UpdateTargetingPolicyRequest = TargetingPolicyWrite;

/** Check the landed rows against the data model */
export type ValidateDataSourceResponse = {
  source: DataSource;
  report: ValidationReport;
};

/** Response body type for each operation, by id. */
export interface ResponseOf {
  activateDataSource: ActivateDataSourceResponse;
  approveChangeSet: ApproveChangeSetResponse;
  clearInboundCalls: ClearInboundCallsResponse;
  createCategory: CreateCategoryResponse;
  createChangeSet: CreateChangeSetResponse;
  createCreative: CreateCreativeResponse;
  createDataSource: CreateDataSourceResponse;
  createExperiment: CreateExperimentResponse;
  createObjective: CreateObjectiveResponse;
  createOffer: CreateOfferResponse;
  createPlacement: CreatePlacementResponse;
  createTargetingPolicy: CreateTargetingPolicyResponse;
  decidePlacement: DecidePlacementResponse;
  executeDecision: ExecuteDecisionResponse;
  getArbitrationConfig: GetArbitrationConfigResponse;
  getArtifactSummary: GetArtifactSummaryResponse;
  getChangeSet: GetChangeSetResponse;
  getCounterfactual: GetCounterfactualResponse;
  getDecisionRecord: GetDecisionRecordResponse;
  getOffer: GetOfferResponse;
  getPerformance: GetPerformanceResponse;
  getProfileSchema: GetProfileSchemaResponse;
  getRegistryEntry: GetRegistryEntryResponse;
  getSession: GetSessionResponse;
  getShadowReport: GetShadowReportResponse;
  getTaxonomy: GetTaxonomyResponse;
  landRows: LandRowsResponse;
  listAgentActivity: ListAgentActivityResponse;
  listAllCreatives: ListAllCreativesResponse;
  listArtifacts: ListArtifactsResponse;
  listAuditEvents: ListAuditEventsResponse;
  listAutonomySettings: ListAutonomySettingsResponse;
  listChangeSets: ListChangeSetsResponse;
  listConnectors: ListConnectorsResponse;
  listCreatives: ListCreativesResponse;
  listDataSources: ListDataSourcesResponse;
  listDeliveries: ListDeliveriesResponse;
  listExperiments: ListExperimentsResponse;
  listFrequencyPolicies: ListFrequencyPoliciesResponse;
  listInboundCalls: ListInboundCallsResponse;
  listOffers: ListOffersResponse;
  listOutcomes: ListOutcomesResponse;
  listPlacements: ListPlacementsResponse;
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
  updateCategory: UpdateCategoryResponse;
  updateConnector: UpdateConnectorResponse;
  updateCreative: UpdateCreativeResponse;
  updateDataSource: UpdateDataSourceResponse;
  updateDecisionFlowDraft: UpdateDecisionFlowDraftResponse;
  updateExperiment: UpdateExperimentResponse;
  updateObjective: UpdateObjectiveResponse;
  updateOffer: UpdateOfferResponse;
  updatePlacement: UpdatePlacementResponse;
  updateTargetingPolicy: UpdateTargetingPolicyResponse;
  validateDataSource: ValidateDataSourceResponse;
}
