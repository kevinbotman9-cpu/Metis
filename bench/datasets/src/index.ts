/**
 * Synthetic workloads for the load harness.
 *
 * Two things had to change from the original generator:
 *
 *   1. It used `Math.random()`, so "same seed, same data" — which the Phase 0
 *      plan states as a requirement — was never true. A benchmark that draws a
 *      different population each run cannot tell a regression from a reroll.
 *   2. It produced its own `Customer` and `Decision` shapes, which nothing
 *      executes. The engine takes a `CatalogueSnapshot`, an `ExecArtifact` and
 *      `DecisionRequest`s, so that is what this builds.
 *
 * Scale is a parameter. The console's fixtures are fixed at eleven
 * offers, which is the right size for a UI and the wrong size for
 * measuring how cost scales with the catalogue.
 */

import { seededUnitInterval } from '@metis/runtime';
import type {
  CatalogueSnapshot,
  DecisionRequest,
  ExecArtifact,
} from '@metis/runtime/deterministic/types';
import type {
  ArbitrationConfig,
  Connector,
  FrequencyPolicy,
  TargetingPolicy,
  Boost,
  Offer,
} from '@metis/core/domain';

const CHANNELS = ['web', 'email', 'sms', 'push', 'outbound_call'] as const;
const SEGMENTS = ['premium', 'standard', 'budget'] as const;

/** Deterministic pick from a list. */
function pick<T>(list: readonly T[], salt: string, index: number): T {
  return list[Math.floor(seededUnitInterval(salt, index, 'pick') * list.length)];
}

export interface WorkloadOptions {
  /** How many offers in the catalogue. */
  offers?: number;
  /** How many targeting policies each offer is scoped by. */
  policies?: number;
  /** How many distinct customers the requests are drawn from. */
  customers?: number;
}

export interface Workload {
  artifact: ExecArtifact;
  catalogue: CatalogueSnapshot;
  /** Request `i`, generated on demand so a million of them cost nothing. */
  request: (index: number) => DecisionRequest;
  label: string;
}

function offer(index: number): Offer {
  const price = 500 + Math.floor(seededUnitInterval('price', index, 'p') * 9500);
  const cost = Math.floor(price * (0.2 + seededUnitInterval('cost', index, 'c') * 0.4));

  return {
    id: `prop_bench_${index}`,
    categoryId: `grp_${index % 5}`,
    objectiveId: `iss_${index % 3}`,
    name: `Bench offer ${index}`,
    key: `bench_${index}`,
    description: 'A synthetic offer, sized like a real one so hashing is honest.',
    status: 'active',
    financials: {
      price: { amount: price, currency: 'GBP' },
      cost: { amount: cost, currency: 'GBP' },
      expectedMargin: { amount: price - cost, currency: 'GBP' },
      termMonths: 24,
      oneOff: false,
    },
    validity: { startsAt: '2020-01-01T00:00:00.000Z', endsAt: null },
    boost: 0.8 + seededUnitInterval('boost', index, 'l') * 0.6,
    policyIds: [],
    creativeIds: [`treat_bench_${index}`],
    tags: ['bench'],
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    updatedBy: 'bench',
  };
}

