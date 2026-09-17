import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET, POST } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { fibreAddressScenario } from '@/mocks/fixtures/arbitration-scenario';

/**
 * Frequency caps count the platform's own contacts. ADR-021.
 *
 * Until this, a cap was held to whatever the caller typed into
 * `contactHistory`: the storefront reported how often it had shown something
 * and nothing else, so `cpol_web_daily` — three decisioned web slots a day —
 * was enforced on a number the platform never checked. These drive the
 * console's development API as a channel does and read what it decided.
 */

const TENANT = 'telco-us';
const PLACEMENT = fibreAddressScenario.placementKey;

function headers() {
  const marcus = store.users.find((u) => u.email === 'marcus.webb@telco.example')!;
  return { authorization: `Bearer metis.${marcus.id}`, 'content-type': 'application/json' };
}

type Trace = {
  winner: string | null;
  eliminations: { denials: { key: string; code: string; ruleId: string | null }[] }[];
  contactsRead?: { status: string; channel: string; withinPeriod?: { day: number; week: number; month: number } };
};

/**
 * A decision, as a channel asks for one, a minute after the one before. Fixed
 * times rather than the clock: a delivery is stamped at its decision's
 * `occurredAt` (G-151), so nothing here depends on when the test runs.
 */
async function decide(customerId: string, step: number, over: Record<string, unknown> = {}) {
  // The fibre-address scenario: every gate passes, so a decision offers
  // something unless a cap or consent holds it back.
  const request = {
    ...fibreAddressScenario.request,
    customerId,
    occurredAt: new Date(Date.parse('2026-09-10T12:00:00.000Z') + step * 60_000).toISOString(),
    ...over,
  };
  const res = await POST(
    new Request(`http://localhost/api/placements/${TENANT}/${PLACEMENT}/decisions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ request }),
    }),
    { params: Promise.resolve({ path: ['placements', TENANT, PLACEMENT, 'decisions'] }) }
  );
  expect(res.status, await res.clone().text()).toBe(200);
  const { decisionId } = (await res.json()) as { decisionId: string };
  const traced = await GET(new Request(`http://localhost/api/decisions/${decisionId}/trace`, { headers: headers() }), {
    params: Promise.resolve({ path: ['decisions', decisionId, 'trace'] }),
  });
  expect(traced.status).toBe(200);
  return { decisionId, request, trace: (await traced.json()) as Trace };
}

const denials = (t: Trace) => t.eliminations.flatMap((s) => s.denials);

describe('a cap counts the platform’s own contacts', () => {
  beforeEach(async () => {
    await resetStore();
    await store.ledgerReady;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the ledger for a decision a cap applies to, and records a read of nothing as a read', async () => {
    const { trace } = await decide('cust_caps_first', 0);
    expect(trace.contactsRead).toEqual({ status: 'read', channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } });
    expect(trace.winner).not.toBeNull();
  });

  it('holds the fourth decision of the day to the three before it', async () => {
    // cpol_web_daily: at most three decisioned web slots a day. Each of these
    // offered something and was dispatched, so each is a contact.
    for (let i = 0; i < 3; i++) {
      const { trace } = await decide('cust_caps_fourth', i);
      expect(trace.winner, `decision ${i + 1} offered nothing`).not.toBeNull();
      expect(trace.contactsRead?.withinPeriod?.day).toBe(i);
    }
    const { trace } = await decide('cust_caps_fourth', 3);
    expect(trace.contactsRead?.withinPeriod).toEqual({ day: 3, week: 3, month: 3 });
    expect(trace.winner).toBeNull();
    expect(new Set(denials(trace).map((d) => `${d.code}:${d.ruleId}`))).toEqual(
      new Set(['FREQUENCY_CAP_BREACHED:cpol_web_daily'])
    );
  });

  it('adds the caller’s counts to its own, and never lets a caller lower them', async () => {
    for (let i = 0; i < 2; i++) await decide('cust_caps_added', i);
    // Two in the ledger and one reported by the caller: three, and breached.
    const reported = await decide('cust_caps_added', 2, {
      contactHistory: { channel: 'web', withinPeriod: { day: 1, week: 1, month: 1 } },
    });
    expect(reported.trace.winner).toBeNull();

    // A body cannot supply the platform's read: it is ignored, and the ledger's
    // two contacts are what was recorded.
    const forged = await decide('cust_caps_added', 3, {
      contactsRead: { status: 'read', channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
    });
    expect(forged.trace.contactsRead?.withinPeriod?.day).toBe(2);
  });

  it('does not count a decision that offered nothing: nothing was handed over', async () => {
    const withheld = await decide('cust_caps_nothing', 0, {
      consent: { marketing: false, profiling: true, thirdParty: false },
    });
    expect(withheld.trace.winner).toBeNull();
    const next = await decide('cust_caps_nothing', 1);
    expect(next.trace.contactsRead?.withinPeriod?.day).toBe(0);
  });

  it('holds back what a cap covers when the ledger cannot be read, naming the cap, and never reads it as zero', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(store.ledger, 'contactsFor').mockRejectedValue(new Error('statement timeout'));

    const { trace } = await decide('cust_caps_unreadable', 0);
    expect(trace.contactsRead).toEqual({ status: 'unavailable', channel: 'web' });
    expect(trace.winner).toBeNull();
    expect(new Set(denials(trace).map((d) => `${d.code}:${d.ruleId}`))).toEqual(
      new Set(['CONTACT_HISTORY_UNAVAILABLE:cpol_web_daily'])
    );
    expect(logged.mock.calls.flat().join(' ')).toMatch(/contact history unavailable.*statement timeout/);
  });

  it('does not read on POST /api/decisions, which the JVM service is held to exactly', async () => {
    // ADR-021 §7, G-150: the operation `contract.spec.ts` compares hash for
    // hash with the JVM service stays on the caller's counts until both
    // services read. Three contacts are on the ledger, and it still offers.
    for (let i = 0; i < 3; i++) await decide('cust_caps_engine_op', i);
    const res = await POST(
      new Request('http://localhost/api/decisions', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          artifactId: 'next-best-action',
          request: {
            ...fibreAddressScenario.request,
            customerId: 'cust_caps_engine_op',
            occurredAt: '2026-09-10T12:10:00.000Z',
          },
        }),
      }),
      { params: Promise.resolve({ path: ['decisions'] }) }
    );
    expect(res.status, await res.clone().text()).toBeLessThan(300);
    const record = (await res.json()) as { decision?: Trace & { contactsRead?: unknown }; contactsRead?: unknown; winner?: string | null };
    const decision = record.decision ?? (record as Trace & { contactsRead?: unknown });
    expect('contactsRead' in decision).toBe(false);
    expect(decision.winner).not.toBeNull();
  });

  it('stamps a delivery with when its decision happened, so a backdated decision counts in its own window', async () => {
    // G-151. Stamped by the wall clock, a decision dated two days back left its
    // contact "today", where the next decision two days back never saw it.
    const past = '2026-01-10T09:00:00.000Z';
    const first = await decide('cust_caps_backdated', 0, { occurredAt: past });
    const [delivery] = await store.ledger.deliveriesFor(TENANT, first.decisionId);
    expect(delivery.at).toBe(past);

    const next = await decide('cust_caps_backdated', 1, { occurredAt: '2026-01-10T10:00:00.000Z' });
    expect(next.trace.contactsRead?.withinPeriod?.day).toBe(1);
  });

  // Replay from the recorded counts is held in `packages/runtime/tests`: a
  // channel's decision cannot be replayed here at all, because its
  // connector-resolved inputs are not kept (G-009).
});

