/**
 * Deterministic decision + trace fixtures.
 *
 * Generated from a seeded PRNG so the set is varied but identical on every
 * reload. This is what makes /decisions/[id] resolvable: the ID in the list
 * is the ID the trace endpoint answers to.
 */

import { propositions, treatments } from './catalogue';

/** Mulberry32 — small, fast, deterministic. */
function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T0 = Date.parse('2026-09-04T08:00:00Z');

export interface EliminationStep {
  nodeId: string;
  nodeType: string;
  reason: string;
  eliminated: string[];
  survived: string[];
}

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
  winnerPropositionId: string | null;
  candidateCount: number;
  totalMs: number;
}

export interface TraceRecord extends DecisionRecord {
  eliminations: EliminationStep[];
  scores: Record<
    string,
    { propensity: number; value: number; lever: number; context: number; priority: number }
  >;
  arbitration: { formula: string; winner: string | null; runnerUp: string | null };
  timings: Record<string, number>;
  constraintsApplied: string[];
  consentState: { marketing: boolean; profiling: boolean; thirdParty: boolean };
  treatmentId: string | null;
}

const CHANNELS = ['web', 'email', 'sms', 'push', 'outbound_call'];
const PLACEMENTS: Record<string, string> = {
  web: 'account_dashboard_hero',
  email: 'weekly_offers_send',
  sms: 'triggered_outbound',
  push: 'app_inbox',
  outbound_call: 'retention_queue',
};

/** Only propositions that can actually win a decision. */
const eligible = propositions.filter((p) => p.status === 'active');

