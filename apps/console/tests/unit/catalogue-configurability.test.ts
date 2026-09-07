import { describe, it, expect, beforeEach } from 'vitest';
import { POST, PUT } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { catalogueByHash, currentCatalogue, catalogueCount } from '@/mocks/catalogue-state';

/**
 * Configuration reaches the engine, and history survives it.
 *
 * Two properties that sound independent and are the same mechanism.
 *
 * Before this, `PUT /arbitration` returned 200, persisted, audited and updated
 * the formula on screen — and the next decision came back byte-identical. The
 * console wrote to `store.*`; the engine read the fixture modules. The most
 * prominent configurable control in the product changed nothing, and the
 * engine's own file comment claimed it did.
 *
 * Making the write land is half of it. The other half is that a decision
 * record keeps `catalogueSnapshotHash` and never the catalogue, so once the
 * catalogue can change, replay has to be able to fetch the one a decision
 * names — or it silently answers a different question.
 */

const ADMIN = () => {
  const marcus = store.users.find((u) => u.email === 'marcus.webb@telco.example');
  if (!marcus) throw new Error('fixture has no administrator to authorise with');
  return { authorization: `Bearer metis.${marcus.id}`, 'content-type': 'application/json' };
};

const INPUT = {
  customer: {
    age: 29,
    credit_status: 'pass',
    account_status: 'active',
    current_plan: 'standard',
    bill_to_income_ratio: 0.02,
    arrears_count_12mo: 0,
  },
  address: { fibre_available: true },
  usage: { pct_of_allowance_3mo_avg: 0.88, months_of_history: 9 },
  contract: { days_to_end: 150 },
  events: { pac_requested_within_days: 999 },
  device: { residual_value: 18000 },
  offer: { monthly_delta: 300 },
};
const CONTACT = { channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } };

const call = (path: string[], body: unknown, method: 'POST' | 'PUT' = 'POST', headers = ADMIN()) =>
  (method === 'PUT' ? PUT : POST)(
    new Request(`http://localhost/api/${path.join('/')}`, {
      method,
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ path }) }
  );

/** One decision through the placement endpoint, with its catalogue hash. */
async function decide(customerId = 'cust_cfg') {
  const res = await call(['placements', 'telco-uk', 'homepage_hero', 'decisions'], {
    request: {
      tenantId: 'telco-uk',
      customerId,
      channel: 'web',
      occurredAt: '2026-06-01T12:00:00.000Z',
      input: INPUT,
      consent: { marketing: true, profiling: true, thirdParty: false },
      contactHistory: CONTACT,
    },
  });
  const body = (await res.json()) as {
    decisionId: string;
    chainHash: string;
    entries: { action: string; priority: number }[];
  };
  expect(res.status).toBe(200);

  const trace = await store.ledger.get('telco-uk', body.decisionId);
  return {
    id: body.decisionId,
    chainHash: body.chainHash,
    ranked: body.entries.map((e) => `${e.action}@${e.priority}`).join(', '),
    catalogueHash: trace!.record.decision.catalogueSnapshotHash,
  };
}

const setWeights = (weights: Record<string, number>) =>
  call(['arbitration', 'telco-uk'], { weights }, 'PUT');

