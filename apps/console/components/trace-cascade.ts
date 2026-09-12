import type { TraceDto, DenialDto, EliminationDto } from '@/lib/api-client';

/**
 * The elimination funnel, derived from the trace's own nodes.
 *
 * `docs/METIS_CONSOLE_SPEC.md` §4.7. Candidates enter, each node removes some,
 * one survives — a decomposition where every stage is a subset of the one above
 * and the interesting fact is what fell out between them.
 *
 * **Derived, not declared.** The obvious rail is the three-tier targeting model
 * plus frequency: eligibility → relevance → suitability → frequency. That is
 * the model, and it is not what a flow is. `inbound-web-offers` has one filter
 * node and no relevance or suitability at all; `next-best-action` has all three
 * plus a score model and a contact constraint. Hardcoding the six would show
 * three permanently empty stages on two thirds of this tenant's decisions — a
 * screen lying about the flow it is showing. The rail is built from
 * `eliminations`, which is the flow that actually ran.
 *
 * **The tier comes from the artifact.** `nodeType` cannot name it:
 * `filter_suitability` is `nodeType: 'constraint'`, and so is
 * `constraint_contact` — one is an affordability tier and the other a weekly
 * contact cap. Until 2026-09-11 this file inferred the tier from the node id
 * with `/suitab/` and `/frequen|contact|cap/`, which worked on four flows and
 * would have mislabelled the fifth (G-058). The compiler now derives the tier
 * from the kinds of the policies a node declares and writes it into the
 * compiled node, so this reads it.
 *
 * Id matching survives for the nodes a tier does not describe — a source node
 * is not a tier — behind the node's `type`, which names those reliably. A node
 * neither names shows its own id, which is the honest rendering of a name
 * nobody has supplied.
 */

/** One rail stage: a node, what it removed, and what came out the other side. */
export interface TraceStage {
  nodeId: string;
  nodeType: string;
  /**
   * Which question the node asked, from the artifact. Null when the artifact
   * is not loaded, or when the node's policies span more than one tier.
   */
  tier: string | null;
  /** What the node is for, in words. */
  label: string;
  /** The node's own prose. Not stable, per the spec — shown, never parsed. */
  reason: string;
  removed: number;
  survived: number;
  denials: DenialDto[];
  /** Milliseconds, where the trace recorded any for this node. */
  ms: number | null;
}

/** The removals a stage made, grouped by the rule that made them. */
export interface DenialGroup {
  /** `ruleId`, or null where the code is a property of the candidate. */
  ruleId: string | null;
  /** Every code seen in this group. Usually one. */
  codes: string[];
  keys: string[];
}

/**
 * How a node id reads as a stage name.
 *
 * Longest prefix wins so `filter_web_eligibility` resolves to Eligibility
 * rather than to whatever `filter_` alone would mean. A node this does not
 * recognise keeps its own id — visibly a raw identifier, which is the honest
 * rendering of a name nobody has supplied.
 */
const NODE_LABELS: [RegExp, string][] = [
  [/eligib/i, 'Eligibility'],
  [/relevan/i, 'Relevance'],
  [/suitab/i, 'Suitability'],
  [/afford/i, 'Suitability'],
  [/frequen|contact|cap/i, 'Frequency & suppression'],
  [/consent/i, 'Consent'],
  [/arbitrat|rank/i, 'Ranked'],
  [/score|propensity|model/i, 'Scoring'],
  // Not "Candidates entered": that is the synthesised first stage, and a
  // source node landing on the same label put the words twice in one rail with
  // two different figures under them.
  [/source|fetch/i, 'Customer data loaded'],
  [/switch|branch/i, 'Routing'],
  [/histor|trigger/i, 'History'],
];

/** The tier, in the words the three-tier model uses about itself. */
const TIER_LABELS: Record<string, string> = {
  eligibility: 'Eligibility',
  relevance: 'Relevance',
  suitability: 'Suitability',
  frequency: 'Frequency & suppression',
};

/**
 * Node types that name a node on their own.
 *
 * These are not tiers and never will be, and their type is exact — a
 * `score-model` node scores. Matching them here keeps the id patterns for the
 * cases nothing else can name.
 */
const TYPE_LABELS: Record<string, string> = {
  source: 'Customer data loaded',
  'score-model': 'Scoring',
  'score-adaptive': 'Scoring',
  arbitrate: 'Ranked',
  switch: 'Routing',
};

