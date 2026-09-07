import { describe, it, expect, beforeEach } from 'vitest';
import {
  recorded,
  listCalls,
  clearCalls,
  captureBody,
  originOf,
  summarise,
  shouldRecord,
  CAPACITY,
  MAX_BODY_BYTES,
} from '../../mocks/call-log';

/**
 * The traffic recorder.
 *
 * The assertion that matters most is the dullest one: wrapping a handler must
 * not consume its body. Every write in the dev API calls `req.json()`, so a
 * recorder that read the request stream would turn all of them into 400s — and
 * it would do it silently, on a code path whose whole job is observing.
 */

const ctx = { params: Promise.resolve({ path: ['decisions'] }) };

const req = (body?: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost:3000/api/decisions?limit=5', {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('the traffic recorder', () => {
  beforeEach(() => clearCalls());

  it('leaves the request body readable by the handler it wraps', async () => {
    // The failure this exists to prevent: recording by reading `req` rather
    // than a clone leaves the handler an empty stream, and every POST in the
    // dev API answers 400 "missing required field".
    let seen: unknown = null;
    const handler = recorded('POST', async (r) => {
      seen = await r.json();
      return Response.json({ ok: true });
    });

    const res = await handler(req({ tenantId: 'telco-uk' }), ctx);

    expect(seen).toEqual({ tenantId: 'telco-uk' });
    expect(res.status).toBe(200);
  });

  it('leaves the response body readable by the caller', async () => {
    // The mirror of the above, and just as quiet: a consumed response body
    // reaches the browser as an empty 200.
    const handler = recorded('GET', async () => Response.json({ offers: [1, 2] }));
    const res = await handler(req(), ctx);

    expect(await res.json()).toEqual({ offers: [1, 2] });
  });

  it('records both halves, the status and the path', async () => {
    const handler = recorded('POST', async () => Response.json({ decisionId: 'dec_a' }, { status: 201 }));
    await handler(req({ customerId: 'cust_0001' }, { referer: 'http://localhost:3000/storefront/' }), ctx);

    const [call] = listCalls();
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/api/decisions');
    expect(call.query).toBe('?limit=5');
    expect(call.status).toBe(201);
    expect(call.request?.json).toEqual({ customerId: 'cust_0001' });
    expect(call.response?.json).toEqual({ decisionId: 'dec_a' });
    expect(call.origin).toBe('storefront');
    // Lifted so a row can link to the trace without the page knowing response shapes.
    expect(call.decisionId).toBe('dec_a');
  });

  it('records a throw rather than losing it, and still rethrows', async () => {
    // A handler that throws is the most interesting call in the log. Swallowing
    // it would turn a crash into a missing row, which reads as "no traffic".
    const handler = recorded('GET', async () => {
      throw new Error('store is not seeded');
    });

    await expect(handler(req(), ctx)).rejects.toThrow('store is not seeded');

    const [call] = listCalls();
    expect(call.status).toBe(500);
    expect(call.error).toBe('store is not seeded');
  });

  it('carries the error code of a refusal so the row reads without expanding', async () => {
    const handler = recorded('POST', async () =>
      Response.json({ error: 'bad_request', message: 'Missing field' }, { status: 400 })
    );
    await handler(req({}), ctx);

    expect(listCalls()[0].error).toBe('bad_request');
    expect(listCalls()[0].status).toBe(400);
  });

  it('evicts rather than growing', async () => {
    const handler = recorded('GET', async () => Response.json({ ok: true }));
    for (let i = 0; i < CAPACITY + 20; i++) await handler(req(), ctx);

    expect(listCalls().length).toBe(CAPACITY);
  });

  it('does not let a noisy caller evict a quiet one', async () => {
    // The defect this replaces, observed on the page: an open console polls its
    // own API constantly, so oldest-first eviction filled the ring with console
    // reads and dropped every storefront call — 250 recorded, 0 decisions among
    // them, on a page whose only job is showing the storefront's decisions.
    const handler = recorded('POST', async () => Response.json({ ok: true }));
    const from = (referer: string) => req({ n: 1 }, { referer });

    await handler(from('http://localhost:3000/storefront/index.html'), ctx);
    for (let i = 0; i < CAPACITY * 2; i++) {
      await handler(from('http://localhost:3000/offers'), ctx);
    }

    const kept = listCalls();
    expect(kept.length).toBe(CAPACITY);
    expect(
      kept.filter((c) => c.origin === 'storefront'),
      'the one storefront call was evicted by console chatter'
    ).toHaveLength(1);
  });

  it('returns newest first', async () => {
    const handler = recorded('POST', async (r) => Response.json(await r.json()));
    await handler(req({ n: 1 }), ctx);
    await handler(req({ n: 2 }), ctx);

    expect(listCalls().map((c) => (c.request?.json as { n: number }).n)).toEqual([2, 1]);
  });

  it('limits without reordering', async () => {
    const handler = recorded('POST', async (r) => Response.json(await r.json()));
    for (const n of [1, 2, 3]) await handler(req({ n }), ctx);

    expect(listCalls(2).map((c) => (c.request?.json as { n: number }).n)).toEqual([3, 2]);
  });
});

