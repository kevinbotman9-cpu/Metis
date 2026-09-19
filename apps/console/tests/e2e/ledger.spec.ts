import { test, expect, type APIRequestContext } from '@playwright/test';
import { connectors } from '@/mocks/fixtures/catalogue';

/**
 * The decision ledger, through the console's API.
 *
 * The package has its own behaviour suite run against both stores; this covers
 * the seam — that the endpoints actually reach it, and that the two things
 * Stage 4 left open are now closed.
 */

const TENANT = 'telco-us';

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

  /**
   * Every field the flow's connectors would otherwise supply, read from the
   * connectors rather than written down.
   *
   * Resolution runs before the engine and the caller's fields win, so a request
   * carrying all of them is resolved to itself — which makes the recorded
   * `inputSnapshotHash` reconstructible by the caller. That is the whole
   * condition under which a live decision can be replayed today.
   *
   * This was a hand-written object of nine fields, and it was the wrong nine
   * from the moment the tenant changed: `telco-us` added serviceability,
   * order-book and affinity connectors and dropped a roaming field, so
   * resolution fetched five fields the caller had not supplied, hashed them
   * into the snapshot, and replay reported a difference the caller could not
   * have produced. The list is a fact about the catalogue, so it is derived
   * from the catalogue; the values are arbitrary — replay identity does not
   * depend on them, only on the caller handing back what it sent.
   */
  const RESOLVED = (() => {
    const sample = (type: string): unknown =>
      type === 'number' ? 1 : type === 'boolean' ? true : 'a';
    const root: Record<string, unknown> = {};
    for (const connector of connectors) {
      if (!connector.active) continue;
      for (const binding of connector.provides) {
        const parts = binding.field.split('.');
        let node = root;
        for (const part of parts.slice(0, -1)) {
          node[part] ??= {};
          node = node[part] as Record<string, unknown>;
        }
        node[parts[parts.length - 1]] = sample(binding.type);
      }
    }
    return root as { customer: Record<string, unknown> };
  })();

  test('a decision made now can be replayed, given the inputs back', async ({ request }) => {
    // Replay was seeded-decisions-only: the route looked in the fixture corpus
    // and nowhere else, so a decision the platform had just made was a 404.
    //
    // The reason it needs a body is the interesting half. A record holds
    // `inputSnapshotHash` and never the values, so a trace can be kept for as
    // long as an audit needs without keeping the customer data it was made
    // from. Replaying one is therefore the caller handing the input back, and
    // the engine proving it is the same input.
    // The caller's branches win leaf by leaf, so `age` joins the resolved
    // fields under the same root rather than replacing them.
    const input = { ...RESOLVED, customer: { ...RESOLVED.customer, age: 41 } };
    const made = await decide(request, body({ customerId: 'cust_replay_live', input }));
    expect(made.status).toBe(200);

    const withoutInput = await request.post(`/api/decisions/${made.json.id}/replay`);
    expect(withoutInput.status()).toBe(422);
    expect((await withoutInput.json()).error).toBe('input_required');

    const replayed = await request.post(`/api/decisions/${made.json.id}/replay`, {
      data: { input },
    });
    expect(replayed.status()).toBe(200);
    const result = await replayed.json();
    expect(result.identical).toBe(true);
    expect(result.replayedChainHash).toBe(made.json.chainHash);
    expect(result.diff).toEqual([]);
  });

  test('replaying with the wrong inputs blames the inputs, not the engine', async ({ request }) => {
    const input = { ...RESOLVED, customer: { ...RESOLVED.customer, age: 41 } };
    const made = await decide(request, body({ customerId: 'cust_replay_wrong', input }));

    const replayed = await request.post(`/api/decisions/${made.json.id}/replay`, {
      data: { input: { ...input, customer: { ...input.customer, age: 99 } } },
    });
    expect(replayed.status()).toBe(200);
    const result = await replayed.json();
    expect(result.identical).toBe(false);
    // The distinction A-3 exists to preserve, now reachable through the API:
    // one difference, and it names the snapshot rather than the winner.
    expect(result.diff).toHaveLength(1);
    expect(result.diff[0].path).toBe('$.inputSnapshotHash');
  });

  test('a decision whose fields the platform resolved cannot be replayed by its caller', async ({
    request,
  }) => {
    // The bound worth stating. This request omits the connector-supplied
    // fields, so resolution fetched them and hashed them into the snapshot —
    // and their values are in no store. The caller can hand back everything it
    // sent and still not reconstruct what was hashed.
    const input = { customer: { age: 41 } };
    const made = await decide(request, body({ customerId: 'cust_replay_resolved', input }));

    const replayed = await request.post(`/api/decisions/${made.json.id}/replay`, {
      data: { input },
    });
    const result = await replayed.json();
    expect(result.identical).toBe(false);
    expect(result.diff[0].path).toBe('$.inputSnapshotHash');
  });

  test('the seeded decisions still resolve, so the ledger did not replace them', async ({
    request,
  }) => {
    // Bounded to the corpus: the list is the ledger now, and the newest row
    // is a decision this file made, which would let this test pass without
    // ever touching a seeded one. The corpus ends at 2026-09-04T23:08:35Z.
    const list = await (
      await request.get('/api/decisions/search?limit=1&dateTo=2026-09-05T00:00:00.000Z')
    ).json();
    const id = list.decisions[0].id;
    expect(id, 'no decision came back from inside the seeded corpus').toBeTruthy();
    const res = await request.get(`/api/decisions/${id}/trace`);
    expect(res.status()).toBe(200);
  });

  test.describe('outcomes', () => {
    // covers: recordOutcome
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

    test('name the offer on a decision that showed several, and only one it showed (ADR-020 §4)', async ({ request }) => {
      // An input every offer on the email send qualifies for, so the slate
      // fills: an active broadband customer on DSL, in their allowance, with no
      // move planned. The body's default input qualifies for nothing.
      const made = await decide(
        request,
        body({
          // Fixed, not timestamped: the recorded gateway answers each customer
          // differently, and this one's answers leave three offers qualifying
          // (found by probing the route, 2026-09-18). A timestamped id showed
          // one offer on one run and three on another.
          customerId: 'cust_probe_1',
          slotCount: 3,
          input: {
            customer: {
              age: 41,
              account_status: 'active',
              credit_status: 'pass',
              moving_within_days: 999,
              broadband: { status: 'active', product: 'dsl' },
              ott: { disney: false, netflix: false },
              usage: { pct_of_allowance_3mo_avg: 0.9, months_of_history: 12 },
            },
            context: {},
          },
          consent: { marketing: true, profiling: true, thirdParty: true },
        } as never)
      );
      expect(made.json.decision.slotCount).toBe(3);
      const shown = (made.json.decision.slate as { action: string }[]).map((e) => e.action);
      // Asserted, not skipped: a skip here would let this check stop running
      // the day the request stops showing two, and nobody would see it go.
      expect(shown.length, 'the request must show at least two offers for this check to mean anything').toBeGreaterThanOrEqual(2);

      const post = (data: Record<string, unknown>) =>
        request.post(`/api/outcomes/${TENANT}/${made.json.id}`, {
          data: { type: 'click', occurredAt: '2026-06-01T12:00:09.000Z', ...data } as never,
        });
      const unnamed = await post({});
      expect(unnamed.status()).toBe(422);
      expect((await unnamed.json()).code).toBe('OUTCOME_ACTION_REQUIRED');
      const elsewhere = await post({ action: 'not_an_action_it_showed' });
      expect(elsewhere.status()).toBe(422);
      expect((await elsewhere.json()).code).toBe('OUTCOME_ACTION_NOT_SHOWN');
      const second = await post({ action: shown[1] });
      expect(second.status()).toBe(201);
      expect((await second.json()).action).toBe(shown[1]);
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
