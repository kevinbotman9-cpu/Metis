import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { seedLedger } from '@/mocks/seed-ledger';

/**
 * Which decisions can be re-executed, and how a screen is told.
 *
 * Two claims live on a decision and only one is about replay. The chain hash
 * proves the record is unaltered, for every decision. Replay runs the engine
 * again over the same inputs, and a record holds `inputSnapshotHash` and never
 * the values (ADR-004) — so only a decision whose inputs the platform can still
 * produce is re-executable, which today means the generator holds it.
 *
 * Until 2026-09-16 the console offered the button for every decision and failed
 * with a 422 on the ones a channel had made, which is every decision the
 * storefront demo produces.
 */

const TENANT = 'telco-us';

function headers() {
  const marcus = store.users.find((u) => u.email === 'marcus.webb@telco.example')!;
  return { authorization: `Bearer metis.${marcus.id}`, 'content-type': 'application/json' };
}

async function get(path: string[]) {
  const req = new Request(`http://localhost/api/${path.join('/')}`, { headers: headers() });
  const res = await GET(req, { params: Promise.resolve({ path }) });
  expect(res.status, path.join('/')).toBe(200);
  return res.json() as Promise<{ replay?: { possible: boolean; reason: string | null } }>;
}

describe('a trace says whether the decision can be re-executed', () => {
  beforeEach(async () => {
    await resetStore();
    await store.ledgerReady;
    await seedLedger(store.ledger, { count: 40 });
  });

  it('offers replay for a decision the generator holds', async () => {
    const [entry] = await store.ledger.query({ tenantId: TENANT, limit: 1 });
    const trace = await get(['decisions', entry.decisionId, 'trace']);
    expect(trace.replay).toEqual({ possible: true, reason: null });
  });

  it('refuses it for a decision a channel made, and says why', async () => {
    const made = await POST(
      new Request('http://localhost/api/placements/telco-us/account_dashboard_hero/decisions', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ request: liveRequest() }),
      }),
      { params: Promise.resolve({ path: ['placements', TENANT, 'account_dashboard_hero', 'decisions'] }) }
    );
    expect(made.status, await made.clone().text()).toBeLessThan(300);
    const body = (await made.json()) as { decisions?: { decisionId?: string }[]; decisionId?: string };
    const decisionId = body.decisionId ?? body.decisions?.[0]?.decisionId;
    expect(decisionId, JSON.stringify(body).slice(0, 200)).toBeTruthy();

    const trace = await get(['decisions', decisionId!, 'trace']);
    expect(trace.replay).toEqual({ possible: false, reason: 'inputs_not_kept' });
  });

  it('agrees with what the replay endpoint actually does', async () => {
    // The point of carrying the flag at all: a button that offers what the
    // endpoint refuses is worse than no button.
    const [entry] = await store.ledger.query({ tenantId: TENANT, limit: 1 });
    const seeded = await get(['decisions', entry.decisionId, 'trace']);
    expect(seeded.replay!.possible).toBe(true);

    const replayed = await POST(
      new Request(`http://localhost/api/decisions/${entry.decisionId}/replay`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ path: ['decisions', entry.decisionId, 'replay'] }) }
    );
    expect(replayed.status).toBe(200);
  });
});

function liveRequest() {
  return {
    tenantId: TENANT,
    customerId: 'cust_replay_probe',
    channel: 'web',
    placement: 'account_dashboard_hero',
    occurredAt: '2026-09-05T12:00:00.000Z',
    input: {
      customer: {
        age: 40,
        credit_status: 'pass',
        account_status: 'active',
        current_plan: 'sim_only',
        bill_to_income_ratio: 0.02,
        arrears_count_12mo: 0,
        credit_band: 'A',
        address: { fiber_available: true },
        usage: { pct_of_allowance_3mo_avg: 0.5, months_of_history: 12 },
        contract: { days_to_end: 200 },
        events: { pac_requested_within_days: 999 },
        device: { residual_value: 0 },
      },
      context: { offer: { monthly_delta: 300 } },
    },
    consent: { marketing: true, profiling: true, thirdParty: false },
    contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
  };
}
