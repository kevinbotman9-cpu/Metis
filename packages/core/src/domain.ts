/**
 * METIS Domain Model — CDH-grade proposition taxonomy
 *
 * Hierarchy:  Issue > Group > Proposition > Treatment
 *
 * This is the contract every console surface renders and every strategy
 * references. A strategy's candidate set is a list of Proposition IDs; the
 * runtime resolves them to full objects with policies, financials and
 * channel treatments.
 */

// ---------------------------------------------------------------------------
// Proposition hierarchy
// ---------------------------------------------------------------------------

/** Top of the hierarchy: the business objective a proposition serves. */
export interface Issue {
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

/** A product family within an Issue, e.g. "Mobile Plans" under "Retention". */
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

export type PropositionStatus = 'draft' | 'active' | 'paused' | 'retired';

/** Money is stored in minor units to avoid float drift. */
export interface Money {
  /** Minor units, e.g. pence. 3500 = £35.00 */
  amount: number;
  currency: 'GBP' | 'USD' | 'EUR';
}

export interface PropositionFinancials {
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
  /** ISO date. Proposition cannot be offered before this. */
  startsAt: string;
  /** ISO date, or null for open-ended. */
  endsAt: string | null;
}

/** The offer itself — what "mastering offers" produces. */
export interface Proposition {
  id: string;
  groupId: string;
  /** Denormalised for tree rendering and breadcrumbs. */
  issueId: string;
  name: string;
  key: string;
  description: string;
  status: PropositionStatus;
  financials: PropositionFinancials;
  validity: ValidityWindow;
  /**
   * Business priority weight used by arbitration's lever term.
   * 1.0 is neutral; >1 boosts, <1 suppresses.
   */
  lever: number;
  /** Engagement policy rule IDs applying to this proposition. */
  policyIds: string[];
  /** Channel treatments. At least one is required to go active. */
  treatmentIds: string[];
  /** Free-form labels for search and bulk operations. */
  tags: string[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

// ---------------------------------------------------------------------------
// Treatments — channel-specific content
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

export type TreatmentContent =
  | EmailContent
  | SmsContent
  | WebContent
  | PushContent
  | OutboundCallContent;

export interface Treatment {
  id: string;
  propositionId: string;
  name: string;
  channel: Channel;
  content: TreatmentContent;
  /** Only active treatments are eligible for delivery. */
  active: boolean;
  /** Locale this treatment serves, e.g. "en-GB". */
  locale: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Engagement policy — Pega's three-tier model
// ---------------------------------------------------------------------------

/**
 * eligibility   — hard filters. CAN we legally/contractually offer this?
 * applicability — situational. SHOULD we offer it right now?
 * suitability   — affordability and ethics. Is it RIGHT for this customer?
 */
export type PolicyKind = 'eligibility' | 'applicability' | 'suitability';

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

export interface EngagementPolicy {
  id: string;
  name: string;
  kind: PolicyKind;
  description: string;
  /** All conditions must pass (AND). Use separate policies for OR. */
  conditions: PolicyCondition[];
  /**
   * Scope this policy binds to. A policy at issue level applies to every
   * proposition beneath it.
   */
  scope: PolicyScope;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyScope {
  level: 'tenant' | 'issue' | 'group' | 'proposition';
  /** null when level is 'tenant'. */
  targetId: string | null;
}

// ---------------------------------------------------------------------------
// Contact policy — suppression
// ---------------------------------------------------------------------------

export type ContactPolicyPeriod = 'day' | 'week' | 'month';

export interface ContactPolicy {
  id: string;
  name: string;
  description: string;
  /** null = applies to every channel. */
  channel: Channel | null;
  /** Maximum outbound contacts permitted in the period. */
  maxContacts: number;
  period: ContactPolicyPeriod;
  /**
   * Days to suppress a proposition after the customer rejects or ignores it.
   */
  cooldownDaysAfterReject: number;
  scope: PolicyScope;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Arbitration — P x V x L x C
// ---------------------------------------------------------------------------

/**
 * Priority = Propensity ^wP  x  Value ^wV  x  Lever ^wL  x  Context ^wC
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
    lever: number;
    context: number;
  };
  /** Human-readable rendering of the formula for the trace and UI. */
  formula: string;
  updatedAt: string;
  updatedBy: string;
}

/** A per-scope business weight, surfaced in the lever tuning UI. */
export interface Lever {
  id: string;
  name: string;
  scope: PolicyScope;
  /** Multiplier. 1.0 neutral. */
  value: number;
  reason: string;
  /** Levers can be time-boxed for campaigns. */
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
 * L2 Propose    — opens a change request with diff + simulation, human approves
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
    summary: 'Drafts rules, copy and treatments as suggestions.',
    humanGate: 'Human writes the change',
    rollback: 'Not applicable',
  },
  L2: {
    name: 'Propose',
    summary: 'Opens a change request with diff and simulation results.',
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
  | 'lever_adjust'
  | 'treatment_copy'
  | 'policy_edit'
  | 'proposition_create'
  | 'proposition_retire'
  | 'strategy_edit'
  | 'arbitration_weights';

export interface AutonomyGuardrails {
  /** Percentage of traffic an autonomous change may affect. 0-100. */
  maxBlastRadiusPct: number;
  /** Change types the agent may make at this level. */
  allowedChangeTypes: ChangeType[];
  /** Maximum permitted change to a lever, as a fraction. 0.1 = +/-10%. */
  maxLeverDelta: number;
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
 *   proposition > group > issue > tenant
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
  /** Links to the change request this produced, when level >= L2. */
  changeRequestId: string | null;
}

// ---------------------------------------------------------------------------
// Resolution helper
// ---------------------------------------------------------------------------

const SCOPE_SPECIFICITY: Record<PolicyScope['level'], number> = {
  tenant: 0,
  issue: 1,
  group: 2,
  proposition: 3,
};

/**
 * Resolve the effective autonomy setting for a proposition by walking the
 * hierarchy and taking the most specific match.
 */
export function resolveAutonomy(
  settings: AutonomySetting[],
  ctx: { propositionId: string; groupId: string; issueId: string }
): AutonomySetting | null {
  const matches = settings.filter((s) => {
    switch (s.scope.level) {
      case 'tenant':
        return true;
      case 'issue':
        return s.scope.targetId === ctx.issueId;
      case 'group':
        return s.scope.targetId === ctx.groupId;
      case 'proposition':
        return s.scope.targetId === ctx.propositionId;
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