export function labelFor(nodeId: string, nodeType: string, tier?: string | null): string {
  // The artifact first: it is the only one of the three that was decided at
  // compile time rather than read out of a name.
  if (tier && TIER_LABELS[tier]) return TIER_LABELS[tier];
  if (TYPE_LABELS[nodeType]) return TYPE_LABELS[nodeType];
  for (const [pattern, label] of NODE_LABELS) {
    if (pattern.test(nodeId)) return label;
  }
  // Neither the id nor the type names the question this node answers. Say the
  // id rather than invent a category for it.
  return nodeId || nodeType;
}

/**
 * The rail, in execution order.
 *
 * The entry stage is synthesised: `candidateCount` is on the trace rather than
 * in `eliminations`, and without it the rail would open on the first node's
 * survivors and never say how many entered.
 */
export function stagesFor(
  trace: TraceDto,
  /**
   * The compiled nodes, when the artifact has loaded. Omitted, every stage's
   * tier is null and the labels fall back to type and id — which is what the
   * screen shows for the moment before the artifact query returns.
   */
  nodes?: readonly { id: string; tier?: string }[]
): TraceStage[] {
  const timings = (trace.timings ?? {}) as Record<string, number>;
  const eliminations = (trace.eliminations ?? []) as EliminationDto[];
  const tierById = new Map((nodes ?? []).map((n) => [n.id, n.tier ?? null]));

  const entry: TraceStage = {
    nodeId: '__entry',
    nodeType: 'entry',
    label: 'Candidates entered',
    reason:
      'Every action the flow was allowed to consider, fixed by the artifact’s candidate set at compile time.',
    removed: 0,
    survived: trace.candidateCount ?? 0,
    denials: [],
    ms: null,
    tier: null,
  };

  const rest = eliminations.map((e) => ({
    nodeId: e.nodeId,
    nodeType: e.nodeType,
    tier: tierById.get(e.nodeId) ?? null,
    label: labelFor(e.nodeId, e.nodeType, tierById.get(e.nodeId)),
    reason: e.reason ?? '',
    removed: (e.denials ?? []).length,
    survived: (e.survived ?? []).length,
    denials: (e.denials ?? []) as DenialDto[],
    ms: typeof timings[e.nodeId] === 'number' ? timings[e.nodeId] : null,
  }));

  return [entry, ...rest];
}

/**
 * A stage's removals, grouped by the rule that made them.
 *
 * By `ruleId` rather than by `code`. The code is a closed set of eight and a
 * whole tier shares one — every removal at `filter_eligibility` is
 * `ELIGIBILITY_FAILED`, so grouping by code gives one group per stage and says
 * nothing a reader could not already see in the rail. `ruleId` names
 * `pol_heavy_user`, which is a thing somebody can go and change.
 *
 * Removals whose code is a property of the candidate rather than of a rule
 * carry `ruleId: null` — `NOT_RANKED` above all, which the spec is careful to
 * say is not a fault. Those group under the code instead, because there is no
 * rule to name.
 */
export function groupDenials(denials: readonly DenialDto[]): DenialGroup[] {
  const groups = new Map<string, DenialGroup>();
  for (const d of denials) {
    const key = d.ruleId ?? `code:${d.code}`;
    const existing = groups.get(key);
    if (existing) {
      existing.keys.push(d.key);
      if (!existing.codes.includes(d.code)) existing.codes.push(d.code);
    } else {
      groups.set(key, { ruleId: d.ruleId ?? null, codes: [d.code], keys: [d.key] });
    }
  }
  // Largest first: the rule that removed the most is the one worth reading.
  return [...groups.values()].sort(
    (a, b) => b.keys.length - a.keys.length || (a.ruleId ?? '').localeCompare(b.ruleId ?? '')
  );
}

/** What each code means, in the words the platform uses about itself. */
export const CODE_MEANING: Record<string, string> = {
  ELIGIBILITY_FAILED: 'A hard filter refused it. Can we offer this at all?',
  RELEVANCE_FAILED: 'Situational. Should we offer it now?',
  SUITABILITY_FAILED: 'Affordability and ethics. Is it right for this customer?',
  FREQUENCY_CAP_BREACHED: 'We have already contacted them this often in the period.',
  COOLDOWN_ACTIVE: 'They declined this recently and the rest period has not elapsed.',
  CONSENT_WITHHELD: 'The customer has not permitted this kind of contact.',
  OUT_OF_VALIDITY_WINDOW: 'Outside the offer’s effective dates.',
  NOT_ACTIVE: 'The offer is not live in the catalogue.',
  NOT_RANKED:
    'Not a fault. It passed every gate and was beaten on priority by something else.',
};
