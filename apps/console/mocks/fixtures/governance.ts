/** Change requests and the audit event log. Deterministic. */

const T0 = Date.parse('2026-09-01T09:00:00Z');
const iso = (h: number) => new Date(T0 + h * 3600_000).toISOString();

export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface ChangeRequestRecord {
  id: string;
  title: string;
  description: string;
  status: ChangeRequestStatus;
  /** 1 = manual, 2 = bounded, 3 = autonomous. */
  autonomyTier: 1 | 2 | 3;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  targetScope: { level: string; targetId: string | null };
  changeType: string;
  diff: { field: string; before: string; after: string }[];
  simulation: {
    ran: boolean;
    passed: boolean;
    populationSize: number;
    projectedMarginDelta: string;
    biasRatio: number;
    notes: string;
  } | null;
}

export const changeRequests: ChangeRequestRecord[] = [
  {
    id: 'cr_0042',
    title: 'Relax Data Boost heavy-user threshold to 70%',
    description:
      'Trace analysis shows customers between 70% and 80% of allowance convert at a similar rate to those above 80%, but are never offered the boost. Widening the applicability rule adds roughly 11,000 eligible customers.',
    status: 'pending',
    autonomyTier: 2,
    requestedBy: 'agent-strategist-01',
    requestedAt: iso(-14),
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    targetScope: { level: 'proposition', targetId: 'prop_data_boost_10gb' },
    changeType: 'policy_edit',
    diff: [
      {
        field: 'pol_heavy_user.conditions[0].value',
        before: '0.8',
        after: '0.7',
      },
    ],
    simulation: {
      ran: true,
      passed: true,
      populationSize: 240000,
      projectedMarginDelta: '+£43,200 / month',
      biasRatio: 1.04,
      notes: 'No material disparity across age, region or tenure cohorts.',
    },
  },
  {
    id: 'cr_0041',
    title: 'Lower arbitration context weight from 0.5 to 0.35',
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
    diff: [{ field: 'weights.context', before: '0.5', after: '0.35' }],
    simulation: {
      ran: true,
      passed: true,
      populationSize: 1200000,
      projectedMarginDelta: '+£18,900 / month',
      biasRatio: 1.01,
      notes: 'Winner changed in 2.2% of replays; all changes were between commercial offers of similar value.',
    },
  },
  {
    id: 'cr_0040',
    title: 'Raise Q4 retention lever to 1.40',
    description:
      'Churn is 2.1pp above plan. Board approved additional retention emphasis through year end.',
    status: 'approved',
    autonomyTier: 1,
    requestedBy: 'marcus.webb@telco.example',
    requestedAt: iso(-30),
    decidedBy: 'priya.natarajan@telco.example',
    decidedAt: iso(-26),
    decisionReason:
      'Approved. Fair-value assessment attached; the discount reduces customer bills so the suitability test holds.',
    targetScope: { level: 'issue', targetId: 'iss_retention' },
    changeType: 'lever_adjust',
    diff: [{ field: 'lev_retention_push.value', before: '1.15', after: '1.40' }],
    simulation: {
      ran: true,
      passed: true,
      populationSize: 480000,
      projectedMarginDelta: '-£112,000 / month',
      biasRatio: 1.06,
      notes: 'Margin dilutive by design; retention volume projected +14%.',
    },
  },
  {
    id: 'cr_0039',
    title: 'Enable Device Insurance for all handset customers',
    description: 'Remove the residual-value floor so insurance can be offered to the full base.',
    status: 'rejected',
    autonomyTier: 1,
    requestedBy: 'sarah.chen@telco.example',
    requestedAt: iso(-140),
    decidedBy: 'priya.natarajan@telco.example',
    decidedAt: iso(-132),
    decisionReason:
      'Rejected. Removing the residual-value floor would let us sell cover worth more than the device it insures. That fails the FCA fair-value test. Proposition paused pending redesign.',
    targetScope: { level: 'proposition', targetId: 'prop_device_insurance' },
    changeType: 'policy_edit',
    diff: [
      { field: 'pol_afford_insurance.active', before: 'true', after: 'false' },
    ],
    simulation: {
      ran: true,
      passed: false,
      populationSize: 320000,
      projectedMarginDelta: '+£71,000 / month',
      biasRatio: 1.38,
      notes:
        'FAILED bias gate: 1.38 disparity ratio. Customers in the lowest-value device cohort were 38% more likely to be targeted.',
    },
  },
  {
    id: 'cr_0038',
    title: 'Retire Legacy 4G Bundle',
    description: 'Superseded by 5G Unlimited. No new sales since June.',
    status: 'approved',
    autonomyTier: 1,
    requestedBy: 'sarah.chen@telco.example',
    requestedAt: iso(-310),
    decidedBy: 'marcus.webb@telco.example',
    decidedAt: iso(-300),
    decisionReason: 'Approved. Existing holders are unaffected; only new offers stop.',
    targetScope: { level: 'proposition', targetId: 'prop_legacy_4g_bundle' },
    changeType: 'proposition_retire',
    diff: [{ field: 'status', before: 'active', after: 'retired' }],
    simulation: null,
  },
];

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  actorType: 'human' | 'agent' | 'system';
  eventType: string;
  scope: string;
  summary: string;
  changeRequestId: string | null;
}

