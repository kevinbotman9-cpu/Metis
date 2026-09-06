import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Idempotency, against the console's `executeDecision`.
 *
 * The JVM service is held to the same statements in its own suite. Both serve
 * one spec, so both have to behave the same way — a retry that lands on either
 * must resolve identically, and `docs/conformance/service-cases.json` carries
 * the request hash so the two agree on what "the same request" means.
 */

const ARTIFACT = 'next-best-action';

const body = (over: Record<string, unknown> = {}) => ({
  artifactId: ARTIFACT,
  request: {
    tenantId: 'telco-uk',
    customerId: 'cust_idem',
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

test.describe('idempotent decisions', () => {
  test('a repeated key returns the original decision rather than a new one', async ({
    request,
  }) => {
    const key = `k-${Date.now()}-repeat`;

    const first = await decide(request, body({ idempotencyKey: key }));
    expect(first.status).toBe(200);

    const second = await decide(request, body({ idempotencyKey: key }));
    expect(second.status).toBe(200);

    // The same id, not merely the same hash. A re-execution that happened to
    // agree would pass a hash check and still be a second decision — and one
    // catalogue edit between the calls is all it takes for it not to agree.
    expect(second.json.id).toBe(first.json.id);
    expect(second.json.chainHash).toBe(first.json.chainHash);
  });

  test('a repeated key with a different request is refused, not answered', async ({ request }) => {
    const key = `k-${Date.now()}-conflict`;
    await decide(request, body({ idempotencyKey: key }));

    const conflict = await decide(
      request,
      body({ idempotencyKey: key, customerId: 'someone_else' })
    );

    // Answering this with the stored decision would hand the caller a decision
    // about a different customer while looking entirely successful.
    expect(conflict.status).toBe(409);
    expect(conflict.json.error).toBe('idempotency_conflict');
    expect(conflict.json.message).toMatch(/new key/);
  });

  test('the key is scoped per tenant', async ({ request }) => {
    // Two tenants choosing the same token is normal. If keys were global, the
    // second would either get the first tenant's decision or a spurious 409.
    const key = `k-${Date.now()}-tenant`;
    const a = await decide(request, body({ idempotencyKey: key }));
    const b = await decide(request, body({ idempotencyKey: key, tenantId: 'telco-ie' }));

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.json.id).not.toBe(a.json.id);
  });

  test('reordering the input is the same request, not a conflict', async ({ request }) => {
    // The canonicaliser sorts keys, so a client serialising its input in a
    // different order is asking the same question. Without that, a retry from
    // a different runtime would 409.
    const key = `k-${Date.now()}-order`;
    const first = await decide(
      request,
      body({ idempotencyKey: key, input: { a: 1, b: 2, customer: { age: 41 } } })
    );
    const second = await decide(
      request,
      body({ idempotencyKey: key, input: { customer: { age: 41 }, b: 2, a: 1 } })
    );

    expect(second.status).toBe(200);
    expect(second.json.id).toBe(first.json.id);
  });

  test('a different correlation id is still the same request', async ({ request }) => {
    // It differs on every retry by design. If it counted, no retry would ever
    // match — which is the failure this whole mechanism exists to prevent.
    const key = `k-${Date.now()}-correlation`;
    const first = await decide(
      request,
      body({ idempotencyKey: key, correlationId: 'trace-a' })
    );
    const second = await decide(
      request,
      body({ idempotencyKey: key, correlationId: 'trace-b' })
    );

    expect(second.status).toBe(200);
    expect(second.json.id).toBe(first.json.id);
  });

  test('no key means no idempotency, and that is allowed', async ({ request }) => {
    // Not every caller needs it, and requiring a key would break every existing
    // integration. Two identical requests without one are two decisions — which
    // is correct: nothing was claimed about them being the same attempt.
    const a = await decide(request, body());
    const b = await decide(request, body());
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.json.chainHash).toBe(b.json.chainHash);
  });
});
