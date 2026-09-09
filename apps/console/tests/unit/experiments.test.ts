import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST, PUT } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { assignArm } from '@metis/core/experiment';

/**
 * Experiments over HTTP, and the property that makes them worth having.
 *
 * An arm is a pure function of the customer reference. Nothing stores it, and
 * it is still recoverable from a decision record made months ago — which is
 * exactly what most platforms cannot do, because their assignment lived in a
 * service that has since rebalanced.
 *
 * That recoverability is the reason a running experiment is frozen, so the
 * refusal is tested as carefully as the feature.
 */

const AUTH = (email: string) => {
  const u = store.users.find((x) => x.email === email);
  if (!u) throw new Error(`no fixture user ${email}`);
  return { authorization: `Bearer metis.${u.id}`, 'content-type': 'application/json' };
};
/** Authors flows; experiments are the same authority. */
const SARAH = () => AUTH('sarah.chen@telco.example');
/** Compliance: approves, does not author. */
const PRIYA = () => AUTH('priya.natarajan@telco.example');

const call = (
  path: string[],
  body?: unknown,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  headers = SARAH()
) => {
  const req = new Request(`http://localhost/api/${path.join('/')}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const ctx = { params: Promise.resolve({ path }) };
  if (method === 'GET') return GET(req, ctx);
  return method === 'PUT' ? PUT(req, ctx) : POST(req, ctx);
};

/**
 * Start the seeded draft.
 *
 * No experiment is seeded running: one would add `experiments.<key>` to every
 * decision's hashed input and silently move every chain hash in the product.
 * Starting it here is the same deliberate act the page makes somebody take.
 */
async function startHoldout() {
  const draft = store.experiments.find((e) => e.key === 'fibre_holdout')!;
  const res = await call(['experiments', 'telco-uk', draft.id], { status: 'running' }, 'PUT');
  expect(res.status, await res.clone().text()).toBe(200);
  return store.experiments.find((e) => e.key === 'fibre_holdout')!;
}

const INPUT = {
  customer: {
    age: 41,
    credit_status: 'pass',
    account_status: 'active',
    current_plan: 'standard',
    bill_to_income_ratio: 0.018,
    arrears_count_12mo: 0,
  },
  address: { fibre_available: true },
  usage: { pct_of_allowance_3mo_avg: 0.94, months_of_history: 14 },
  contract: { days_to_end: 210 },
  events: { pac_requested_within_days: 999 },
  device: { residual_value: 32000 },
  offer: { monthly_delta: 300 },
};

async function decide(customerId: string) {
  const res = await call(
    ['placements', 'telco-uk', 'homepage_hero', 'decisions'],
    {
      request: {
        tenantId: 'telco-uk',
        customerId,
        channel: 'web',
        occurredAt: '2026-06-01T12:00:00.000Z',
        input: INPUT,
        consent: { marketing: true, profiling: true, thirdParty: false },
        contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
      },
    },
    'POST'
  );
  const body = (await res.json()) as { decisionId: string; entries: { action: string }[] };
  return { id: body.decisionId, actions: body.entries.map((e) => e.action) };
}

describe('an arm is part of what was decided', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('reaches the input, so two arms hash differently', async () => {
    // The property that makes an experiment replayable: the arm is in the
    // hashed input, not context alongside it. Two customers in different arms
    // must therefore produce different input hashes.
    const running = await startHoldout();

    let a: string | null = null;
    let b: string | null = null;
    for (let i = 0; i < 200 && (!a || !b); i++) {
      const ref = `cust_arm_${i}`;
      const arm = assignArm(running, ref)!.key;
      if (arm === 'holdout' && !a) a = ref;
      if (arm === 'treated' && !b) b = ref;
    }
    expect(a, 'fixture never assigned anybody to the holdout').toBeTruthy();
    expect(b).toBeTruthy();

    const first = await decide(a!);
    const second = await decide(b!);

    const t1 = await store.ledger.get('telco-uk', first.id);
    const t2 = await store.ledger.get('telco-uk', second.id);
    expect(t1!.record.decision.inputSnapshotHash).not.toBe(
      t2!.record.decision.inputSnapshotHash
    );
  });

  it('is recomputable from the record, having never been stored', async () => {
    // The whole design. The record carries `customerRef` and no arm, and the
    // arm is still recoverable.
    const running = await startHoldout();
    const { id } = await decide('cust_recompute');
    const entry = await store.ledger.get('telco-uk', id);

    const recomputed = assignArm(running, entry!.record.decision.customerRef!);
    expect(recomputed).not.toBeNull();
    expect(['holdout', 'treated']).toContain(recomputed!.key);
  });

  it('assigns nobody from a draft experiment', async () => {
    const draft = store.experiments.find((e) => e.key === 'fibre_holdout')!;
    expect(draft.status).toBe('draft');
    const { id } = await decide('cust_draft');
    const entry = await store.ledger.get('telco-uk', id);
    const input = entry!.record.decision as unknown as { inputSnapshotHash: string };
    expect(input.inputSnapshotHash).toBeTruthy();
    expect(assignArm(draft, 'cust_draft')).toBeNull();
  });
});

describe('the arm is offered as an ordinary field', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('appears in the picker with its arms as members', async () => {
    await startHoldout();
    // A holdout is an eligibility rule that refuses when the arm is the
    // untreated one — written in the same editor as every other rule, not in a
    // parallel experiment-only concept.
    const res = await call(['profile-schema', 'telco-uk']);
    const body = (await res.json()) as {
      experimentPaths: { path: string; members: string[]; type: string }[];
    };

    const holdout = body.experimentPaths.find((p) => p.path === 'experiments.fibre_holdout')!;
    expect(holdout.type).toBe('enum');
    expect(holdout.members).toEqual(['holdout', 'treated']);
  });

  it("does not offer a draft experiment's arms", async () => {
    // Seeded as a draft, so it must not appear until somebody starts it.
    const res = await call(['profile-schema', 'telco-uk']);
    const body = (await res.json()) as { experimentPaths: { path: string }[] };
    expect(body.experimentPaths.map((p) => p.path)).not.toContain('experiments.fibre_holdout');
  });
});

describe('a running experiment is frozen', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('refuses to reweight it, and says why', async () => {
    const running = await startHoldout();
    const res = await call(
      ['experiments', 'telco-uk', running.id],
      { arms: [{ key: 'holdout', name: 'Held', weight: 50 }, { key: 'treated', name: 'Offered', weight: 50 }] },
      'PUT'
    );
    const body = (await res.json()) as { error: string; message: string };

    expect(res.status).toBe(409);
    expect(body.error).toBe('experiment_frozen');
    expect(body.message).toContain('Stop it and start another');
  });

  it('allows renaming it', async () => {
    const running = await startHoldout();
    const res = await call(['experiments', 'telco-uk', running.id], { name: 'Clearer' }, 'PUT');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { name: string }).name).toBe('Clearer');
  });

  it('allows reweighting a draft', async () => {
    const created = await call(
      ['experiments', 'telco-uk'],
      {
        key: 'new_test',
        name: 'New test',
        arms: [
          { key: 'a', name: 'A', weight: 1 },
          { key: 'b', name: 'B', weight: 1 },
        ],
      },
      'POST'
    );
    expect(created.status, await created.clone().text()).toBe(201);
    const id = ((await created.json()) as { id: string }).id;

    const res = await call(
      ['experiments', 'telco-uk', id],
      {
        arms: [
          { key: 'a', name: 'A', weight: 9 },
          { key: 'b', name: 'B', weight: 1 },
        ],
      },
      'PUT'
    );
    expect(res.status).toBe(200);
  });

  it('creates as a draft whatever was asked for', async () => {
    // Created running would start splitting live traffic before anybody
    // approved the split.
    const res = await call(
      ['experiments', 'telco-uk'],
      {
        key: 'sneaky',
        name: 'Sneaky',
        status: 'running',
        arms: [
          { key: 'a', name: 'A', weight: 1 },
          { key: 'b', name: 'B', weight: 1 },
        ],
      },
      'POST'
    );
    expect(((await res.json()) as { status: string }).status).toBe('draft');
  });

  it('refuses a key that would collide at the same field path', async () => {
    const res = await call(
      ['experiments', 'telco-uk'],
      {
        key: 'fibre_holdout',
        name: 'Another',
        arms: [
          { key: 'a', name: 'A', weight: 1 },
          { key: 'b', name: 'B', weight: 1 },
        ],
      },
      'POST'
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { message: string }).message).toContain('experiments.fibre_holdout');
  });

  it('refuses an ill-formed experiment', async () => {
    const res = await call(
      ['experiments', 'telco-uk'],
      { key: 'one_arm', name: 'One arm', arms: [{ key: 'only', name: 'Only', weight: 1 }] },
      'POST'
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { problems: string[] }).problems.join(' ')).toContain(
      'one arm is just a change'
    );
  });

  it('refuses an account that cannot author', async () => {
    const res = await call(['experiments', 'telco-uk'], { key: 'x', name: 'X' }, 'POST', PRIYA());
    expect(res.status).toBe(403);
  });
});

describe('performance by arm', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('splits the corpus across the arms it declares', async () => {
    await startHoldout();
    const res = await call(['performance', 'telco-uk']);
    const body = (await res.json()) as {
      arms: { experimentKey: string; arm: string; offered: number; acceptanceRate: number | null }[];
    };

    const holdout = body.arms.filter((a) => a.experimentKey === 'fibre_holdout');
    expect(holdout).toHaveLength(2);
    // Every offered decision lands in exactly one arm.
    const total = holdout.reduce((n, a) => n + a.offered, 0);
    expect(total).toBeGreaterThan(0);
    // Roughly the declared 10/90, over thousands of decisions.
    const held = holdout.find((a) => a.arm === 'holdout')!;
    expect(held.offered / total).toBeLessThan(0.2);
  });

  it('has no rate for an arm nobody reported on', async () => {
    // Held on arms with no measurement rather than on all of them: the seeded
    // corpus reports outcomes now (ADR-008 phase two), so an arm that has been
    // measured is expected to carry a rate and an arm that has not is expected
    // not to. Both halves matter; before phase two only the first was testable.
    const res = await call(['performance', 'telco-uk']);
    const body = (await res.json()) as {
      arms: { measured: number; acceptanceRate: number | null }[];
    };
    const unmeasured = body.arms.filter((a) => a.measured === 0);
    expect(unmeasured.every((a) => a.acceptanceRate === null)).toBe(true);
    expect(body.arms.filter((a) => a.measured > 0).every((a) => a.acceptanceRate !== null)).toBe(
      true
    );
  });
});
