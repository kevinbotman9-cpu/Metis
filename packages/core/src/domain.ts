/**
 * METIS Domain Model — CDH-grade offer taxonomy
 *
 * Hierarchy:  Objective > Category > Offer > Creative
 *
 * This is the contract every console surface renders and every flow
 * references. A flow's candidate set is a list of Offer IDs; the
 * runtime resolves them to full objects with policies, financials and
 * channel creatives.
 */

// ---------------------------------------------------------------------------
// Offer hierarchy
// ---------------------------------------------------------------------------

/** Top of the hierarchy: the business objective an offer serves. */
export interface Objective {
  id: string;
  name: string;
  /** URL-safe stable key, e.g. "retention" */
  key: string;
  description: string;
  /** Display order in the tree */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** A product family within an Objective, e.g. "Mobile Plans" under "Retention". */
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

export type OfferStatus = 'draft' | 'active' | 'paused' | 'retired';

/** Money is stored in minor units to avoid float drift. */
export interface Money {
  /** Minor units, e.g. pence. 3500 = £35.00 */
  amount: number;
  currency: 'GBP' | 'USD' | 'EUR';
}

export interface OfferFinancials {
  /** What the customer pays, recurring per month unless oneOff. */
  price: Money;
  /** Cost to serve, same period as price. */
  cost: Money;
  /** Expected margin per accepted offer over the commitment term. */
  expectedMargin: Money;
  /** Commitment length in months. 0 = no commitment / one-off. */
  termMonths: number;
  oneOff: boolean;
}

export interface ValidityWindow {
  /** ISO date. Offer cannot be offered before this. */
  startsAt: string;
  /** ISO date, or null for open-ended. */
  endsAt: string | null;
}

/** The offer itself — what "mastering offers" produces. */
export interface Offer {
  id: string;
  categoryId: string;
  /** Denormalised for tree rendering and breadcrumbs. */
  objectiveId: string;
  name: string;
  key: string;
  description: string;
  status: OfferStatus;
  financials: OfferFinancials;
  validity: ValidityWindow;
  /**
   * Business priority weight used by arbitration's boost term.
   * 1.0 is neutral; >1 boosts, <1 suppresses.
   */
  boost: number;
  /** Targeting policy rule IDs applying to this offer. */
  policyIds: string[];
  /** Channel creatives. At least one is required to go active. */
  creativeIds: string[];
  /** Free-form labels for search and bulk operations. */
  tags: string[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

// ---------------------------------------------------------------------------
// Creatives — channel-specific content
// ---------------------------------------------------------------------------

export type Channel = 'email' | 'sms' | 'web' | 'push' | 'outbound_call';

export interface EmailContent {
  channel: 'email';
  subject: string;
  preheader: string;
  body: string;
  fromName: string;
  fromAddress: string;
}

export interface SmsContent {
  channel: 'sms';
  /** Hard limit 160 chars; validated at compile time. */
  text: string;
  senderId: string;
}

export interface WebContent {
  channel: 'web';
  headline: string;
  subheadline: string;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
  /** Named slot in the customer journey this can fill. */
  placement: string;
}

export interface PushContent {
  channel: 'push';
  title: string;
  body: string;
  deeplink: string;
}

export interface OutboundCallContent {
  channel: 'outbound_call';
  /** Agent-facing talking points. */
  script: string;
  objectionHandling: string;
}

export type CreativeContent =
  | EmailContent
  | SmsContent
  | WebContent
  | PushContent
  | OutboundCallContent;

export interface Creative {
  id: string;
  offerId: string;
  name: string;
  channel: Channel;
  content: CreativeContent;
  /** Only active creatives are eligible for delivery. */
  active: boolean;
  /** Locale this creative serves, e.g. "en-GB". */
  locale: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Targeting policy — the three-tier qualification model
// ---------------------------------------------------------------------------

/**
 * eligibility — hard filters. CAN we legally and contractually offer this?
 * relevance   — situational. SHOULD we offer it right now?
 * suitability — affordability and ethics. Is it RIGHT for this customer?
 */
export type PolicyKind = 'eligibility' | 'relevance' | 'suitability';

export type PolicyOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'exists'
  | 'not_exists';

export interface PolicyCondition {
  /** Dotted path into the customer data model, e.g. "customer.age". */
  field: string;
  operator: PolicyOperator;
  value: unknown;
}

export interface TargetingPolicy {
  id: string;
  name: string;
  kind: PolicyKind;
  description: string;
  /** All conditions must pass (AND). Use separate policies for OR. */
  conditions: PolicyCondition[];
  /**
   * Scope this policy binds to. A policy at objective level applies to every
   * offer beneath it.
   */
  scope: PolicyScope;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyScope {
  level: 'tenant' | 'objective' | 'category' | 'offer';
  /** null when level is 'tenant'. */
  targetId: string | null;
}

// ---------------------------------------------------------------------------
// Frequency policy — suppression
// ---------------------------------------------------------------------------

export type FrequencyPolicyPeriod = 'day' | 'week' | 'month';

export interface FrequencyPolicy {
  id: string;
  name: string;
  description: string;
  /** null = applies to every channel. */
  channel: Channel | null;
  /** Maximum outbound contacts permitted in the period. */
  maxContacts: number;
  period: FrequencyPolicyPeriod;
  /**
   * Days to suppress an offer after the customer rejects or ignores it.
   */
  cooldownDaysAfterReject: number;
  scope: PolicyScope;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Arbitration — P x V x L x C
// ---------------------------------------------------------------------------

/**
 * Priority = Propensity ^wP  x  Value ^wV  x  Boost ^wL  x  Context ^wC
 *
 * Exponent weights let a tenant tune how much each term matters without
 * rewriting the formula. All default to 1.0.
 */
export interface ArbitrationConfig {
  id: string;
  tenantId: string;
  weights: {
    propensity: number;
    value: number;
    boost: number;
    context: number;
  };
  /**
   * Which ranking function computes priority, by id and version.
   *
   * Required, with no default. A missing reference used to mean "the one the
   * engine happens to hard-code", which is exactly the coupling this replaces —
   * and a silent fallback would let a config that names nothing keep working
   * while claiming to be configurable.
   */
  utility: { id: string; version: string };
  /** Human-readable rendering of the formula for the trace and UI. */
  formula: string;
  updatedAt: string;
  updatedBy: string;
}

/** A per-scope business weight, surfaced in the boost tuning UI. */
export interface Boost {
  id: string;
  name: string;
  scope: PolicyScope;
  /** Multiplier. 1.0 neutral. */
  value: number;
  reason: string;
  /** Boosts can be time-boxed for campaigns. */
  validity: ValidityWindow | null;
  updatedAt: string;
  updatedBy: string;
}

// ---------------------------------------------------------------------------
// Agentic AI — autonomy ladder
// ---------------------------------------------------------------------------

/**
 * L0 Observe    — explain only, no authoring
 * L1 Assist     — drafts suggestions, human writes the change
 * L2 Propose    — opens a change set with diff + simulation, human approves
 * L3 Bounded    — auto-publishes inside guardrails, auto-reverts on breach
 * L4 Autonomous — runs experiments, promotes winners, humans audit after
 */
export type AutonomyLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export const AUTONOMY_LEVELS: Record<
  AutonomyLevel,
  { name: string; summary: string; humanGate: string; rollback: string }
> = {
  L0: {
    name: 'Observe',
    summary: 'Explains decisions and answers "why". No authoring.',
    humanGate: 'Not applicable',
    rollback: 'Not applicable',
  },
  L1: {
    name: 'Assist',
    summary: 'Drafts rules, copy and creatives as suggestions.',
    humanGate: 'Human writes the change',
    rollback: 'Not applicable',
  },
  L2: {
    name: 'Propose',
    summary: 'Opens a change set with diff and simulation results.',
    humanGate: 'Approve before publish',
    rollback: 'Manual',
  },
  L3: {
    name: 'Bounded',
    summary: 'Auto-publishes changes that stay inside configured guardrails.',
    humanGate: 'Post-hoc review',
    rollback: 'Automatic on guardrail breach',
  },
  L4: {
    name: 'Autonomous',
    summary: 'Runs experiments, promotes winners, retires losers.',
    humanGate: 'Audit only',
    rollback: 'Automatic',
  },
};

export type ChangeType =
  | 'boost_adjust'
  | 'creative_copy'
  | 'policy_edit'
  | 'offer_create'
  | 'offer_retire'
  | 'flow_edit'
  | 'arbitration_weights';

export interface AutonomyGuardrails {
  /** Percentage of traffic an autonomous change may affect. 0-100. */
  maxBlastRadiusPct: number;
  /** Change types the agent may make at this level. */
  allowedChangeTypes: ChangeType[];
  /** Maximum permitted change to a boost, as a fraction. 0.1 = +/-10%. */
  maxBoostDelta: number;
  /** Maximum permitted change to committed spend, in minor units. */
  maxBudgetDelta: Money;
  /** Fields the agent may never introduce as a decision input. */
  protectedAttributes: string[];
  /** A simulation must pass before any auto-publish. */
  requireSimulationPass: boolean;
  /** Maximum tolerated disparity ratio between protected cohorts. */
  biasGateThreshold: number;
}

/**
 * Autonomy is resolved most-specific-first:
 *   offer > category > objective > tenant
 * so a regulated retention offer can sit at L1 while an accessory upsell
 * runs at L3 under the same tenant.
 */
export interface AutonomySetting {
  id: string;
  scope: PolicyScope;
  level: AutonomyLevel;
  guardrails: AutonomyGuardrails;
  /** Why this scope was granted this level — required for audit. */
  rationale: string;
  updatedAt: string;
  updatedBy: string;
}

export type AgentActivityOutcome =
  | 'suggested'
  | 'proposed'
  | 'auto_applied'
  | 'reverted'
  | 'blocked';

/** One entry in the agent activity feed on /agentic. */
export interface AgentActivity {
  id: string;
  timestamp: string;
  agentId: string;
  level: AutonomyLevel;
  scope: PolicyScope;
  changeType: ChangeType;
  summary: string;
  outcome: AgentActivityOutcome;
  /** Set when outcome is 'blocked' or 'reverted'. */
  guardrailBreached: string | null;
  /** Links to the change set this produced, when level >= L2. */
  changeSetId: string | null;
}

// ---------------------------------------------------------------------------
// Resolution helper
// ---------------------------------------------------------------------------

const SCOPE_SPECIFICITY: Record<PolicyScope['level'], number> = {
  tenant: 0,
  objective: 1,
  category: 2,
  offer: 3,
};

/**
 * Resolve the effective autonomy setting for an offer by walking the
 * hierarchy and taking the most specific match.
 */
export function resolveAutonomy(
  settings: AutonomySetting[],
  ctx: { offerId: string; categoryId: string; objectiveId: string }
): AutonomySetting | null {
  const matches = settings.filter((s) => {
    switch (s.scope.level) {
      case 'tenant':
        return true;
      case 'objective':
        return s.scope.targetId === ctx.objectiveId;
      case 'category':
        return s.scope.targetId === ctx.categoryId;
      case 'offer':
        return s.scope.targetId === ctx.offerId;
      default:
        return false;
    }
  });

  if (matches.length === 0) return null;

  return matches.reduce((best, cur) =>
    SCOPE_SPECIFICITY[cur.scope.level] > SCOPE_SPECIFICITY[best.scope.level]
      ? cur
      : best
  );
}

/** Format money for display without pulling in a currency library. */
export function formatMoney(m: Money): string {
  const symbol = m.currency === 'GBP' ? '£' : m.currency === 'USD' ? '$' : '€';
  return `${symbol}${(m.amount / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Integrations
//
// A connector is a configured route to data the platform does not hold. Once
// configured it is used at decision time: a flow's source node names the
// connectors it needs, resolution fetches them before execution, and the values
// land in the request input that the engine hashes.
//
// The ordering matters and is the whole design. Integrations are I/O, and I/O
// is not reproducible: the bureau that answered in 40ms today may be down in
// six months, and it will certainly not return the same credit score. So they
// run *outside* the deterministic core. What the core sees is a snapshot, which
// it hashes into `inputSnapshotHash`. Replay never calls a connector; it
// replays against the recorded snapshot. That is what makes an integrated
// decision as reproducible as one with no integrations at all.
// ---------------------------------------------------------------------------

/** How a connector reaches its data. */
export type ConnectorKind =
  /** HTTP call to an external system. */
  | 'rest'
  /** Low-latency read from the online feature store. */
  | 'feature-store'
  /** Fixed values, for a field the tenant supplies as configuration. */
  | 'static';

/**
 * What a connector does when it fails or times out.
 *
 * `fail` is the honest default for anything a policy depends on: a decision
 * made without a field the eligibility rules need is not a decision, it is a
 * guess. `omit` and `default` exist because some fields genuinely are optional,
 * but choosing them is a statement that the decision is still valid without the
 * field, and the trace records that it happened.
 */
export type ConnectorFailureMode = 'fail' | 'omit' | 'default';

/** One field this connector supplies, and where it lives in the response. */
export interface FieldBinding {
  /**
   * The name the field takes in the decision input, and therefore the name
   * policies and score nodes reference.
   */
  field: string;
  /** Dotted path into the connector's response payload. */
  path: string;
  type: 'string' | 'number' | 'boolean';
  /** Used when the connector fails and its failure mode is `default`. */
  defaultValue?: string | number | boolean;
}

export interface Connector {
  id: string;
  name: string;
  kind: ConnectorKind;
  description: string;
  /** Endpoint, feature-store namespace, or empty for `static`. */
  target: string;
  /**
   * Declared p95, in milliseconds.
   *
   * Not measured — declared, by whoever configured the connector. The compiler
   * adds it to the critical path, so a 200ms bureau call fails compilation
   * against a 50ms budget rather than failing in production at 3am. If the
   * declaration is a lie, the budget is a lie, and that is a conversation to
   * have with the integration owner at design time.
   */
  declaredP95Ms: number;
  timeoutMs: number;
  onFailure: ConnectorFailureMode;
  /** 0 disables caching. Caching is a measured concern, never a hashed one. */
  cacheTtlSeconds: number;
  provides: FieldBinding[];
  active: boolean;
  updatedAt: string;
  updatedBy: string;
}

/**
 * A content slot in a customer journey, as a configured object.
 *
 * `placement` has been a string on a decision request since the beginning: the
 * engine reads it for the context term and writes it to the record, and nothing
 * else looks at it. That is enough to decide, and not enough to integrate
 * against — a website needs to know how many actions a slot can hold and which
 * flow answers for it, and neither belongs in the caller's code.
 *
 * Deliberately **not** part of `CatalogueSnapshot`. A placement configures how
 * a decision is delivered, not what is decided, so it is not hashed into the
 * decision and changing a slot count moves no chain hash. The consequence is
 * stated rather than hidden: a slate is reproducible from its decision plus the
 * placement that composed it, and pinning the placement into the hashed
 * decision is a question for W-028, when composition becomes more than ordering.
 */
export interface Placement {
  id: string;
  /**
   * The value a decision request carries in `placement`, and the value a
   * creative names. The join between configuration and everything that already
   * exists, which is why it is a key rather than an id.
   */
  key: string;
  name: string;
  description: string;
  channel: Channel;
  /**
   * How many actions this slot can show, at most.
   *
   * A page hero is 1. A grid is 3. The decision does not change with it — the
   * ranking is the same either way — so this governs how much of the ranking
   * the caller is given, not what was decided.
   */
  slotCount: number;
  /** Which flow answers for this slot. */
  artifactId: string;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
}

/** Which connector was configured to supply a field. Reproducible. */
export interface SourceBinding {
  field: string;
  connectorId: string;
  nodeId: string;
}

/** What actually happened on the wire. Measured, never hashed. */
export interface SourceCall {
  connectorId: string;
  ms: number;
  cacheHit: boolean;
  outcome: 'ok' | 'timeout' | 'error' | 'skipped';
  /** Fields this call put into the input. */
  fields: string[];
  /** Present when the call did not succeed. */
  detail?: string;
}