export const auditEvents: AuditEvent[] = [
  {
    id: 'evt_0031',
    timestamp: iso(-2),
    actor: 'agent-copywriter-01',
    actorType: 'agent',
    eventType: 'TreatmentUpdated',
    scope: 'trt_roam_push',
    summary: 'Push title rewritten under L3 bounded autonomy. Simulation passed, blast radius 4%.',
    changeRequestId: null,
  },
  {
    id: 'evt_0030',
    timestamp: iso(-5),
    actor: 'agent-optimiser-01',
    actorType: 'agent',
    eventType: 'LeverAdjusted',
    scope: 'prop_roaming_pass',
    summary: 'Lever 1.00 to 1.12 under L3 bounded autonomy.',
    changeRequestId: null,
  },
  {
    id: 'evt_0029',
    timestamp: iso(-6),
    actor: 'sarah.chen@telco.example',
    actorType: 'human',
    eventType: 'PropositionUpdated',
    scope: 'prop_5g_unlimited_24',
    summary: 'Email body reworded to reference the three-month usage trend.',
    changeRequestId: null,
  },
  {
    id: 'evt_0028',
    timestamp: iso(-9),
    actor: 'system',
    actorType: 'system',
    eventType: 'GuardrailBlocked',
    scope: 'prop_device_insurance',
    summary: 'Blocked agent lever change: requested delta 0.35 exceeds maxLeverDelta 0.15.',
    changeRequestId: null,
  },
  {
    id: 'evt_0027',
    timestamp: iso(-12),
    actor: 'marcus.webb@telco.example',
    actorType: 'human',
    eventType: 'ArtifactPublished',
    scope: 'next-best-action v2.4.0',
    summary: 'Published after approval of cr_0040. Previous version 2.3.1 remains available for rollback.',
    changeRequestId: 'cr_0040',
  },
  {
    id: 'evt_0026',
    timestamp: iso(-14),
    actor: 'agent-strategist-01',
    actorType: 'agent',
    eventType: 'ChangeRequestOpened',
    scope: 'prop_data_boost_10gb',
    summary: 'Opened cr_0042 under L2 autonomy with simulation attached.',
    changeRequestId: 'cr_0042',
  },
  {
    id: 'evt_0025',
    timestamp: iso(-26),
    actor: 'priya.natarajan@telco.example',
    actorType: 'human',
    eventType: 'ChangeRequestApproved',
    scope: 'iss_retention',
    summary: 'Approved cr_0040 with fair-value assessment attached.',
    changeRequestId: 'cr_0040',
  },
  {
    id: 'evt_0024',
    timestamp: iso(-31),
    actor: 'system',
    actorType: 'system',
    eventType: 'AutoReverted',
    scope: 'trt_roam_sms',
    summary: 'Reverted agent copy change after bias gate observed 1.31 against a 1.20 threshold.',
    changeRequestId: null,
  },
  {
    id: 'evt_0023',
    timestamp: iso(-48),
    actor: 'sarah.chen@telco.example',
    actorType: 'human',
    eventType: 'AutonomyChanged',
    scope: 'grp_accessories',
    summary: 'Raised autonomy from L2 to L3 for accessories. Rationale recorded.',
    changeRequestId: null,
  },
  {
    id: 'evt_0022',
    timestamp: iso(-96),
    actor: 'priya.natarajan@telco.example',
    actorType: 'human',
    eventType: 'AutonomyChanged',
    scope: 'prop_bill_shock_alert',
    summary: 'Pinned to L0 Observe. Duty-of-care wording is legally reviewed.',
    changeRequestId: null,
  },
  {
    id: 'evt_0021',
    timestamp: iso(-132),
    actor: 'priya.natarajan@telco.example',
    actorType: 'human',
    eventType: 'ChangeRequestRejected',
    scope: 'prop_device_insurance',
    summary: 'Rejected cr_0039 on FCA fair-value grounds; proposition paused.',
    changeRequestId: 'cr_0039',
  },
];