function targetingPolicy(index: number): TargetingPolicy {
  const kinds = ['eligibility', 'relevance', 'suitability'] as const;
  return {
    id: `pol_bench_${index}`,
    name: `Bench policy ${index}`,
    kind: kinds[index % kinds.length],
    description: 'Synthetic policy over a customer attribute.',
    // Thresholds vary so the cascade actually eliminates different candidates
    // per request, rather than every decision taking the same branch.
    conditions: [
      {
        field: 'tenureMonths',
        operator: 'gte',
        value: Math.floor(seededUnitInterval('tenure', index, 'th') * 24),
      },
    ],
    scope: { level: 'tenant', targetId: null },
    active: true,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

export function buildWorkload(options: WorkloadOptions = {}): Workload {
  const offerCount = options.offers ?? 40;
  const policyCount = options.policies ?? 6;
  const customerCount = options.customers ?? 10_000;

  const offers = Array.from({ length: offerCount }, (_, i) => offer(i));
  const targetingPolicies = Array.from({ length: policyCount }, (_, i) => targetingPolicy(i));

  // Every offer is scoped by a couple of policies, so the filter nodes
  // have real work to do rather than passing everything through.
  for (const [i, p] of offers.entries()) {
    p.policyIds = [
      targetingPolicies[i % policyCount].id,
      targetingPolicies[(i + 1) % policyCount].id,
    ];
  }

  const frequencyPolicies: FrequencyPolicy[] = [
    {
      id: 'contact_bench_frequency',
      name: 'Bench frequency cap',
      description: 'At most three contacts per channel per week.',
      channel: null,
      maxContacts: 3,
      period: 'week',
      cooldownDaysAfterReject: 14,
      scope: { level: 'tenant', targetId: null },
      active: true,
    },
  ];

  const arbitration: ArbitrationConfig = {
    id: 'arb_bench',
    tenantId: 'bench',
    weights: { propensity: 1, value: 1, boost: 1, context: 0.5 },
    formula: 'P^wP x V^wV x L^wL x C^wC',
    updatedAt: '2020-01-01T00:00:00.000Z',
    updatedBy: 'bench',
  };

  // A connector on the source node, so the benchmark measures the path a real
  // decision takes rather than one without integrations. The engine does not
  // fetch — resolution happens before execution — but it does record which
  // connector supplied which field, and that work should be in the numbers.
  const connectors: Connector[] = [
    {
      id: 'conn_bench_features',
      name: 'Bench feature store',
      kind: 'feature-store',
      description: 'Synthetic feature reads.',
      target: 'featurestore://bench',
      declaredP95Ms: 3,
      timeoutMs: 25,
      onFailure: 'fail',
      cacheTtlSeconds: 300,
      provides: [
        { field: 'tenureMonths', path: 'account.tenureMonths', type: 'number' },
        { field: 'monthlySpend', path: 'billing.spend', type: 'number' },
        { field: 'creditScore', path: 'bureau.score', type: 'number' },
      ],
      active: true,
      updatedAt: '2020-01-01T00:00:00.000Z',
      updatedBy: 'bench',
    },
  ];

  const boosts: Boost[] = [
    {
      id: 'boost_bench',
      name: 'Bench boost',
      scope: { level: 'tenant', targetId: null },
      value: 1.1,
      reason: 'Synthetic',
      validity: null,
      updatedAt: '2020-01-01T00:00:00.000Z',
      updatedBy: 'bench',
    },
  ];

  const artifact: ExecArtifact = {
    id: 'art_bench',
    version: '1.0.0',
    tenantId: 'bench',
    nodes: [
      {
        id: 'n_source',
        type: 'source',
        label: 'Candidate set',
        connectorIds: ['conn_bench_features'],
      },
      {
        id: 'n_eligibility',
        type: 'filter',
        label: 'Eligibility',
        policyIds: targetingPolicies.filter((p) => p.kind === 'eligibility').map((p) => p.id),
      },
      {
        id: 'n_relevance',
        type: 'filter',
        label: 'Relevance',
        policyIds: targetingPolicies.filter((p) => p.kind === 'relevance').map((p) => p.id),
      },
      {
        id: 'n_contact',
        type: 'constraint',
        label: 'Frequency policy',
        frequencyPolicyIds: frequencyPolicies.map((p) => p.id),
      },
      {
        id: 'n_score',
        type: 'score-model',
        label: 'Propensity',
        model: { id: 'model_bench_propensity', version: '3.1.0' },
      },
      { id: 'n_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
    ],
    edges: [
      { from: 'n_source', to: 'n_eligibility' },
      { from: 'n_eligibility', to: 'n_relevance' },
      { from: 'n_relevance', to: 'n_contact' },
      { from: 'n_contact', to: 'n_score' },
      { from: 'n_score', to: 'n_arbitrate' },
    ],
    candidateKeys: offers.map((p) => p.key),
    packageVersions: { '@metis/nodes-core': '2.0.0' },
  };

  return {
    label: `${offerCount} offers, ${policyCount} policies`,
    artifact,
    catalogue: {
      offers,
      targetingPolicies,
      frequencyPolicies,
      arbitration,
      boosts,
      connectors,
    },
    request: (index: number): DecisionRequest => {
      const customer = index % customerCount;
      return {
        tenantId: 'bench',
        customerId: `cust_bench_${customer}`,
        channel: pick(CHANNELS, 'channel', index),
        placement: 'bench_placement',
        // An input, never the system clock: replay has to land on the same
        // validity windows as the original.
        occurredAt: '2026-06-01T12:00:00.000Z',
        input: {
          segment: pick(SEGMENTS, 'segment', customer),
          tenureMonths: Math.floor(seededUnitInterval('tenure', customer, 'req') * 60),
          creditScore: 300 + Math.floor(seededUnitInterval('credit', customer, 'req') * 550),
          monthlySpend: Math.floor(seededUnitInterval('spend', customer, 'req') * 12000),
          active: seededUnitInterval('active', customer, 'req') > 0.2,
        },
        contactHistory: {
          channel: pick(CHANNELS, 'channel', index),
          withinPeriod: {
            week: Math.floor(seededUnitInterval('contacts', index, 'w') * 3),
          },
        },
        consent: { marketing: true, profiling: true, thirdParty: false },
      };
    },
  };
}
