import { describe, it, expect } from 'vitest';
import { createFlowTestRunner, type FlowTestCase } from '../src/flow-tests';
import type { CatalogueSnapshot, ExecArtifact } from '../src/deterministic/types';
import type { Offer, TargetingPolicy } from '@metis/core/domain';

/**
 * Evaluating a flow author's test case.
 *
 * The registry owns the *gate* — that a failing case refuses a publish — and
 * proves it with a stub. This owns the other half: whether a case that should
 * pass passes, and more importantly whether a case that should fail fails. A
 * runner that reported everything green would satisfy the gate perfectly and
 * be worse than having no tests at all, because the flow would look checked.
 */

const offer = (over: Partial<Offer> & { id: string; key: string }): Offer =>
  ({
    categoryId: 'g1',
    objectiveId: 'i1',
    name: over.id,
    description: '',
    status: 'active',
    financials: {
      price: { amount: 1000, currency: 'GBP' },
      cost: { amount: 400, currency: 'GBP' },
      expectedMargin: { amount: 600, currency: 'GBP' },
      termMonths: 12,
      oneOff: false,
    },
    validity: { startsAt: '2020-01-01', endsAt: null },
    boost: 1,
    policyIds: [],
    creativeIds: ['t1'],
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
    ...over,
  }) as Offer;

/** Eligibility: adults only. Gives the runner a real denial to assert on. */
const adultsOnly: TargetingPolicy = {
  id: 'tp_adult',
  name: 'Adults only',
  description: '',
  kind: 'eligibility',
  conditions: [{ field: 'age', operator: 'gte', value: 18 }],
  scope: { level: 'tenant', targetId: null },
  active: true,
} as unknown as TargetingPolicy;

const catalogue: CatalogueSnapshot = {
  offers: [
    offer({ id: 'p1', key: 'offer_adult', policyIds: ['tp_adult'] }),
    offer({ id: 'p2', key: 'offer_open' }),
  ],
  targetingPolicies: [adultsOnly],
  frequencyPolicies: [],
  arbitration: {
    id: 'arb',
    tenantId: 'telco-uk',
    weights: { propensity: 1, value: 1, boost: 1, context: 1 },
    utility: { id: 'multiplicative', version: '1.0.0' },
    formula: 'P x V x B x C',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
  },
  boosts: [],
  connectors: [],
} as unknown as CatalogueSnapshot;

const artifact: ExecArtifact = {
  id: 'flow',
  version: '1.0.0',
  tenantId: 'telco-uk',
  candidateKeys: ['offer_adult', 'offer_open'],
  packageVersions: { '@metis/nodes-core': '1.2.0' },
  nodes: [
    { id: 'source', type: 'source', label: 'Source' },
    { id: 'eligibility', type: 'filter', label: 'Eligibility', policyIds: ['tp_adult'] },
    { id: 'arbitrate', type: 'arbitrate', label: 'Arbitrate' },
  ],
  edges: [
    { from: 'source', to: 'eligibility' },
    { from: 'eligibility', to: 'arbitrate' },
  ],
} as unknown as ExecArtifact;

const runner = createFlowTestRunner(catalogue);

const request = (age: number): FlowTestCase['request'] => ({
  customerId: 'cust_1',
  channel: 'email',
  placement: 'weekly_offers',
  occurredAt: '2026-06-01T12:00:00.000Z',
  input: { age },
  consent: { marketing: true, profiling: true, thirdParty: false },
});

describe('running a flow author\'s cases', () => {
  it('passes a case whose expectation holds', async () => {
    const [result] = await runner.run(artifact, [
      { name: 'an adult is offered something', request: request(41), expect: { winner: 'offer_adult' } },
    ]);
    expect(result).toEqual({ name: 'an adult is offered something', passed: true, failures: [] });
  });

  it('fails a case whose expectation does not hold, and says what happened', async () => {
    const [result] = await runner.run(artifact, [
      { name: 'wrong winner', request: request(41), expect: { winner: 'offer_open' } },
    ]);
    expect(result.passed).toBe(false);
    // The message has to name both sides. "Assertion failed" would send the
    // author back to the console to work out what the flow actually did.
    expect(result.failures[0]).toContain('expected offer_open to win');
    expect(result.failures[0]).toContain('got offer_adult');
  });

  it('checks for no offer at all, which is the case people forget', async () => {
    // A suppression that stopped working fails silently: the flow still
    // returns something, and only a case asserting *nothing* catches it. Both
    // directions, because an assertion that cannot fail is not one.
    const [held] = await runner.run(artifact, [
      { name: 'a minor gets nothing', request: request(15), expect: { winner: null } },
    ]);
    expect(held.passed).toBe(true);

    const [leaked] = await runner.run(artifact, [
      { name: 'an adult should get nothing', request: request(41), expect: { winner: null } },
    ]);
    expect(leaked.passed).toBe(false);
    expect(leaked.failures[0]).toContain('expected no offer');
  });

  it('does not count "came second" as denied', async () => {
    // The engine records NOT_RANKED against every candidate that reached
    // arbitration and lost. Treating that as a denial would make this
    // assertion true for almost any non-winner — a test that cannot fail.
    const [result] = await runner.run(artifact, [
      { name: 'the runner-up was ruled out', request: request(41), expect: { denied: ['offer_open'] } },
    ]);
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain('reached arbitration and lost instead');
  });

  it('checks a specific candidate was denied', async () => {
    const [result] = await runner.run(artifact, [
      {
        name: 'a minor is not eligible for the adult offer',
        request: request(15),
        expect: { denied: ['offer_adult'] },
      },
    ]);
    expect(result.passed).toBe(true);
  });

  it('checks the reason code, not just that something was denied', async () => {
    // The difference between "it was refused" and "it was refused for the
    // reason we intended" is most of what a compliance surface is for.
    const [right] = await runner.run(artifact, [
      { name: 'denied on eligibility', request: request(15), expect: { reasonCodes: ['ELIGIBILITY_FAILED'] } },
    ]);
    expect(right.passed).toBe(true);

    const [wrong] = await runner.run(artifact, [
      { name: 'denied on suitability', request: request(15), expect: { reasonCodes: ['SUITABILITY_FAILED'] } },
    ]);
    expect(wrong.passed).toBe(false);
    // Naming the codes that were seen saves a round trip to the trace view.
    expect(wrong.failures[0]).toContain('ELIGIBILITY_FAILED');
  });

  it('reports every unmet expectation, not only the first', async () => {
    const [result] = await runner.run(artifact, [
      {
        name: 'several things wrong',
        request: request(41),
        expect: { winner: null, denied: ['offer_adult'], reasonCodes: ['CONSENT_WITHHELD'] },
      },
    ]);
    // Fixing one failure at a time, with a publish between each, is how a
    // ten-minute change becomes an afternoon.
    expect(result.failures).toHaveLength(3);
  });

  it('turns an engine failure into a failed case, not a failed publish', async () => {
    const broken = { ...artifact, nodes: [] } as unknown as ExecArtifact;
    const [result] = await runner.run(broken, [
      { name: 'a case against a broken flow', request: request(41), expect: { winner: 'offer_adult' } },
    ]);
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/threw|expected/);
  });

  it('runs every case, so one failure does not hide the rest', async () => {
    const results = await runner.run(artifact, [
      { name: 'first', request: request(41), expect: { winner: 'nope' } },
      { name: 'second', request: request(41), expect: { winner: 'offer_adult' } },
    ]);
    expect(results.map((r) => r.passed)).toEqual([false, true]);
  });
});
