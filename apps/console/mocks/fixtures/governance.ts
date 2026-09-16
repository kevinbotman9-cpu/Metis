/**
 * Change sets and the audit event log. Deterministic.
 *
 * The seed, not the state: since 2026-09-14 the console reads both from
 * `@metis/governance`, which owns these types, and `mocks/governance-source.ts`
 * writes these into an empty store once.
 */

import type { AuditEvent, ChangeSet, ChangeSetStatus } from '@metis/governance';

export type { AuditEvent, ChangeSetStatus };
export type ChangeSetRecord = ChangeSet;

const T0 = Date.parse('2026-09-01T09:00:00Z');
const iso = (h: number) => new Date(T0 + h * 3600_000).toISOString();

export const changeSets: ChangeSetRecord[] = [
  {
    id: 'cr_0042',
    title: 'Relax the 5G Home Ultimate bandwidth threshold to 70%',
    description:
      'Trace analysis shows households between 70% and 80% of their current allowance convert at a similar rate to those above 80%, but are never offered the bigger pipe. Widening the relevance rule adds roughly 11,000 eligible households.',
    status: 'pending',
    autonomyTier: 2,
    requestedBy: 'agent-strategist-01',
    requestedAt: iso(-14),
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    targetScope: { level: 'offer', targetId: 'off_5g_home_ultimate' },
    changeType: 'policy_edit',
    diff: [
      {
        field: 'pol_5g_bandwidth_need.conditions[0].value',
        before: '0.8',
        after: '0.7',
      },
    ],
    // No simulation has run against any of these.
    //
    // Until 2026-09-16 each carried `ran: true` with a population, a margin
    // delta and a bias ratio, all authored here — a fabricated verdict on
    // fairness, beside figures that now have ledger rows behind them. A bias
    // ratio compares outcomes across protected groups, no protected attribute
    // exists anywhere, and the profile store that would hold one is unbuilt
    // (ADR-018 §7). The contract has always allowed `null`, which is what "none
    // has run" looks like.
    simulation: null,
  },
  {
    id: 'cr_0041',
    title: 'Lower arbitration context weight from 1.0 to 0.65',
    description:
      'Context contributed under 3% of ranking variance across 1.2M traces. Reducing its weight sharpens the propensity and value signals without changing the winner in 97.8% of replayed decisions.',
    status: 'pending',
    autonomyTier: 2,
    requestedBy: 'agent-strategist-01',
    requestedAt: iso(-52),
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    targetScope: { level: 'tenant', targetId: null },
    changeType: 'arbitration_weights',
    diff: [{ field: 'weights.context', before: '1.0', after: '0.65' }],
    // No simulation has run against any of these.
    //
    // Until 2026-09-16 each carried `ran: true` with a population, a margin
    // delta and a bias ratio, all authored here — a fabricated verdict on
    // fairness, beside figures that now have ledger rows behind them. A bias
    // ratio compares outcomes across protected groups, no protected attribute
    // exists anywhere, and the profile store that would hold one is unbuilt
    // (ADR-018 §7). The contract has always allowed `null`, which is what "none
    // has run" looks like.
    simulation: null,
  },
  {
    id: 'cr_0040',
    title: 'Boost the line ahead of the add-on',
    description:
      'Gaming Plus Bundle and 5G Home Ultimate tied on priority at rank two, so the order came from the offer key rather than from anyone’s intent. Declaring a boost on the line puts the decision in a named hand.',
    status: 'approved',
    autonomyTier: 1,
    requestedBy: 'marcus.webb@telco.example',
    requestedAt: iso(-30),
    decidedBy: 'priya.natarajan@telco.example',
    decidedAt: iso(-26),
    decisionReason:
      'Approved. A declared tie-break with an owner is better governance than an alphabetical accident, and the boost is recorded in the catalogue rather than in the ranking code.',
    targetScope: { level: 'objective', targetId: 'iss_crosssell' },
    changeType: 'boost_adjust',
    diff: [{ field: 'lev_line_before_addon.value', before: '1.00', after: '1.05' }],
    // No simulation has run against any of these.
    //
    // Until 2026-09-16 each carried `ran: true` with a population, a margin
    // delta and a bias ratio, all authored here — a fabricated verdict on
    // fairness, beside figures that now have ledger rows behind them. A bias
    // ratio compares outcomes across protected groups, no protected attribute
    // exists anywhere, and the profile store that would hold one is unbuilt
    // (ADR-018 §7). The contract has always allowed `null`, which is what "none
    // has run" looks like.
    simulation: null,
  },
  {
    id: 'cr_0039',
    title: 'Offer Gaming Plus Bundle to households with no line',
    description:
      'Remove the has-broadband rule so the gaming bundle can be offered to the full base.',
    status: 'rejected',
    autonomyTier: 1,
    requestedBy: 'sarah.chen@telco.example',
    requestedAt: iso(-140),
    decidedBy: 'priya.natarajan@telco.example',
    decidedAt: iso(-132),
    decisionReason:
      'Rejected. A low-latency router add-on sold to a household with no broadband line is a charge for something that cannot be delivered. That fails the fair-value test the suitability tier exists for. Offer unchanged pending a redesign that bundles the line.',
    targetScope: { level: 'offer', targetId: 'off_gaming_plus_bundle' },
    changeType: 'policy_edit',
    diff: [
      { field: 'pol_has_broadband.active', before: 'true', after: 'false' },
    ],
    // No simulation has run against any of these.
    //
    // Until 2026-09-16 each carried `ran: true` with a population, a margin
    // delta and a bias ratio, all authored here — a fabricated verdict on
    // fairness, beside figures that now have ledger rows behind them. A bias
    // ratio compares outcomes across protected groups, no protected attribute
    // exists anywhere, and the profile store that would hold one is unbuilt
    // (ADR-018 §7). The contract has always allowed `null`, which is what "none
    // has run" looks like.
    simulation: null,
  },
  {
    id: 'cr_0038',
    title: 'Retire Legacy DSL',
    description: 'Superseded by FIOS Gigabit. No new sales since June.',
    status: 'approved',
    autonomyTier: 1,
    requestedBy: 'sarah.chen@telco.example',
    requestedAt: iso(-310),
    decidedBy: 'marcus.webb@telco.example',
    decidedAt: iso(-300),
    decisionReason: 'Approved. Existing holders are unaffected; only new offers stop.',
    // The one id here that is deliberately not in today's catalogue: an
    // offer retired ten months ago is history, and the log is where history
    // lives. Every other reference in this file names something the catalogue
    // holds, which was not true until 2026-09-12 — thirteen ids and a UK
    // regulator survived the tenant rename in this file alone, because prose
    // and fixture strings are not what a rename pass looks at.
    targetScope: { level: 'offer', targetId: 'off_legacy_dsl' },
    changeType: 'offer_retire',
    diff: [{ field: 'status', before: 'active', after: 'retired' }],
    simulation: null,
  },
];

