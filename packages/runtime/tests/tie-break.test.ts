import { describe, it, expect } from 'vitest';
import { execute, orderCandidates } from '../src/deterministic/engine';
import type { ExecArtifact, CatalogueSnapshot, DecisionRequest } from '../src/deterministic/types';
import { withGeneratedActions } from '@metis/core/domain';

/**
 * What decides a tie at equal priority — ADR-019 §8.
 *
 * It was `a.key.localeCompare(b.key)`, so a candidate's *name* could decide
 * which of two equally-ranked candidates won. No decision in the seeded corpus
 * turns on it: measured on 2026-09-16 over all 10,400, the closest the winner
 * and the runner-up ever come is a priority gap of 0.00833, about 4.5% of that
 * winner's priority.
 *
 * The `offer`/`action` split is what makes ties reachable. Two actions
 * instancing one offer inherit the same margin and can carry the same boosts
 * and the same propensity — three of the ranking function's four terms
 * identical by construction — so the pair the split introduces is exactly the
 * pair that ties. A rename would then be enough to move a winner, and a
 * decision record is evidence.
 *
 * So the rule is the flow author's declared order, which is already part of the
 * hashed decision, and a scored candidate the artifact never declared is a
 * refusal rather than a tie.
 */

/** Two candidates the ranking function cannot separate: same margin, same cost. */
function twin(key: string) {
  return {
    id: `off_${key}`,
    key,
    status: 'active',
    boost: 1,
    policyIds: [],
    validity: { startsAt: '2024-01-01', endsAt: null },
    creativeIds: [],
    tags: [],
    financials: {
      expectedMargin: { amount: 2000, currency: 'GBP' },
      cost: { amount: 200, currency: 'GBP' },
      price: { amount: 0, currency: 'GBP' },
    },
  };
}

const ARBITRATION = {
  id: 'arb',
  tenantId: 'telco-us',
  // Boost alone: propensity and context are what a seeded model would vary by
  // customer, and this test is about what happens when nothing varies.
  weights: { propensity: 0, value: 0, boost: 1, context: 0 },
  utility: { id: 'multiplicative', version: '1.0.0' },
  formula: 'Priority = B^1',
  updatedAt: '2026-01-01T00:00:00Z',
  updatedBy: 'test',
};

const catalogue = (keys: string[]): CatalogueSnapshot =>
  (withGeneratedActions({
    offers: keys.map(twin) as unknown as CatalogueSnapshot['offers'],
    targetingPolicies: [],
    frequencyPolicies: [],
    boosts: [],
    connectors: [],
    arbitration: ARBITRATION,
  })) as unknown as CatalogueSnapshot;

const artifact = (candidateKeys: string[]): ExecArtifact =>
  ({
    id: 'next-best-action',
    version: '2.4.0',
    tenantId: 'telco-us',
    candidateKeys,
    packageVersions: { '@metis/nodes-core': '1.2.0' },
    nodes: [
      { id: 'source', type: 'source', label: 'Source' },
      { id: 'arbitrate', type: 'arbitrate', label: 'Arbitrate' },
    ],
    edges: [{ from: 'source', to: 'arbitrate' }],
  }) as unknown as ExecArtifact;

const REQ: DecisionRequest = {
  tenantId: 'telco-us',
  customerId: 'cust_88213',
  channel: 'web',
  placement: 'account_dashboard_hero',
  occurredAt: '2026-09-04T08:00:00.000Z',
  input: { customer: { age: 45, credit_status: 'pass' } },
  consent: { marketing: true, profiling: true, thirdParty: false },
};

describe('a tie at equal priority is broken by the order the flow declared', () => {
  it('gives the win to whichever candidate the artifact names first', () => {
    const keys = ['zulu_action', 'alpha_action'];
    const trace = execute(artifact(keys), catalogue(keys), REQ);

    // Both scored the same: this is a tie, not a ranking.
    const scores = trace.decision.scores;
    expect(scores['zulu_action'].priority).toBe(scores['alpha_action'].priority);

    // Declared first wins, though it sorts last by name. Under the old rule
    // `alpha_action` won, and renaming it would have handed the decision over.
    expect(trace.decision.winner).toBe('zulu_action');
  });

  it('follows the declaration when it is reversed, so the order is the rule and not the name', () => {
    const keys = ['alpha_action', 'zulu_action'];
    const trace = execute(artifact(keys), catalogue(keys), REQ);
    expect(trace.decision.scores['alpha_action'].priority).toBe(trace.decision.scores['zulu_action'].priority);
    expect(trace.decision.winner).toBe('alpha_action');
  });

  it('refuses a scored candidate the artifact never declared, rather than ranking it first', () => {
    // `indexOf` returning -1 would sort this candidate ahead of everything,
    // silently, which is the branch ADR-019 §8 removed. `execute` ranks exactly
    // what the artifact declares, so this state is unreachable through it —
    // which is why the ranking is a function and this drives it directly.
    const declared = { id: 'next-best-action', version: '2.4.0', candidateKeys: ['alpha_action', 'zulu_action'] };
    const scores = {
      alpha_action: { priority: 1 },
      zulu_action: { priority: 1 },
      ghost_action: { priority: 1 },
    };

    expect(() =>
      orderCandidates([{ key: 'alpha_action' }, { key: 'ghost_action' }], scores, declared)
    ).toThrow(/scored the candidate "ghost_action", which is not in its candidateKeys/);

    // And the same candidates without the ghost rank without complaint, so the
    // refusal is about the mismatch and not about the shape of the call.
    expect(
      orderCandidates([{ key: 'zulu_action' }, { key: 'alpha_action' }], scores, declared).map((c) => c.key)
    ).toEqual(['alpha_action', 'zulu_action']);
  });
});
