import { describe, it, expect, beforeEach } from 'vitest';
import { execute, rankByPriority } from '@metis/runtime/deterministic/engine';
import { hash } from '@metis/runtime/deterministic/canonical';
import { catalogueSnapshot, findExecArtifact } from '@/mocks/fixtures/engine';
import { fibreAddressScenario } from '@/mocks/fixtures/arbitration-scenario';
import { catalogueByHash, readCatalogue } from '@/mocks/catalogue-state';
import { inertWeights } from '@/mocks/arbitration-preview';
import { POST } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';

/**
 * `previewArbitration` shows numbers the engine produced, and nothing else.
 *
 * Until 2026-09-14 the browser ranked the scenario itself, with a copy of the
 * engine's arithmetic held to it by a test. A preview of the engine computed
 * outside the engine is a number the engine did not produce, so the arithmetic
 * moved behind a proposed operation (G-123) and these check the numbers against
 * the engine directly: a recorded decision at the live weights, and `execute`
 * under every proposed weight in a grid.
 */

const T = 'telco-us';
const artifact = findExecArtifact('next-best-action')!;
const LIVE = catalogueSnapshot.arbitration.weights;

type Row = { rank: number; key: string; name: string; priority: number };
type Preview = {
  live: { weights: Record<string, number>; rows: Row[] };
  proposed: { weights: Record<string, number>; rows: Row[] };
  inertWeights: { weight: string; value: number; reason: string }[];
};

const marcus = () => {
  const u = store.users.find((x) => x.email === 'marcus.webb@telco.example')!;
  return { authorization: `Bearer metis.${u.id}`, 'content-type': 'application/json' };
};

const post = (path: string[], body: unknown, headers: Record<string, string> = marcus()) =>
  POST(new Request(`http://localhost/api/${path.join('/')}`, { method: 'POST', headers, body: JSON.stringify(body) }), {
    params: Promise.resolve({ path }),
  });

async function preview(weights: Record<string, number>): Promise<Preview> {
  const res = await post(['arbitration', T, 'preview'], { weights });
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as Preview;
}

function engineUnder(weights: Record<string, number>) {
  const catalogue = {
    ...catalogueSnapshot,
    arbitration: { ...catalogueSnapshot.arbitration, weights: weights as typeof LIVE },
  };
  return execute(artifact, catalogue, fibreAddressScenario.request).decision;
}