describe('configuration reaches the engine', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('a change to the ranking function changes the ranking', async () => {
    // The headline. This assertion failing means the console is decorative
    // again, whatever the screen says after a save.
    await setWeights({ propensity: 1, value: 1, boost: 1, context: 0.5 });
    const before = await decide();

    await setWeights({ propensity: 1, value: 0.1, boost: 3, context: 0.5 });
    const after = await decide();

    expect(after.ranked).not.toBe(before.ranked);
  });

  it('persisting the weights is not the same as applying them', async () => {
    // The failure mode had a green path all the way through: 200, persisted,
    // audited, formula updated. Only the decision disagreed. So the write is
    // asserted *and* its effect, because the write alone proved nothing.
    const res = await setWeights({ propensity: 1, value: 2, boost: 1, context: 0.5 });
    expect(res.status).toBe(200);
    expect(store.arbitration.weights.value).toBe(2);
    expect(store.arbitration.formula).toContain('V^2.00');

    expect(currentCatalogue().arbitration.weights.value).toBe(2);
  });

  it('a policy the console deactivates stops filtering', async () => {
    // Weights are one field. This is a different shape of edit — a row in a
    // list going inactive — and it has to reach the engine too, or "reaches
    // the engine" was a statement about one endpoint.
    const fibre = store.targetingPolicies.find((p) => p.id === 'pol_fibre_available');
    expect(fibre, 'fixture has no fibre policy to test with').toBeDefined();

    const withFibreOff = { ...INPUT, address: { fibre_available: false } };
    const ask = async () => {
      const res = await call(['placements', 'telco-uk', 'homepage_hero', 'decisions'], {
        request: {
          tenantId: 'telco-uk',
          customerId: 'cust_pol',
          channel: 'web',
          occurredAt: '2026-06-01T12:00:00.000Z',
          input: withFibreOff,
          consent: { marketing: true, profiling: true, thirdParty: false },
          contactHistory: CONTACT,
        },
      });
      const b = (await res.json()) as { entries: { action: string }[] };
      return b.entries.map((e) => e.action);
    };

    expect(await ask()).not.toContain('acq_fibre_900');

    fibre!.active = false;
    expect(await ask()).toContain('acq_fibre_900');
  });
});

describe('history survives configuration', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('an edit mints a new catalogue and keeps the old one', async () => {
    await setWeights({ propensity: 1, value: 1, boost: 1, context: 0.5 });
    const before = await decide();

    await setWeights({ propensity: 1, value: 0.1, boost: 3, context: 0.5 });
    const after = await decide();

    expect(after.catalogueHash).not.toBe(before.catalogueHash);

    // Both are still retrievable. The old one is what makes the old decision
    // replayable; losing it would make every decision before an edit
    // unexplainable, which is the opposite of the platform's whole claim.
    expect(catalogueByHash(before.catalogueHash)).toBeDefined();
    expect(catalogueByHash(after.catalogueHash)).toBeDefined();
  });

  it('the kept catalogue is the one that decided, not a live reference', async () => {
    // The store mutates in place — `PUT /arbitration` assigns into
    // `store.arbitration.weights` rather than replacing it — so holding a
    // reference would let a later edit rewrite the history of a decision
    // already made. That is the one thing a snapshot must never do.
    await setWeights({ propensity: 1, value: 1, boost: 1, context: 0.5 });
    const before = await decide();

    await setWeights({ propensity: 1, value: 0.1, boost: 3, context: 0.5 });

    const kept = catalogueByHash(before.catalogueHash);
    expect(kept!.arbitration.weights.value).toBe(1);
    expect(store.arbitration.weights.value).toBe(0.1);
  });

  it('an unchanged catalogue is not a new catalogue', async () => {
    // Otherwise the registry grows once per decision rather than once per
    // edit, and "every catalogue is kept" becomes a leak.
    await setWeights({ propensity: 1, value: 1, boost: 1, context: 0.5 });
    const first = await decide('cust_a');
    const count = catalogueCount();

    const second = await decide('cust_b');

    expect(second.catalogueHash).toBe(first.catalogueHash);
    expect(catalogueCount()).toBe(count);
  });

  it('refuses to replay against a catalogue it does not hold', async () => {
    // The honest failure. Replaying against a substitute would return a
    // verdict about a question nobody asked — and would return it as either
    // "identical" or a difference that is really somebody's edit.
    const made = await decide();
    const entry = await store.ledger.get('telco-uk', made.id);
    entry!.record.decision.catalogueSnapshotHash = 'f'.repeat(64);

    const res = await call(['decisions', made.id, 'replay'], {
      input: INPUT,
      contactHistory: CONTACT,
    });
    const body = (await res.json()) as { error: string; message: string };

    expect(res.status).toBe(409);
    expect(body.error).toBe('catalogue_unavailable');
    expect(body.message).toContain('ffffffffffff');
  });
});
