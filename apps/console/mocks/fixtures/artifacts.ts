/** Compiled flow artifacts, including their DIR graph. Deterministic. */

import { seededCandidateKeys } from './seed';

const T0 = Date.parse('2026-09-01T09:00:00Z');
const iso = (h: number) => new Date(T0 + h * 3600_000).toISOString();

/** Node types the canvas knows how to render. Mirrors packages/nodes-core. */
export type FlowNodeType =
  | 'source'
  | 'filter'
  | 'set-property'
  | 'score-model'
  | 'constraint'
  | 'arbitrate'
  | 'switch'
  | 'sub-flow'
  | 'champion-challenger'
  | 'explain-annotate';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  label: string;
  /** Plain-language description shown in the inspector. */
  description: string;
  /** Worst-case contribution to latency, from the compiler's cost analysis. */
  estimatedMs: number;
  /** Targeting policy IDs this node evaluates, where relevant. */
  policyIds?: string[];
  /**
   * Connectors a source node draws on.
   *
   * The engine never calls them: resolution runs before execution and the
   * values arrive in the request input. What this drives is the compiler's
   * critical path, and the provenance recorded in the trace.
   */
  connectorIds?: string[];
  /** Pinned model version for score nodes. */
  model?: { id: string; version: string };
  /** Arbitration formula for arbitrate nodes. */
  formula?: string;
  /** Rendering position. Hand-placed so the layout is stable and readable. */
  position: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** Shown on the edge for branch nodes. */
  label?: string;
}