describe('POST /api/arbitration/{tenant}/preview', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('ranks at the live weights exactly as a recorded decision at that slot, and records nothing itself', async () => {
    const count = async () => (await store.ledger.query({ tenantId: T, limit: 20000 })).length;
    const before = await count();
    const { live } = await preview({ ...LIVE });
    expect(await count(), 'the preview wrote a decision into the ledger').toBe(before);
    expect(live.rows.length).toBeGreaterThanOrEqual(3);

    const decided = await post(['placements', T, 'homepage_hero', 'decisions'], {
      request: { ...fibreAddressScenario.request, customerId: 'cust_arbitration_preview' },
    });
    expect(decided.status, await decided.clone().text()).toBe(200);
    const { decisionId } = (await decided.json()) as { decisionId: string };
    const recorded = (await store.ledger.get(T, decisionId))!.record.decision;

    expect(Object.fromEntries(live.rows.map((r) => [r.key, r.priority]))).toEqual(
      Object.fromEntries(Object.entries(recorded.scores).map(([k, s]) => [k, s.priority]))
    );
    expect(live.rows[0].key).toBe(recorded.arbitration.winner);
    expect(live.rows[1].key).toBe(recorded.arbitration.runnerUp);
  });

  it('ranks proposed weights as the engine does under them, across a grid', async () => {
    const disagreements: string[] = [];
    for (const value of [0, 1, 2]) {
      for (const boost of [0, 0.35, 1, 2]) {
        for (const context of [0, 2]) {
          const weights = { propensity: 1, value, boost, context };
          const { proposed } = await preview(weights);
          const engine = engineUnder(weights);

          const order = rankByPriority(Object.keys(engine.scores), engine.scores);
          if (JSON.stringify(proposed.rows.map((r) => r.key)) !== JSON.stringify(order)) {
            disagreements.push(`${JSON.stringify(weights)} order: preview ${proposed.rows.map((r) => r.key)}, engine ${order}`);
          }
          for (const row of proposed.rows) {
            if (row.priority !== engine.scores[row.key].priority) {
              disagreements.push(`${JSON.stringify(weights)} ${row.key}: preview ${row.priority}, engine ${engine.scores[row.key].priority}`);
            }
          }
          if (proposed.rows[0].key !== engine.arbitration.winner) {
            disagreements.push(`${JSON.stringify(weights)} winner: preview ${proposed.rows[0].key}, engine ${engine.arbitration.winner}`);
          }
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('leaves the proposed weights out of the catalogue registry', async () => {
    // A catalogue registered by hash is one a recorded decision can be replayed
    // against; a slider position must never become one.
    const weights = { ...LIVE, boost: 0.45 };
    await preview(weights);
    const cat = await readCatalogue();
    const proposedSnapshot = {
      offers: cat.offers,
      targetingPolicies: cat.targetingPolicies,
      frequencyPolicies: cat.frequencyPolicies,
      arbitration: { ...cat.arbitration!, weights },
      boosts: cat.boosts,
      connectors: cat.connectors,
    };
    expect(catalogueByHash(hash(proposedSnapshot))).toBeUndefined();
  });

  it('names propensity and context as moving no offer in this tenant, and not value or boost', async () => {
    const { inertWeights: inert } = await preview({ ...LIVE });
    expect(inert.map((w) => [w.weight, w.value])).toEqual([
      ['propensity', 1],
      ['context', 1],
    ]);
    for (const w of inert) expect(w.reason).toContain('no scoring node');
  });

  it('moves no offer when an inert weight moves, and reorders when boost does', async () => {
    const live = (await preview({ ...LIVE })).live.rows.map((r) => r.key);
    expect((await preview({ ...LIVE, context: 2, propensity: 0 })).proposed.rows.map((r) => r.key)).toEqual(live);

    const unboosted = (await preview({ ...LIVE, boost: 0 })).proposed.rows.map((r) => r.key);
    expect(unboosted).not.toEqual(live);
    expect(unboosted[0]).toBe('5g_home_ultimate');
  });

  it('refuses a weight out of range, and a caller with no session', async () => {
    expect((await post(['arbitration', T, 'preview'], { weights: { ...LIVE, boost: 2.5 } })).status).toBe(400);
    expect((await post(['arbitration', T, 'preview'], { weights: { propensity: 1, value: 1, boost: 1 } })).status).toBe(400);
    expect(
      (await post(['arbitration', T, 'preview'], { weights: { ...LIVE } }, { 'content-type': 'application/json' })).status
    ).toBe(401);
  });
});

describe('which weights move no offer', () => {
  const scored = (terms: Record<string, Record<string, number>>, applied: string[]) =>
    ({
      scores: Object.fromEntries(
        Object.entries(terms).map(([k, t]) => [k, { propensity: 1, value: 0.1, boost: 1, context: 1, cost: 0, priority: 0, ...t }])
      ),
      arbitration: { missingScore: { applied, approved: null }, formula: '', utility: { id: 'multiplicative', version: '1.0.0' }, winner: null, runnerUp: null },
    }) as never;

  it('finds none where a scoring node gave every term its own value', () => {
    const decision = scored(
      {
        a: { propensity: 0.3, value: 0.2, boost: 1.1, context: 0.7 },
        b: { propensity: 0.6, value: 0.1, boost: 1, context: 0.4 },
      },
      []
    );
    expect(inertWeights(decision)).toEqual([]);
  });

  it('finds a shared term from the numbers, and does not blame a scoring node that ran', () => {
    const decision = scored(
      {
        a: { propensity: 0.3, context: 0.9, boost: 1.1 },
        b: { propensity: 0.6, context: 0.9, boost: 1 },
      },
      []
    );
    const inert = inertWeights(decision);
    expect(inert.map((w) => w.weight)).toEqual(['value', 'context']);
    for (const w of inert) expect(w.reason).not.toContain('scoring node');
  });
});
