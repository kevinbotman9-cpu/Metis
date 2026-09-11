import { describe, it, expect } from 'vitest';
import { POST, GET } from '@/app/api/[...path]/route';
import { placements } from '@/mocks/fixtures/catalogue';

/**
 * A placement is asked for a slate, and gets one decision's worth.
 *
 * The properties worth holding are the ones that would let a slate quietly
 * disagree with the decision behind it: that a multi-slot placement returns
 * more than one action, that a single-slot one returns exactly the winner
 * `POST /decisions` would have given, that both slates come from *one*
 * decision, and that a caller naming a slot the platform does not have is
 * refused rather than guessed at.
 */

const call = (path: string[], body?: unknown, method: 'GET' | 'POST' = 'POST') => {
  const url = `http://localhost/api/${path.join('/')}`;
  const req = new Request(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const ctx = { params: Promise.resolve({ path }) };
  return method === 'GET' ? GET(req, ctx) : POST(req, ctx);
};

const request = (over: Record<string, unknown> = {}) => ({
  request: {
    tenantId: 'telco-uk',
    customerId: 'cust_slate_demo',
    channel: 'web',
    occurredAt: '2026-06-01T12:00:00.000Z',
    // Complete, because the suitability policies fail closed on a missing
    // field — correctly — and a thin request would test the empty slate rather
    // than the slate.
    input: {
      customer: {
        age: 41,
        credit_status: 'pass',
        account_status: 'active',
        current_plan: 'standard',
        bill_to_income_ratio: 0.018,
        arrears_count_12mo: 0,
        credit_band: 'A',
        address: { fibre_available: true },
        usage: { pct_of_allowance_3mo_avg: 0.94, months_of_history: 14 },
        contract: { days_to_end: 40 },
        events: { pac_requested_within_days: 999 },
        device: { residual_value: 32000 },
      },
      context: { offer: { monthly_delta: -500 } },
    },
    consent: { marketing: true, profiling: true, thirdParty: false },
    ...over,
  },
});

const decide = async (key: string, over: Record<string, unknown> = {}) => {
  const res = await call(['placements', 'telco-uk', key, 'decisions'], request(over));
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

describe('GET /api/placements/{tenantId}', () => {
  it('serves the configured slots', async () => {
    const res = await call(['placements', 'telco-uk'], undefined, 'GET');
    const body = (await res.json()) as { placements: { key: string; slotCount: number }[] };
    expect(res.status).toBe(200);
    expect(body.placements.map((p) => p.key)).toEqual(placements.map((p) => p.key));
    // The grid is the reason this exists. A configuration where every slot
    // holds one action would pass every test below while proving nothing.
    expect(body.placements.find((p) => p.key === 'homepage_grid')?.slotCount).toBeGreaterThan(1);
  });
});

describe('POST /api/placements/{tenantId}/{key}/decisions', () => {
  it('fills a three-slot placement with three ranked actions', async () => {
    const { status, body } = await decide('homepage_grid');
    expect(status).toBe(200);

    const entries = body.entries as { rank: number; action: string; offerId: string }[];
    expect(entries.length).toBeGreaterThan(1);
    expect(entries.map((e) => e.rank)).toEqual(entries.map((_, i) => i + 1));

    // Each slot holds a different action. A slate that repeated the winner
    // three times would satisfy "returns three" and be useless.
    expect(new Set(entries.map((e) => e.action)).size).toBe(entries.length);

    // And every action resolves to an offer, or a site has nothing to render.
    for (const e of entries) expect(e.offerId).toMatch(/^prop_/);
  });

  it('gives a single-slot placement exactly what POST /decisions would', async () => {
    const slate = await decide('account_dashboard_hero');
    const direct = await call(['decisions'], {
      artifactId: 'next-best-action',
      request: { ...request().request, placement: 'account_dashboard_hero' },
    });
    const decision = (await direct.json()) as { decision: { winner: string } };

    expect((slate.body.entries as { action: string }[])).toHaveLength(1);
    expect((slate.body.entries as { action: string }[])[0].action).toBe(decision.decision.winner);
  });

  it('answers from one decision, and names it', async () => {
    // The trace behind slot 3 has to be the trace behind slot 1. Three slots
    // filled by three decisions would be three chances to disagree, and no
    // single record would explain the page.
    const { body } = await decide('homepage_grid');
    expect(body.decisionId).toMatch(/^dec_/);
    expect(body.chainHash).toHaveLength(64);
    expect(body.rankedCount as unknown as number).toBeGreaterThanOrEqual(
      (body.entries as unknown[]).length
    );
  });

  it('states the slots it could not fill rather than padding them', async () => {
    const { body } = await decide('homepage_grid');
    const filled = (body.entries as unknown[]).length;
    expect(filled + (body.unfilled as unknown as number)).toBe(
      body.slotCount as unknown as number
    );
  });

  it('refuses a placement it does not have, and says what it does have', async () => {
    const { status, body } = await decide('checkout_footer');
    expect(status).toBe(404);
    expect(body.message as unknown as string).toContain('homepage_grid');
  });

  it('refuses an inactive placement', async () => {
    // Configured but switched off. Deciding for it anyway would make `active`
    // decoration.
    const off = placements.find((p) => !p.decidable);
    expect(off, 'fixture has no inactive placement to test with').toBeDefined();
    const { status } = await decide(off!.key);
    expect(status).toBe(404);
  });

  it('refuses a body that names a different placement from the path', async () => {
    // Two answers to one question. Picking either quietly would put an offer in
    // a slot the caller did not ask about.
    const { status, body } = await decide('homepage_grid', { placement: 'homepage_hero' });
    expect(status).toBe(400);
    expect(body.message as unknown as string).toContain('homepage_hero');
  });

  describe('every web slot honours consent and frequency', () => {
    /**
     * The gap this closes: `inbound-web-offers` was four filter nodes and no
     * constraint, and consent and frequency are enforced at constraint nodes
     * only. So a website could post `marketing: false` and a full week of
     * contacts, the engine would read both, and offer anyway.
     *
     * Asserted per placement rather than once, because the failure was per
     * flow — two web slots were governed and two were not, and nothing said
     * which was which.
     */
    const WEB_SLOTS = placements.filter((p) => p.channel === 'web' && p.decidable).map((p) => p.key);

    it('has web slots to check', () => {
      // A guard on the guard: an empty list would make every case below pass
      // by iterating nothing.
      expect(WEB_SLOTS.length).toBeGreaterThan(1);
    });

    for (const key of WEB_SLOTS) {
      it(`${key} offers nothing when marketing consent is withheld`, async () => {
        const { status, body } = await decide(key, {
          consent: { marketing: false, profiling: false, thirdParty: false },
        });
        expect(status).toBe(200);
        expect(body.entries as unknown as unknown[]).toHaveLength(0);
      });

      it(`${key} offers nothing once the weekly cap is spent`, async () => {
        // Three a week, tenant-wide and channel-agnostic — the cap that covers
        // these offers. Two is under it, three is not, so the pair proves the
        // boundary is being read rather than the request being rejected for
        // some unrelated reason.
        const under = await decide(key, {
          contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 2, month: 0 } },
        });
        const over = await decide(key, {
          contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 3, month: 0 } },
        });

        expect((under.body.entries as unknown as unknown[]).length).toBeGreaterThan(0);
        expect(over.body.entries as unknown as unknown[]).toHaveLength(0);
      });
    }
  });

  it('will not default occurredAt to now', async () => {
    const res = await call(['placements', 'telco-uk', 'homepage_grid', 'decisions'], {
      request: { ...request().request, occurredAt: undefined },
    });
    expect(res.status).toBe(400);
  });
});
