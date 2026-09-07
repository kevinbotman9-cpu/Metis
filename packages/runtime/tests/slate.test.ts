import { describe, it, expect } from 'vitest';
import { execute } from '../src/deterministic/engine';
import { selectSlate } from '../src/slate';
import type {
  CatalogueSnapshot,
  DecisionRequest,
  ExecArtifact,
  DeterministicDecision,
} from '../src/deterministic/types';
import type { Offer } from '@metis/core/domain';

/**
 * A slate is a projection of a decision, and has to agree with it.
 *
 * The properties that matter are not "it returns a list". They are that the
 * first entry is the decision's own winner, that the order is stable across
 * runs, that a candidate a policy refused can never appear in it, and that a
 * slot it cannot fill is reported rather than padded. Each of those is a way a
 * slate could quietly disagree with the record it came from, which is the only
 * interesting failure mode here.
 */

const gbp = (amount: number) => ({ amount, currency: 'GBP' as const });

const offer = (key: string, margin: number): Offer => ({
  id: `off_${key}`,
  key,
  name: key,
  description: '',
  categoryId: 'g1',
  objectiveId: 'i1',
  status: 'active',
  financials: {
    price: gbp(3500),
    cost: gbp(100),
    expectedMargin: gbp(margin),
    termMonths: 24,
    oneOff: false,
  },
  validity: { startsAt: '2020-01-01', endsAt: null },
  boost: 1,
  policyIds: [],
  creativeIds: [],
  tags: [],
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
  updatedBy: 'test@metis.example',
});

const catalogue = (offers: Offer[]): CatalogueSnapshot => ({
  offers,
  targetingPolicies: [],
  frequencyPolicies: [],
  arbitration: {
    id: 'arb_1',
    utility: { id: 'multiplicative', version: '1.0.0' },
    weights: { propensity: 1, value: 1, boost: 1, context: 0.5 },
    updatedAt: '2020-01-01T00:00:00.000Z',
    updatedBy: 'test@metis.example',
  } as CatalogueSnapshot['arbitration'],
  boosts: [],
  connectors: [],
});

const artifact = (keys: string[]): ExecArtifact =>
  ({
    id: 'flow_slate',
    version: '1.0.0',
    tenantId: 'telco-uk',
    candidateKeys: keys,
    packageVersions: {},
    nodes: [
      { id: 'n_source', type: 'source', label: 'Source' },
      { id: 'n_score', type: 'score-model', label: 'Score', model: { id: 'm', version: '1.0.0' } },
      { id: 'n_arb', type: 'arbitrate', label: 'Arbitrate' },
    ],
    edges: [
      { from: 'n_source', to: 'n_score' },
      { from: 'n_score', to: 'n_arb' },
    ],
  }) as unknown as ExecArtifact;

const request = (over: Partial<DecisionRequest> = {}): DecisionRequest =>
  ({
    tenantId: 'telco-uk',
    customerId: 'cust_slate_1',
    channel: 'web',
    placement: 'homepage_grid',
    occurredAt: '2026-06-01T12:00:00.000Z',
    input: {},
    ...over,
  }) as DecisionRequest;

const keys = ['a_one', 'b_two', 'c_three', 'd_four'];
const decide = (over: Partial<DecisionRequest> = {}): DeterministicDecision =>
  execute(
    artifact(keys),
    catalogue([offer('a_one', 40000), offer('b_two', 30000), offer('c_three', 20000), offer('d_four', 10000)]),
    request(over)
  ).decision;

describe('selectSlate', () => {
  it('puts the decision’s own winner first', () => {
    const decision = decide();
    const slate = selectSlate(decision, 3);
    expect(slate.entries[0].action).toBe(decision.winner);
  });

  it('agrees with the recorded runner-up', () => {
    // Two independent statements of the same fact, so a slate that reordered
    // the tail would still be caught by the record it came from.
    const decision = decide();
    const slate = selectSlate(decision, 4);
    expect(slate.entries[1].action).toBe(decision.arbitration.runnerUp);
  });

  it('orders by priority, descending', () => {
    const slate = selectSlate(decide(), 4);
    const priorities = slate.entries.map((e) => e.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    expect(slate.entries.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
  });

  it('is byte-identical across 100 compositions', () => {
    // The engine is held to this and so is anything that claims to explain it.
    const decision = decide();
    const first = JSON.stringify(selectSlate(decision, 3));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(selectSlate(decision, 3))).toBe(first);
    }
  });

  it('breaks a tie by key, not by insertion order', () => {
    // Identical margins and one customer: value, boost and context match, so
    // only the seeded propensity separates them. Force the true tie by hand.
    const decision = decide();
    const tied: DeterministicDecision = {
      ...decision,
      scores: Object.fromEntries(
        Object.entries(decision.scores).map(([k, s]) => [k, { ...s, priority: 0.5 }])
      ),
    };
    expect(selectSlate(tied, 4).entries.map((e) => e.action)).toEqual([...keys].sort());
  });

  it('reports slots it cannot fill rather than padding them', () => {
    const slate = selectSlate(decide(), 9);
    expect(slate.entries).toHaveLength(4);
    expect(slate.unfilled).toBe(5);
  });

  it('keeps the candidates it left out, so a caller can say 3 of 4', () => {
    const slate = selectSlate(decide(), 3);
    expect(slate.entries).toHaveLength(3);
    expect(slate.ranked).toHaveLength(4);
    expect(slate.unfilled).toBe(0);
  });

  it('never offers a candidate that was scored and then refused', () => {
    // The failure mode that would be a defect rather than an untidiness. A
    // gate placed after a scoring node is an ordinary flow shape, and the
    // candidate it removes keeps its entry in `scores`. An implementation that
    // drew the slate from `scores` would put a refused offer in front of a
    // customer, and every other test in this file would still pass.
    const decision = decide();
    const scored: DeterministicDecision = {
      ...decision,
      scores: {
        ...decision.scores,
        // Priority above every real candidate, so a naive implementation puts
        // it at rank 1 and cannot be said to have got away with it by luck.
        refused_late: { propensity: 1, value: 1, boost: 1, context: 1, cost: 0, priority: 99 },
      },
      eliminations: [
        ...decision.eliminations,
        {
          nodeId: 'n_late_gate',
          nodeType: 'filter',
          reason: 'Suitability removed 1 candidate(s).',
          denials: [{ key: 'refused_late', code: 'SUITABILITY_FAILED', ruleId: 'pol_afford' }],
          survived: [],
        },
      ],
    };

    const slate = selectSlate(scored, 4);
    expect(slate.entries.map((e) => e.action)).not.toContain('refused_late');
    expect(slate.ranked.map((e) => e.action)).not.toContain('refused_late');
    // And the slate still leads with the decision's own winner.
    expect(slate.entries[0].action).toBe(decision.winner);
  });

  it('is empty when nothing reached ranking', () => {
    const decision = decide();
    const none: DeterministicDecision = {
      ...decision,
      eliminations: decision.eliminations.filter((s) => s.nodeType !== 'arbitrate'),
    };
    const slate = selectSlate(none, 3);
    expect(slate.entries).toEqual([]);
    expect(slate.unfilled).toBe(3);
  });

  it('refuses a slot count that is not a slot count', () => {
    const decision = decide();
    expect(() => selectSlate(decision, 0)).toThrow(/at least one slot/);
    expect(() => selectSlate(decision, -1)).toThrow(/at least one slot/);
    expect(() => selectSlate(decision, 1.5)).toThrow(/at least one slot/);
  });
});
