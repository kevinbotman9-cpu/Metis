/** Compiled flow artifacts, including their DIR graph. Deterministic. */


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
  /**
   * The approved stand-in for a model output nobody produced.
   *
   * This tenant runs no scoring node, so every candidate falls back. Declaring
   * the default means the trace records an approval rather than an assumption.
   */
  missingScoreDefault?: {
    propensity: number;
    context: number;
    approvedBy: string;
    approvedAt: string;
  };
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
      'The one flow this tenant runs. Inbound web: the brief calls it the real-time NBA API behind the logged-in site.',
    activeVersion: '1.0.0',
    versions: ['1.0.0'],
    nodeCount: 5,
    // source 4.2 + eligibility 1.1 + constraint 0.6 + arbitrate 2.3. The
    // relevance branch runs beside eligibility and does not add to the path.
    estimatedP95LatencyMs: 8.2,
    status: 'active',
    // All five. A tenant with five offers has no candidate subset to choose:
    // the flow considers the catalogue, because the catalogue is five things.
    candidateKeys: [
      'fios_gigabit',
      '5g_home_ultimate',
      'gaming_plus_bundle',
      'disney_plus',
      'netflix',
    ],
    /**
     * What ranking does about candidates nothing scored — which here is all of
     * them, because this flow has no scoring node.
     *
     * Declared rather than left to the engine's neutral 1.0. Both produce the
     * same arithmetic; only one of them is a number somebody chose. The trace
     * records the approval, so "why did an unscored offer outrank a scored
     * one" has an answer that is not "the engine assumed".
     */
    missingScoreDefault: {
      propensity: 1,
      context: 1,
      approvedBy: 'marcus.webb@telco.example',
      approvedAt: '2026-09-12',
    },
    nodes: [
      {
        id: 'source_customer',
        type: 'source',
        connectorIds: [
          'conn_serviceability',
          'conn_order_book',
          'conn_engagement',
          'conn_network_usage',
          'conn_consent_registry',
        ],
        label: 'Customer and address',
        description:
          'Loads the account, what they already hold, and what the network can deliver at the service address. Serviceability and coverage arrive from conn_serviceability, which is what makes the fiber refusal nameable.',
        estimatedMs: 4.2,
        position: { x: COL[0], y: 120 },
      },
      {
        id: 'filter_eligibility',
        type: 'filter',
        label: 'Eligibility',
        description:
          'Hard gates: an active account, serviceability at the address, 5G coverage, no open broadband order, a line for the add-on to attach to, and a partner agreement covering the region. Failing one removes the candidate outright.',
        estimatedMs: 1.1,
        policyIds: [
          'pol_account_active',
          'pol_fios_serviceable',
          'pol_5g_coverage',
          'pol_no_open_broadband_order',
          'pol_has_broadband',
          'pol_disney_available',
          'pol_netflix_available',
        ],
        position: { x: COL[1], y: 40 },
      },
      {
        id: 'filter_relevance',
        type: 'filter',
        label: 'Relevance',
        description:
          'Situational: already held, moving house, no bandwidth need, no affinity, or the broadband need not yet met. This is also where an accepted offer stops being offered — from what the customer now holds, not from the interaction log.',
        estimatedMs: 0.9,
        policyIds: [
          'pol_not_moving',
          'pol_not_on_fios',
          'pol_not_on_5g_home',
          'pol_broadband_need_met',
          'pol_fios_interest',
          'pol_5g_bandwidth_need',
          'pol_entertainment_affinity',
          'pol_gaming_affinity',
          'pol_not_on_disney',
          'pol_not_on_netflix',
        ],
        position: { x: COL[1], y: 200 },
      },
      {
        id: 'constraint_contact',
        type: 'constraint',
        label: 'Frequency and suppression',
        description:
          'Caps per channel, and a 30-day rest on anything the customer has declined. Suppression here still records the full ranking, so what would have been offered is answerable.',
        estimatedMs: 0.6,
        // No ids listed: a constraint node applies every active frequency
        // policy whose scope covers the candidate, which for this tenant is
        // both of them. The channel on each policy decides where it bites.
        position: { x: COL[2], y: 200 },
      },
      {
        id: 'arbitrate_priority',
        type: 'arbitrate',
        label: 'Arbitrate',
        description:
          'Ranks what survived. No model ran, so propensity and context are the approved defaults above and priority is value times boost — which is why both boosts carry a reason.',
        estimatedMs: 2.3,
        formula: 'Priority = P^1.0 × C^1.0 × V^1.0 × B^1.0',
        position: { x: COL[3], y: 120 },
      },
    ],
    edges: [
      { id: 'e1', source: 'source_customer', target: 'filter_eligibility' },
      { id: 'e2', source: 'source_customer', target: 'filter_relevance' },
      { id: 'e3', source: 'filter_eligibility', target: 'constraint_contact' },
      { id: 'e4', source: 'filter_relevance', target: 'constraint_contact' },
      { id: 'e5', source: 'constraint_contact', target: 'arbitrate_priority' },
    ],
    updatedAt: iso(-6),
    updatedBy: 'marcus.webb@telco.example',
  },
  {
    /**
     * A draft somebody started and has not finished, and the compiler refuses it.
     *
     * Here because two suites need a flow the registry does not hold —
     * `registry.spec.ts` for the compilation gate and `shadow.spec.ts` for
     * "no panel at all for a flow the registry never accepted" — and with one
     * cleanly-published flow that state cannot exist. It used to be supplied by
     * `plan-fit-nudges` in a tenant that had four flows.
     *
     * Not filler. An unfinished flow is a real thing for a tenant to have, it
     * is `draft` and selects nothing, and the console has to be able to show
     * one. What makes it useful to a test is *why* it fails: there is no
     * `arbitrate` node, so nothing ever picks a winner, which the compiler
     * refuses rather than shipping a flow that would decide nothing at runtime.
     */
    id: 'entertainment-cross-sell',
    name: 'Entertainment cross-sell (draft)',
    description:
      'Started for the gaming and streaming attach, and not finished: it ranks nothing yet.',
    activeVersion: '0.1.0',
    versions: ['0.1.0'],
    nodeCount: 2,
    estimatedP95LatencyMs: 5.3,
    status: 'draft',
    candidateKeys: ['gaming_plus_bundle', 'disney_plus', 'netflix'],
    nodes: [
      {
        id: 'source_customer',
        type: 'source',
        connectorIds: ['conn_engagement'],
        label: 'Customer and affinity',
        description: 'Loads what the household already watches and plays.',
        estimatedMs: 4.2,
        position: { x: COL[0], y: 120 },
      },
      {
        id: 'filter_relevance',
        type: 'filter',
        label: 'Relevance',
        description: 'Entertainment affinity, and whether the line is already provisioned.',
        estimatedMs: 1.1,
        policyIds: ['pol_broadband_need_met', 'pol_entertainment_affinity'],
        position: { x: COL[1], y: 120 },
      },
    ],
    edges: [{ id: 'd1', source: 'source_customer', target: 'filter_relevance' }],
    updatedAt: iso(-30),
    updatedBy: 'sarah.chen@telco.example',
  },
];
