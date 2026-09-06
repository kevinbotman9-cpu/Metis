import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * The decision ledger, through the console's API.
 *
 * The package has its own behaviour suite run against both stores; this covers
 * the seam — that the endpoints actually reach it, and that the two things
 * Stage 4 left open are now closed.
 */

const TENANT = 'telco-uk';

const body = (over: Record<string, unknown> = {}) => ({
  artifactId: 'next-best-action',
  request: {
    tenantId: TENANT,
    customerId: 'cust_ledger',
    channel: 'email',
    placement: 'weekly_offers_send',
    occurredAt: '2026-06-01T12:00:00.000Z',
    input: { customer: { age: 41 } },
    consent: { marketing: true, profiling: true, thirdParty: false },
    ...over,
  },
});

async function decide(api: APIRequestContext, payload: unknown) {
  const res = await api.post('/api/decisions', { data: payload as never });
  return { status: res.status(), json: await res.json().catch(() => null) };
}

test.describe('the decision ledger', () => {
  test('a decision made now can be fetched afterwards', async ({ request }) => {
    // Before the ledger, POST /decisions returned an id that this endpoint
    // then said did not exist: the seeded decisions were findable and real
    // ones were not.
    const made = await decide(request, body({ customerId: `c-${Date.now()}` }));
    expect(made.status).toBe(200);

    const res = await request.get(`/api/decisions/${made.json.id}/trace`);
    expect(res.status()).toBe(200);
    const trace = await res.json();
    expect(trace.chainHash).toBe(made.json.chainHash);
  });

  test('the seeded decisions still resolve, so the ledger did not replace them', async ({
    request,
  }) => {
    const list = await (await request.get('/api/decisions/search?limit=1')).json();
    const id = list.decisions[0].id;
    const res = await request.get(`/api/decisions/${id}/trace`);
    expect(res.status()).toBe(200);
  });

  test.describe('outcomes', () => {
    test('attach to a decision and come back in the order they arrived', async ({ request }) => {
      const made = await decide(request, body({ customerId: `c-out-${Date.now()}` }));
      const id = made.json.id;

      for (const [type, at, value] of [
        ['impression', '2026-06-01T12:00:01.000Z', null],
        ['click', '2026-06-01T12:00:09.000Z', null],
        ['conversion', '2026-06-01T12:04:00.000Z', 3500],
      ] as const) {
        const res = await request.post(`/api/outcomes/${TENANT}/${id}`, {
          data: { type, occurredAt: at, valueMinor: value } as never,
        });
        expect(res.status(), type).toBe(201);
      }

      const out = await (await request.get(`/api/outcomes/${TENANT}/${id}`)).json();
      expect(out.outcomes.map((o: { type: string }) => o.type)).toEqual([
        'impression',
        'click',
        'conversion',
      ]);
      // Null, not zero: a click is not a conversion worth nothing.
      expect(out.outcomes[0].valueMinor).toBeNull();
      expect(out.outcomes[2].valueMinor).toBe(3500);
    });

    test('are refused for a decision nobody made', async ({ request }) => {
      // An orphan row measures nothing, and is found years later by whoever
      // tries to compute uplift.
      const res = await request.post(`/api/outcomes/${TENANT}/dec_does_not_exist`, {
        data: { type: 'click', occurredAt: '2026-06-01T12:00:00.000Z' } as never,
      });
      expect(res.status()).toBe(404);
    });

    test('require an explicit occurredAt, never the clock', async ({ request }) => {
      const made = await decide(request, body({ customerId: `c-clock-${Date.now()}` }));
      const res = await request.post(`/api/outcomes/${TENANT}/${made.json.id}`, {
        data: { type: 'click' } as never,
      });
      expect(res.status()).toBe(400);
    });
  });

  test('idempotency still holds now that it runs through the ledger', async ({ request }) => {
    // The rule did not change; the storage behind it did. Re-asserted here
    // because a refactor that quietly dropped the key lookup would otherwise
    // look like a passing suite.
    const key = `led-${Date.now()}`;
    const first = await decide(request, body({ idempotencyKey: key }));
    const second = await decide(request, body({ idempotencyKey: key }));
    expect(second.json.id).toBe(first.json.id);

    const conflict = await decide(
      request,
      body({ idempotencyKey: key, customerId: 'someone_else' })
    );
    expect(conflict.status).toBe(409);
  });
});