describe('the log does not observe itself', () => {
  beforeEach(() => clearCalls());

  it('skips reads of the log', async () => {
    // Found by running it: the traffic page polls every two seconds and each
    // response carries every call recorded so far, so recording the read nests
    // the entire log inside the next one, and the next carries both. Within a
    // minute the ring holds nothing but copies of itself.
    const handler = recorded('GET', async () => Response.json({ calls: [] }));
    const selfRead = new Request('http://localhost:3000/api/inbound-calls?limit=250');

    await handler(selfRead, { params: Promise.resolve({ path: ['inbound-calls'] }) });

    expect(listCalls()).toEqual([]);
  });

  it('still records the clear, which cannot nest', async () => {
    const handler = recorded('POST', async () => Response.json({ cleared: true }));
    const clearReq = new Request('http://localhost:3000/api/inbound-calls/clear', {
      method: 'POST',
    });

    await handler(clearReq, { params: Promise.resolve({ path: ['inbound-calls', 'clear'] }) });

    expect(listCalls()).toHaveLength(1);
    expect(listCalls()[0].path).toBe('/api/inbound-calls/clear');
  });

  it('records everything else', () => {
    expect(shouldRecord('GET', '/api/offers/telco-uk')).toBe(true);
    expect(shouldRecord('POST', '/api/placements/telco-uk/homepage_hero/decisions')).toBe(true);
    expect(shouldRecord('GET', '/api/inbound-calls')).toBe(false);
  });
});

describe('body capture', () => {
  it('parses JSON and reports its size', () => {
    const body = captureBody('{"a":1}');
    expect(body?.json).toEqual({ a: 1 });
    expect(body?.bytes).toBe(7);
    expect(body?.truncated).toBe(false);
  });

  it('keeps a non-JSON body as text instead of dropping it', () => {
    // A proxy's HTML error page is exactly what somebody debugging needs.
    const body = captureBody('<html>502</html>');
    expect(body?.json).toBeNull();
    expect(body?.text).toBe('<html>502</html>');
  });

  it('truncates a large body and says so', () => {
    const big = JSON.stringify({ blob: 'x'.repeat(MAX_BODY_BYTES) });
    const body = captureBody(big);
    expect(body?.truncated).toBe(true);
    expect(body?.bytes).toBe(big.length);
    // The stored side is bounded; the reported size is the real one.
    expect(body!.text!.length).toBe(MAX_BODY_BYTES);
  });

  it('measures bytes, not characters', () => {
    // A body of emoji is longer than it looks, and a cap measured in characters
    // would let through four times what it promised.
    expect(captureBody('"😀"')?.bytes).toBe(6);
  });

  it('treats an absent body as absent, not as empty JSON', () => {
    expect(captureBody(null)).toBeNull();
    expect(captureBody('')).toBeNull();
  });
});

describe('caller attribution', () => {
  it('names the storefront from its referer', () => {
    expect(originOf('http://localhost:3000/storefront/index.html')).toBe('storefront');
  });

  it('names any other page of the console the console', () => {
    expect(originOf('http://localhost:3000/offers/prop_5g_unlimited_24')).toBe('console');
  });

  it('does not guess when there is nothing to go on', () => {
    // curl, a server-side caller, a stripped referer. "Direct" is honest;
    // labelling it "console" would be a fact the header did not support.
    expect(originOf(null)).toBe('unknown');
    expect(originOf('not a url')).toBe('unknown');
  });
});

describe('response summary', () => {
  it('finds a decision id wherever the response puts one', () => {
    expect(summarise(captureBody('{"decisionId":"dec_x","entries":[]}')).decisionId).toBe('dec_x');
  });

  it('reports nothing for a response that carries neither', () => {
    expect(summarise(captureBody('{"offers":[]}'))).toEqual({ decisionId: null, error: null });
    expect(summarise(null)).toEqual({ decisionId: null, error: null });
  });

  it('ignores a non-string in either field rather than rendering an object', () => {
    expect(summarise(captureBody('{"decisionId":{"id":1},"error":42}'))).toEqual({
      decisionId: null,
      error: null,
    });
  });
});