export const auditEvents: AuditEvent[] = [
  /**
   * The incident, six days ago.
   *
   * One of the three things the console spec asks to be wrong on purpose: "a
   * demo where nothing is ever wrong demonstrates nothing about how the product
   * handles being wrong."
   *
   * There is no incidents screen and no Incident schema, so this is not one —
   * it is what an incident actually leaves behind on a platform that has an
   * append-only audit log: a detection, a containment, a human taking over, and
   * a resolution with a cause. It reads in order on `/audit` because the log is
   * chronological, and the four entries are the story.
   *
   * The cause is real and specific: the consent connector defaults closed on
   * failure (ADR-007, `onFailure: 'default'` in ./catalogue.ts), so when its
   * upstream went away every decision it touched suppressed on CONSENT_WITHHELD
   * rather than erroring. Failing closed is correct and it is also invisible
   * until somebody looks at a suppression rate.
   */
  {
    id: 'evt_0035',
    timestamp: iso(-138),
    actor: 'system',
    actorType: 'system',
    eventType: 'IncidentResolved',
    scope: 'conn_consent_registry',
    summary:
      'Consent registry healthy for 60 minutes; suppression rate back to 54%. Cause: the registry’s upstream returned 503 for 71 minutes and the connector failed closed, as ADR-007 requires. Nothing was offered without consent.',
    changeSetId: null,
  },
  {
    id: 'evt_0034',
    timestamp: iso(-139),
    actor: 'marcus.webb@telco.example',
    actorType: 'human',
    eventType: 'AutonomyChanged',
    scope: 'tenant',
    summary:
      'Dropped tenant autonomy to L1 while the consent registry was unreachable. Agents paused rather than optimising against a suppression spike they could not explain.',
    changeSetId: null,
  },
  {
    id: 'evt_0033',
    timestamp: iso(-140),
    actor: 'system',
    actorType: 'system',
    eventType: 'GuardrailBlocked',
    scope: 'conn_consent_registry',
    summary:
      'Consent registry unreachable: 503 from the upstream on 2,140 consecutive resolutions. Connector failed closed, so every affected decision suppressed rather than proceeding without consent.',
    changeSetId: null,
  },
  {
    id: 'evt_0032',
    timestamp: iso(-141),
    actor: 'system',
    actorType: 'system',
    eventType: 'AnomalyDetected',
    scope: 'inbound-web-offers',
    summary:
      'Suppression rate on inbound web reached 96% over 15 minutes against a 24-hour baseline of 54%. Flagged for investigation.',
    changeSetId: null,
  },
  {
    id: 'evt_0031',
    timestamp: iso(-2),
    actor: 'agent-copywriter-01',
    actorType: 'agent',
    eventType: 'CreativeUpdated',
    scope: 'crt_netflix_email',
    summary: 'Subject line rewritten under L3 bounded autonomy. Simulation passed, blast radius 4%.',
    changeSetId: null,
  },
  {
    id: 'evt_0030',
    timestamp: iso(-5),
    actor: 'agent-optimiser-01',
    actorType: 'agent',
    eventType: 'BoostAdjusted',
    scope: 'lev_fiber_first',
    summary: 'Boost 1.00 to 1.10 under L3 bounded autonomy.',
    changeSetId: null,
  },
  {
    id: 'evt_0029',
    timestamp: iso(-6),
    actor: 'sarah.chen@telco.example',
    actorType: 'human',
    eventType: 'OfferUpdated',
    scope: 'off_5g_home_ultimate',
    summary: 'Email body reworded to reference the three-month usage trend.',
    changeSetId: null,
  },
  {
    id: 'evt_0028',
    timestamp: iso(-9),
    actor: 'system',
    actorType: 'system',
    eventType: 'GuardrailBlocked',
    scope: 'off_gaming_plus_bundle',
    summary: 'Blocked agent boost change: requested delta 0.35 exceeds maxBoostDelta 0.15.',
    changeSetId: null,
  },
  {
    id: 'evt_0027',
    timestamp: iso(-12),
    actor: 'marcus.webb@telco.example',
    actorType: 'human',
    eventType: 'ArtifactPublished',
    scope: 'next-best-action v1.0.0',
    summary: 'Published after approval of cr_0040. Previous version 0.9.2 remains available for rollback.',
    changeSetId: 'cr_0040',
  },
  {
    id: 'evt_0026',
    timestamp: iso(-14),
    actor: 'agent-strategist-01',
    actorType: 'agent',
    eventType: 'ChangeSetOpened',
    scope: 'off_5g_home_ultimate',
    summary: 'Opened cr_0042 under L2 autonomy with simulation attached.',
    changeSetId: 'cr_0042',
  },
  {
    id: 'evt_0025',
    timestamp: iso(-26),
    actor: 'priya.natarajan@telco.example',
    actorType: 'human',
    eventType: 'ChangeSetApproved',
    scope: 'iss_crosssell',
    summary: 'Approved cr_0040 with the tie-break reasoning recorded.',
    changeSetId: 'cr_0040',
  },
  {
    id: 'evt_0024',
    timestamp: iso(-31),
    actor: 'system',
    actorType: 'system',
    eventType: 'AutoReverted',
    scope: 'crt_gaming_email',
    summary: 'Reverted agent copy change after bias gate observed 1.31 against a 1.20 threshold.',
    changeSetId: null,
  },
  {
    id: 'evt_0023',
    timestamp: iso(-48),
    actor: 'sarah.chen@telco.example',
    actorType: 'human',
    eventType: 'AutonomyChanged',
    scope: 'grp_entertainment',
    summary: 'Raised autonomy from L2 to L3 for entertainment. Rationale recorded.',
    changeSetId: null,
  },
  {
    id: 'evt_0022',
    timestamp: iso(-96),
    actor: 'priya.natarajan@telco.example',
    actorType: 'human',
    eventType: 'AutonomyChanged',
    scope: 'off_netflix',
    summary: 'Pinned to L0 Observe. The partner brand wording is contractually agreed and not ours to rewrite.',
    changeSetId: null,
  },
  {
    id: 'evt_0021',
    timestamp: iso(-132),
    actor: 'priya.natarajan@telco.example',
    actorType: 'human',
    eventType: 'ChangeSetRejected',
    scope: 'off_gaming_plus_bundle',
    summary: 'Rejected cr_0039 on fair-value grounds; the offer keeps its line requirement.',
    changeSetId: 'cr_0039',
  },
];
