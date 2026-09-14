import { describe, it, expect, beforeEach } from 'vitest';
import { execute } from '@metis/runtime/deterministic/engine';
import { rankCandidates } from '@metis/core/arbitration';
import { catalogueSnapshot, findExecArtifact } from '@/mocks/fixtures/engine';
import { fibreAddressScenario } from '@/mocks/fixtures/arbitration-scenario';
import { GET, POST } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';

/**
 * `/arbitration` shows the ranking a decision would make, and it is checked.
 *
 * The screen holds one scenario's terms and ranks them under whatever weights a
 * person drags to. That is only honest if weights enter a ranking after scoring
 * and nowhere else, and if `rankCandidates` combines, rounds and breaks ties
 * exactly as the engine does. So the engine is run under every weight in a grid
 * and the two are required to agree on every priority and on the winner.
 *
 * The tie the screen warns about is asserted from the numbers: three of this
 * tenant's offers have the same expected margin and are separated only by the
 * boosts on two of them, so with the boost weight at zero nothing separates
 * them and the engine orders them by key.
 */

const artifact = findExecArtifact('next-best-action')!;

function engineUnder(weights: Record<string, number>) {
  const catalogue = {
    ...catalogueSnapshot,
    arbitration: { ...catalogueSnapshot.arbitration, weights: weights as typeof catalogueSnapshot.arbitration.weights },
  };
  return execute(artifact, catalogue, fibreAddressScenario.request).decision;
}

const termsOf = (decision: ReturnType<typeof engineUnder>) =>
  Object.entries(decision.scores).map(([key, s]) => ({
    key,
    name: key,
    terms: { propensity: s.propensity, value: s.value, boost: s.boost, context: s.context, cost: s.cost },
  }));

const GRID = [0, 0.35, 1, 1.65, 2];

describe('the preview ranks as the engine does', () => {
  it('has candidates to rank, so the agreement below is about something', () => {
    const decision = engineUnder(catalogueSnapshot.arbitration.weights);
    expect(Object.keys(decision.scores).length, 'nothing reached ranking in the scenario').toBeGreaterThanOrEqual(3);
  });

  it('agrees with the engine on every priority and the winner, across a grid of weights', () => {
    // Terms scored once, at the live weights, as the screen holds them.
    const terms = termsOf(engineUnder(catalogueSnapshot.arbitration.weights));
    const disagreements: string[] = [];

    for (const value of GRID) {
      for (const boost of GRID) {
        for (const context of [0, 1, 2]) {
          const weights = { propensity: 1, value, boost, context };
          const decision = engineUnder(weights);
          const preview = rankCandidates(terms, weights, catalogueSnapshot.arbitration.utility);

          for (const row of preview.rows) {
            if (row.priority !== decision.scores[row.key].priority) {
              disagreements.push(`${JSON.stringify(weights)} ${row.key}: preview ${row.priority}, engine ${decision.scores[row.key].priority}`);
            }
          }
          if (preview.rows[0].key !== decision.arbitration.winner) {
            disagreements.push(`${JSON.stringify(weights)} winner: preview ${preview.rows[0].key}, engine ${decision.arbitration.winner}`);
          }
          if (preview.rows[1]?.key !== (decision.arbitration.runnerUp ?? undefined)) {
            disagreements.push(`${JSON.stringify(weights)} runner-up: preview ${preview.rows[1]?.key}, engine ${decision.arbitration.runnerUp}`);
          }
        }
      }
    }

    expect(disagreements).toEqual([]);
  });

  it('finds the tie in the data when the boost weight is zero, and none at the live weights', () => {
    const terms = termsOf(engineUnder(catalogueSnapshot.arbitration.weights));
    const utility = catalogueSnapshot.arbitration.utility;

    expect(rankCandidates(terms, catalogueSnapshot.arbitration.weights, utility).ties).toEqual([]);

    const unboosted = rankCandidates(terms, { ...catalogueSnapshot.arbitration.weights, boost: 0 }, utility);
    expect(unboosted.ties).toEqual([['5g_home_ultimate', 'fios_gigabit', 'gaming_plus_bundle']]);
    // And the engine, deciding for real, picks the first of them by key.
    const decision = engineUnder({ ...catalogueSnapshot.arbitration.weights, boost: 0 });
    expect(decision.arbitration.winner).toBe('5g_home_ultimate');
    expect(unboosted.rows[0].key).toBe('5g_home_ultimate');
  });
});

describe('GET /api/arbitration/{tenant}/scenario', () => {
  beforeEach(async () => {
    await resetStore();
  });

  const marcus = () => store.users.find((u) => u.email === 'marcus.webb@telco.example')!;
  const get = (path: string[]) =>
    GET(new Request(`http://localhost/api/${path.join('/')}`, { headers: { authorization: `Bearer metis.${marcus().id}` } }), {
      params: Promise.resolve({ path }),
    });

  type Scenario = {
    weights: Record<string, number>;
    utility: { id: string; version: string };
    candidates: { key: string; name: string; terms: Record<'propensity' | 'value' | 'boost' | 'context' | 'cost', number> }[];
    defaulted: string[];
  };

  it('ranks the scenario to the winner a real decision at that slot picks, and records nothing', async () => {
    const before = (await store.ledger.query({ tenantId: 'telco-us', limit: 20000 })).length;

    const res = await get(['arbitration', 'telco-us', 'scenario']);
    expect(res.status, await res.clone().text()).toBe(200);
    const scenario = (await res.json()) as Scenario;

    expect(scenario.candidates.length).toBeGreaterThanOrEqual(3);
    expect(scenario.defaulted.length, 'this flow runs no scoring node, so its terms are declared defaults').toBeGreaterThan(0);
    expect(
      (await store.ledger.query({ tenantId: 'telco-us', limit: 20000 })).length,
      'opening the preview wrote a decision into the ledger'
    ).toBe(before);

    // The same request, decided for real through the placement.
    const decided = await POST(
      new Request('http://localhost/api/placements/telco-us/homepage_hero/decisions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ request: { ...fibreAddressScenario.request, customerId: 'cust_arbitration_agreement' } }),
      }),
      { params: Promise.resolve({ path: ['placements', 'telco-us', 'homepage_hero', 'decisions'] }) }
    );
    expect(decided.status, await decided.clone().text()).toBe(200);
    const { decisionId } = (await decided.json()) as { decisionId: string };
    const entry = await store.ledger.get('telco-us', decisionId);

    const preview = rankCandidates(scenario.candidates, scenario.weights, scenario.utility);
    expect(preview.rows[0].key).toBe(entry!.record.decision.arbitration.winner);
  });
});