const SUPPRESSION_REASONS = [
  'Contact policy: weekly cap of 3 already reached',
  'Consent withheld for marketing profiling',
  'Cooldown active after decline 9 days ago',
  'No active treatment for the requested channel',
];

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function buildDecision(index: number): TraceRecord {
  const rnd = prng(1000 + index * 7919);

  const id = `dec_${(index + 1).toString().padStart(4, '0')}${'abcdef'[index % 6]}${(
    index * 37
  )
    .toString(36)
    .padStart(3, '0')}`;

  const channel = CHANNELS[Math.floor(rnd() * CHANNELS.length)];
  const customerId = `cust_${(880000 + index * 137).toString(36)}`;
  const timestamp = new Date(T0 - Math.floor(rnd() * 7 * 24) * 3600_000 - index * 90_000).toISOString();

  // Candidate set: 3-5 propositions, deterministic per index.
  const shuffled = [...eligible].sort(
    (a, b) => prng(index * 31 + a.id.length).call(null) - prng(index * 31 + b.id.length).call(null)
  );
  const candidateCount = 3 + Math.floor(rnd() * 3);
  const candidates = shuffled.slice(0, Math.min(candidateCount, shuffled.length));

  // Every 7th decision is fully suppressed — an important state to show.
  const suppressed = index % 7 === 3;

  // Eligibility eliminates 0-2, applicability 0-1.
  const eligibilityDrop = candidates.slice(0, Math.floor(rnd() * 2));
  const afterEligibility = candidates.filter((c) => !eligibilityDrop.includes(c));
  const applicabilityDrop = afterEligibility.slice(0, Math.floor(rnd() * 2));
  const afterApplicability = afterEligibility.filter((c) => !applicabilityDrop.includes(c));
  const finalists = afterApplicability.length > 0 ? afterApplicability : candidates.slice(0, 1);

  // Score each finalist.
  const scores: TraceRecord['scores'] = {};
  for (const c of finalists) {
    const propensity = round(0.08 + rnd() * 0.84, 4);
    const value = round(Math.max(0.05, c.financials.expectedMargin.amount / 60000), 4);
    const lever = c.lever;
    const context = round(0.4 + rnd() * 0.6, 4);
    const priority = round(propensity * value * lever * Math.pow(context, 0.5), 6);
    scores[c.key] = { propensity, value, lever, context, priority };
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1].priority - a[1].priority);
  const winnerKey = suppressed ? null : ranked[0]?.[0] ?? null;
  const runnerUpKey = suppressed ? null : ranked[1]?.[0] ?? null;
  const winnerProp = winnerKey ? eligible.find((p) => p.key === winnerKey) ?? null : null;

  const winnerTreatment = winnerProp
    ? treatments.find((t) => t.propositionId === winnerProp.id && t.channel === channel && t.active) ??
      treatments.find((t) => t.propositionId === winnerProp.id && t.active) ??
      null
    : null;

  const eliminations: EliminationStep[] = [
    {
      nodeId: 'source_customer',
      nodeType: 'source',
      reason: `Loaded customer profile and 90 days of interaction history for ${customerId}.`,
      eliminated: [],
      survived: candidates.map((c) => c.key),
    },
    {
      nodeId: 'filter_eligibility',
      nodeType: 'filter',
      reason:
        eligibilityDrop.length > 0
          ? `Eligibility rules removed ${eligibilityDrop.length} candidate(s): age, credit status or availability check failed.`
          : 'All candidates passed eligibility (age, credit status, availability).',
      eliminated: eligibilityDrop.map((c) => c.key),
      survived: afterEligibility.map((c) => c.key),
    },
    {
      nodeId: 'filter_applicability',
      nodeType: 'filter',
      reason:
        applicabilityDrop.length > 0
          ? `Applicability rules removed ${applicabilityDrop.length} candidate(s): already held, or situational trigger not met.`
          : 'All remaining candidates were situationally applicable.',
      eliminated: applicabilityDrop.map((c) => c.key),
      survived: afterApplicability.map((c) => c.key),
    },
    {
      nodeId: 'filter_suitability',
      nodeType: 'constraint',
      reason: suppressed
        ? SUPPRESSION_REASONS[index % SUPPRESSION_REASONS.length]
        : 'Affordability and fair-value checks passed for all finalists.',
      eliminated: suppressed ? finalists.map((c) => c.key) : [],
      survived: suppressed ? [] : finalists.map((c) => c.key),
    },
    {
      nodeId: 'arbitrate_priority',
      nodeType: 'arbitrate',
      reason: suppressed
        ? 'No candidates reached arbitration; decision returned no offer.'
        : `Ranked ${finalists.length} finalist(s) by P × V × L × C^0.5. Winner: ${winnerKey}.`,
      eliminated: suppressed ? [] : ranked.slice(1).map(([k]) => k),
      survived: winnerKey ? [winnerKey] : [],
    },
  ];

  const timings: Record<string, number> = {
    source_customer: round(2.1 + rnd() * 4, 1),
    filter_eligibility: round(0.6 + rnd() * 1.2, 1),
    filter_applicability: round(0.5 + rnd() * 1.1, 1),
    filter_suitability: round(0.7 + rnd() * 1.4, 1),
    arbitrate_priority: round(1.2 + rnd() * 2.2, 1),
  };
  const totalMs = round(
    Object.values(timings).reduce((a, b) => a + b, 0),
    1
  );

  const constraintsApplied = [
    'cpol_global_weekly',
    ...(channel === 'sms' ? ['cpol_sms_daily'] : []),
    ...(channel === 'email' ? ['cpol_email_weekly'] : []),
  ];

  return {
    id,
    artifactId: 'next-best-action',
    artifactVersion: index % 5 === 0 ? '2.3.1' : '2.4.0',
    tenantId: 'telco-uk',
    customerId,
    timestamp,
    channel,
    placement: PLACEMENTS[channel],
    winner: winnerKey,
    winnerPropositionId: winnerProp?.id ?? null,
    candidateCount: candidates.length,
    totalMs,
    eliminations,
    scores,
    arbitration: {
      formula: 'Priority = P^1.0 × V^1.0 × L^1.0 × C^0.5',
      winner: winnerKey,
      runnerUp: runnerUpKey,
    },
    timings,
    constraintsApplied,
    consentState: {
      marketing: !suppressed || index % 14 !== 3,
      profiling: index % 9 !== 4,
      thirdParty: index % 5 === 0,
    },
    treatmentId: winnerTreatment?.id ?? null,
  };
}

/** 60 decisions — enough to make search, filtering and paging meaningful. */
export const traces: TraceRecord[] = Array.from({ length: 60 }, (_, i) => buildDecision(i));

export const decisions: DecisionRecord[] = traces.map((t) => ({
  id: t.id,
  artifactId: t.artifactId,
  artifactVersion: t.artifactVersion,
  tenantId: t.tenantId,
  customerId: t.customerId,
  timestamp: t.timestamp,
  channel: t.channel,
  placement: t.placement,
  winner: t.winner,
  winnerPropositionId: t.winnerPropositionId,
  candidateCount: t.candidateCount,
  totalMs: t.totalMs,
}));

export function findTrace(id: string): TraceRecord | undefined {
  return traces.find((t) => t.id === id);
}