export interface ArtifactSummary {
  id: string;
  name: string;
  description: string;
  activeVersion: string;
  versions: string[];
  /**
   * What the candidate set was in versions before the active one.
   *
   * `versions` listed a history the registry had never heard of: the seed
   * published `activeVersion` and nothing else, so the console showed "4
   * versions, all replayable" against a registry holding one. Shadow mode is
   * what made that bite — there was no predecessor to shadow against.
   *
   * A version absent from this map is seeded with the active candidate set: it
   * differed in ways this fixture does not model, and inventing a difference
   * would be worse than declaring none.
   */
  priorCandidateKeys?: Record<string, string[]>;
  nodeCount: number;
  estimatedP95LatencyMs: number;
  status: 'active' | 'draft' | 'retired';
  /** Offer keys this flow can select from. */
  candidateKeys: string[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  updatedAt: string;
  updatedBy: string;
}

// Column positions keep the graphs readable without a layout algorithm.
const COL = [0, 240, 480, 720, 960];

export const artifacts: ArtifactSummary[] = [
  {
    id: 'next-best-action',
    name: 'Next Best Action',
    description:
      'The main arbitration flow. Runs on every inbound and outbound touchpoint.',
    activeVersion: '2.4.0',
    versions: ['2.4.0', '2.3.1', '2.3.0', '2.2.0'],
    nodeCount: 7,
    // Critical path: source 4.2 + eligibility 1.1 + score 3.1 + suitability 1.2
    // + arbitrate 2.3. The parallel branches do not add to the path.
    estimatedP95LatencyMs: 11.9,
    status: 'active',
    candidateKeys: [
      'upsell_5g', 'upsell_data', 'retention_offer', 'addon_roaming',
      // The rest of the growth catalogue. Authored keys stay first, so the
      // offers a demo walks through are the ones it keeps meeting.
      ...seededCandidateKeys('iss_growth'),
    ],
    // Roaming joined the flow in 2.4.0, so 2.3.1 could not select it. This is
    // the difference shadow mode compares against.
    priorCandidateKeys: { '2.3.1': ['upsell_5g', 'upsell_data', 'retention_offer'] },
    nodes: [
      {
        id: 'source_customer',
        type: 'source',
        connectorIds: ['conn_billing_ledger', 'conn_network_usage', 'conn_consent_registry'],
        label: 'Customer profile',
        description:
          'Loads the customer record, plan, consent state and 90 days of interaction history from the online feature store.',
        estimatedMs: 4.2,
        position: { x: COL[0], y: 120 },
      },
      {
        id: 'filter_eligibility',
        type: 'filter',
        label: 'Eligibility',
        description:
          'Hard gates: age, credit status, account standing and network availability. Failing one removes the candidate outright.',
        estimatedMs: 1.1,
        policyIds: ['pol_age_18', 'pol_credit_pass', 'pol_fibre_available'],
        position: { x: COL[1], y: 40 },
      },
      {
        id: 'filter_relevance',
        type: 'filter',
        label: 'Relevance',
        description:
          'Situational relevance: already held, trigger not fired, or the wrong moment in the lifecycle.',
        estimatedMs: 0.9,
        policyIds: ['pol_not_on_5g', 'pol_heavy_user', 'pol_contract_ending'],
        position: { x: COL[1], y: 200 },
      },
      {
        id: 'score_propensity',
        type: 'score-model',
        label: 'Acceptance propensity',
        description:
          'Predicts acceptance. Pinned at compile time so the decision replays identically — and deterministic, because no model gateway is bound yet (W-029).',
        estimatedMs: 3.1,
        model: { id: 'propensity_accept_v4', version: '4.2.0' },
        position: { x: COL[2], y: 120 },
      },
      {
        id: 'filter_suitability',
        type: 'constraint',
        label: 'Suitability',
        description:
          'Affordability and fair-value checks. This is the FCA-facing tier: it can suppress a commercially attractive offer.',
        estimatedMs: 1.2,
        policyIds: ['pol_afford_5g', 'pol_afford_retention'],
        position: { x: COL[3], y: 40 },
      },
      {
        id: 'constraint_contact',
        type: 'constraint',
        label: 'Frequency policy',
        description:
          'Frequency caps and cooldowns. Suppression here still records the full ranking, so you can answer what would have been offered.',
        estimatedMs: 0.6,
        position: { x: COL[3], y: 200 },
      },
      {
        id: 'arbitrate_priority',
        type: 'arbitrate',
        label: 'Arbitrate',
        description:
          'Ranks surviving candidates and selects a winner. The terms and weights are recorded in every trace.',
        estimatedMs: 2.3,
        formula: 'Priority = P^1.0 × V^1.0 × B^1.0 × C^0.5',
        position: { x: COL[4], y: 120 },
      },
    ],
    edges: [
      { id: 'e1', source: 'source_customer', target: 'filter_eligibility' },
      { id: 'e2', source: 'source_customer', target: 'filter_relevance' },
      { id: 'e3', source: 'filter_eligibility', target: 'score_propensity' },
      { id: 'e4', source: 'filter_relevance', target: 'score_propensity' },
      { id: 'e5', source: 'score_propensity', target: 'filter_suitability' },
      { id: 'e6', source: 'score_propensity', target: 'constraint_contact' },
      { id: 'e7', source: 'filter_suitability', target: 'arbitrate_priority' },
      { id: 'e8', source: 'constraint_contact', target: 'arbitrate_priority' },
    ],
    updatedAt: iso(-12),
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'inbound-web-offers',
    name: 'Inbound Web Offers',
    description:
      'Lighter decision flow for anonymous and logged-in web placements. Lighter in scoring, not in governance: consent and frequency are enforced here exactly as they are outbound.',
    // 1.9.0, not 1.8.3: adding a gate changes what the flow decides, and a
    // patch bump would say it did not.
    activeVersion: '1.9.0',
    versions: ['1.9.0', '1.8.2', '1.8.1', '1.7.0'],
    nodeCount: 5,
    estimatedP95LatencyMs: 8.7,
    status: 'active',
    // Curated, and deliberately not widened with the seeded catalogue.
    //
    // This flow answers `homepage_hero`, which has one slot. A hero is the most
    // tightly picked surface a telco has — you do not put twenty offers in it —
    // and the whole seeded acquisition catalogue competing for one slot would
    // mean the slate is whichever offer happened to rank highest, which is not
    // what a hero is for. The other flows carry the seeded catalogue.
    candidateKeys: ['acq_sim_30', 'acq_fibre_900', 'upsell_data'],
    nodes: [
      {
        id: 'source_session',
        type: 'source',
        connectorIds: ['conn_consent_registry'],
        label: 'Session context',
        description:
          'Anonymous session signals plus the customer record when the visitor is signed in.',
        estimatedMs: 2.8,
        position: { x: COL[0], y: 100 },
      },
      {
        id: 'switch_known',
        type: 'switch',
        label: 'Known visitor?',
        description:
          'Branches on whether the session resolves to a customer. Anonymous visitors only see acquisition offers.',
        estimatedMs: 0.3,
        position: { x: COL[1], y: 100 },
      },
      {
        id: 'filter_web_eligibility',
        type: 'filter',
        label: 'Eligibility',
        description: 'Availability at the address and basic contractual gates.',
        estimatedMs: 1.0,
        policyIds: ['pol_fibre_available'],
        position: { x: COL[2], y: 100 },
      },
      {
        // The node the flow was missing, and the reason a website could tick
        // "marketing: off" and still be shown a marketing offer. Consent and
        // frequency are enforced at constraint nodes only — a flow of filters
        // reads the input and ignores both — so the storefront's consent
        // checkboxes and contact-history counters reached the engine and had
        // nothing to act on them.
        //
        // Consent is not a property of the channel. A visitor who has withheld
        // it has withheld it on the website too, and "lighter flow for web"
        // was never a reason to skip asking.
        id: 'constraint_web_contact',
        type: 'constraint',
        label: 'Consent & contact',
        description:
          'Marketing consent, and the frequency caps whose scope covers these offers.',
        estimatedMs: 0.6,
        position: { x: COL[3], y: 100 },
      },
      {
        id: 'arbitrate_web',
        type: 'arbitrate',
        label: 'Arbitrate',
        description: 'Ranks by value and boost only; no propensity model on anonymous traffic.',
        estimatedMs: 1.6,
        formula: 'Priority = V^1.0 × B^1.0',
        position: { x: COL[4], y: 100 },
      },
    ],
    edges: [
      { id: 'w1', source: 'source_session', target: 'switch_known' },
      { id: 'w2', source: 'switch_known', target: 'filter_web_eligibility', label: 'either' },
      { id: 'w3', source: 'filter_web_eligibility', target: 'constraint_web_contact' },
      { id: 'w4', source: 'constraint_web_contact', target: 'arbitrate_web' },
    ],
    updatedAt: iso(-96),
    updatedBy: 'sarah.chen@telco.example',
  },
  {
    id: 'retention-outbound',
    name: 'Retention Outbound Queue',
    description:
      'Builds the agent call queue for customers near contract end or with a PAC request.',
    activeVersion: '3.1.0',
    versions: ['3.1.0', '3.0.4'],
    nodeCount: 6,
    estimatedP95LatencyMs: 19.7,
    /**
     * Retired, because it cannot be published. G-071.
     *
     * This flow serves one channel, `outbound_call`, and 18 of its 20
     * candidates have no active creative on it — they have live web and push
     * content, which this flow never speaks through. ADR-012 §B2's check says
     * so, and once the registry compiles against the same context the console
     * does, the publish is refused and there is nothing to promote.
     *
     * It was `active` while two compile contexts disagreed, and it made 3,466
     * seeded decisions. **Every one of the 807 offers it made was
     * undeliverable.** The alternative — authoring 18 outbound-call creatives
     * into the fixture — would have turned a red check green by inventing the
     * content whose absence is the finding: the tenant has two active
     * outbound-call creatives against 78 email, 79 sms, 75 web and 69 push,
     * which is [G-044](../../../../docs/gaps.md).
     */
    status: 'retired',
    candidateKeys: ['retention_offer', 'winback_credit', ...seededCandidateKeys('iss_retention')],
    nodes: [
      {
        id: 'source_contracts',
        type: 'source',
        connectorIds: ['conn_billing_ledger', 'conn_network_usage'],
        label: 'Contract and churn signals',
        description: 'Contract end dates, PAC requests and churn model output.',
        estimatedMs: 6.4,
        position: { x: COL[0], y: 100 },
      },
      {
        id: 'filter_retention_trigger',
        type: 'filter',
        label: 'Retention trigger',
        description: 'Contract ending within 90 days, or a PAC code requested in the last 14.',
        estimatedMs: 1.4,
        policyIds: ['pol_contract_ending', 'pol_pac_requested'],
        position: { x: COL[1], y: 100 },
      },
      {
        id: 'score_churn',
        type: 'score-model',
        label: 'Churn risk',
        description: 'Pinned gradient-boosted churn model. Drives queue ordering, not eligibility.',
        estimatedMs: 5.2,
        model: { id: 'churn_gbm', version: '7.1.0' },
        position: { x: COL[2], y: 100 },
      },
      {
        id: 'constraint_fair_value',
        type: 'constraint',
        label: 'Fair value',
        description:
          'A retention offer must reduce the customer bill. Blocks anything that increases it.',
        estimatedMs: 1.1,
        policyIds: ['pol_afford_retention'],
        position: { x: COL[3], y: 20 },
      },
      {
        id: 'constraint_winback_cooldown',
        type: 'constraint',
        label: 'Winback cooldown',
        description: 'Suppresses contact for 30 days after a declined winback offer.',
        estimatedMs: 0.8,
        position: { x: COL[3], y: 180 },
      },
      {
        id: 'arbitrate_queue',
        type: 'arbitrate',
        label: 'Queue ordering',
        description: 'Orders the agent call queue by churn risk weighted against offer cost.',
        estimatedMs: 3.2,
        formula: 'Priority = Churn^1.5 × V^0.8 × B^1.0',
        position: { x: COL[4], y: 100 },
      },
    ],
    edges: [
      { id: 'r1', source: 'source_contracts', target: 'filter_retention_trigger' },
      { id: 'r2', source: 'filter_retention_trigger', target: 'score_churn' },
      { id: 'r3', source: 'score_churn', target: 'constraint_fair_value' },
      { id: 'r4', source: 'score_churn', target: 'constraint_winback_cooldown' },
      { id: 'r5', source: 'constraint_fair_value', target: 'arbitrate_queue' },
      { id: 'r6', source: 'constraint_winback_cooldown', target: 'arbitrate_queue' },
    ],
    updatedAt: iso(-26),
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    id: 'plan-fit-nudges',
    name: 'Plan Fit Nudges',
    description:
      'Service-led flow that suggests a cheaper plan when usage is consistently low.',
    activeVersion: '0.4.0',
    versions: ['0.4.0'],
    nodeCount: 3,
    estimatedP95LatencyMs: 5.2,
    status: 'draft',
    candidateKeys: ['svc_plan_fit', 'svc_bill_shock', ...seededCandidateKeys('iss_service', 10)],
    nodes: [
      {
        id: 'source_usage',
        type: 'source',
        label: 'Usage history',
        description: 'Twelve months of usage, needed to project a reliable trend.',
        estimatedMs: 3.1,
        position: { x: COL[0], y: 100 },
      },
      {
        id: 'filter_history',
        type: 'filter',
        label: 'Enough history',
        description: 'At least three months of usage before any projection is trusted.',
        estimatedMs: 0.7,
        policyIds: ['pol_usage_projection'],
        position: { x: COL[1], y: 100 },
      },
      {
        id: 'explain_nudge',
        type: 'explain-annotate',
        label: 'Explain the nudge',
        description:
          'Emits the plain-language reason shown to the customer, so the message can state why it was sent.',
        estimatedMs: 1.4,
        position: { x: COL[2], y: 100 },
      },
    ],
    edges: [
      { id: 'p1', source: 'source_usage', target: 'filter_history' },
      { id: 'p2', source: 'filter_history', target: 'explain_nudge' },
    ],
    updatedAt: iso(-2),
    updatedBy: 'priya.natarajan@telco.example',
  },
];
