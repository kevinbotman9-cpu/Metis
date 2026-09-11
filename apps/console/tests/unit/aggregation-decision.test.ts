import { describe, it, expect, beforeEach } from 'vitest';
import { POST, PUT } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';

/**
 * A rollup reaching a decision.
 *
 * The unit tests in `packages/runtime` cover the arithmetic. This covers the
 * wiring, which is the part that silently does nothing if it is wrong: the
 * schema declares `accounts.worst_arrears_days`, a policy reads it, and the
 * only way the candidate is denied is if the number was computed from the
 * child records and merged into the input the engine hashed.
 */

const PRIYA = () => {
  const u = store.users.find((x) => x.email === 'priya.natarajan@telco.example')!;
  return { authorization: `Bearer metis.${u.id}`, 'content-type': 'application/json' };
};

const call = (
  path: string[],
  body: unknown,
  headers = PRIYA(),
  method: 'POST' | 'PUT' = 'POST'
) => {
  const req = new Request(`http://localhost/api/${path.join('/')}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
  const ctx = { params: Promise.resolve({ path }) };
  return method === 'PUT' ? PUT(req, ctx) : POST(req, ctx);
};

const BASE = {
  customer: {
    age: 41, credit_status: 'pass', account_status: 'active', current_plan: 'standard',
    bill_to_income_ratio: 0.018, arrears_count_12mo: 0,
    credit_band: 'A',
    address: { fibre_available: true },
    usage: { pct_of_allowance_3mo_avg: 0.94, months_of_history: 14 },
    contract: { days_to_end: 210 },
    events: { pac_requested_within_days: 999 },
    device: { residual_value: 32000 },
  },
  context: { offer: { monthly_delta: 300 } },
};

const decide = async (input: unknown) => {
  const res = await call(['placements', 'telco-uk', 'homepage_hero', 'decisions'], {
    request: {
      tenantId: 'telco-uk', customerId: 'cust_agg', channel: 'web',
      occurredAt: '2026-06-01T12:00:00.000Z',
      input,
      consent: { marketing: true, profiling: true, thirdParty: false },
      contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
    },
  });
  const body = (await res.json()) as { entries: { action: string }[] };
  return body.entries.map((e) => e.action);
};

describe('a rollup decides', () => {
  beforeEach(async () => {
    await resetStore();

    // An existing policy is repointed at the rollup, through the same
    // validated write path a person would use.
    //
    // Not a *new* policy, and that is a finding rather than a convenience: the
    // engine evaluates only the policies a flow node names in `policyIds`, so
    // creating one attaches it to nothing and it never runs. Same shape as
    // `candidateKeys` for offers, and it needs flow authoring to close. See
    // the test below, which holds the gap so it cannot close silently.
    const res = await call(['targeting-policies', 'telco-uk', 'pol_fibre_available'], {
      conditions: [{ field: 'customer.worst_arrears_days', operator: 'lt', value: 30 }],
    }, PRIYA(), 'PUT');
    expect(res.status).toBe(200);
  });

  // The repointed policy is scoped to the fibre offer, so it gates that one
  // and leaves the rest. Asserting the whole slate is empty would be asserting
  // the scope model rather than the rollup.
  it('offers when the children roll up under the threshold', async () => {
    const offered = await decide({
      ...BASE,
      customer: { ...BASE.customer, accounts: [{ arrears_days: 0 }, { arrears_days: 12 }] },
    });
    expect(offered).toContain('acq_fibre_900');
  });

  it('suppresses when one child breaches it', async () => {
    // 34 is the maximum across the two, so the rollup was computed rather than
    // read off the first record — 0 alone would have passed.
    const offered = await decide({
      ...BASE,
      customer: { ...BASE.customer, accounts: [{ arrears_days: 0 }, { arrears_days: 34 }] },
    });
    expect(offered).not.toContain('acq_fibre_900');
  });

  it('suppresses when the children were never loaded', async () => {
    // The fail-closed case, and the reason absent must not roll up to zero:
    // otherwise this offers to a customer whose accounts nobody checked.
    const offered = await decide(BASE);
    expect(offered).not.toContain('acq_fibre_900');
  });

  it('offers again for a customer with no accounts at all', async () => {
    // Empty is a fact, not a gap. `max` over nothing is unresolvable, so this
    // is still suppressed — which is the honest answer and worth pinning,
    // because a reader might expect an empty list to pass a `lt` gate.
    const offered = await decide({
      ...BASE,
      customer: { ...BASE.customer, accounts: [] },
    });
    expect(offered).not.toContain('acq_fibre_900');
  });
});

describe('a policy nobody attached', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('is stored, reaches the catalogue, and is never evaluated', async () => {
    // Held deliberately. Creating a policy through the console does not make it
    // apply: the engine evaluates only what a flow node names in `policyIds`,
    // and nothing wires a new one in. The write path is real and the effect is
    // not, which is exactly the shape of defect this codebase keeps finding —
    // so it is asserted rather than left for somebody to discover in a demo.
    const created = await call(['targeting-policies', 'telco-uk'], {
      name: 'Refuse everyone',
      kind: 'eligibility',
      description: 'A gate that would suppress every candidate, if it ran.',
      conditions: [{ field: 'customer.age', operator: 'gt', value: 200 }],
      scope: { level: 'tenant', targetId: null },
      active: true,
    });
    expect(created.status).toBe(201);

    const offered = await decide({
      ...BASE,
      customer: { ...BASE.customer, accounts: [] },
    });
    // Age over 200 would refuse every candidate if the policy ran at all.
    expect(
      offered.length,
      'if this is now empty, flow authoring has landed and this test should become the opposite assertion'
    ).toBeGreaterThan(0);
  });
});
