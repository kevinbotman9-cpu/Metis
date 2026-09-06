import { describe, it, expect } from 'vitest';
import {
  requestHash,
  classify,
  InMemoryIdempotencyStore,
  IdempotencyConflict,
  type IdempotencyRecord,
} from '../src/idempotency';
import type { DecisionRequest } from '../src/deterministic/types';

const base: DecisionRequest = {
  tenantId: 'telco-uk',
  customerId: 'cust_1',
  channel: 'email',
  placement: 'weekly_offers',
  occurredAt: '2026-06-01T12:00:00.000Z',
  input: { age: 41, tenureMonths: 30 },
  consent: { marketing: true, profiling: true, thirdParty: false },
};

const record = (over: Partial<IdempotencyRecord> = {}): IdempotencyRecord => ({
  tenantId: 'telco-uk',
  key: 'k1',
  requestHash: 'aaaa',
  decisionId: 'dec_1',
  storedAt: '2026-06-01T12:00:00.000Z',
  ...over,
});

describe('the request hash', () => {
  it('is stable across key order in the input', () => {
    // The canonicaliser sorts keys, so a client that serialises its input in a
    // different order is still making the same request. Without this, a retry
    // from a different language runtime would look like a new question.
    const a = requestHash(base);
    const b = requestHash({ ...base, input: { tenureMonths: 30, age: 41 } });
    expect(a).toBe(b);
  });

  it('ignores the idempotency key, which is the token and not the question', () => {
    expect(requestHash({ ...base, idempotencyKey: 'k1' })).toBe(requestHash(base));
  });

  it('ignores the correlation id, which differs on every retry', () => {
    // Including it would make each retry hash differently, so every retry
    // would be a fresh request — the exact failure this prevents.
    expect(requestHash({ ...base, correlationId: 'trace-abc' })).toBe(
      requestHash({ ...base, correlationId: 'trace-xyz' })
    );
  });

  it('treats an omitted optional and an explicit null as the same request', () => {
    // A caller switching between the two forms is not asking a new question,
    // and would otherwise see spurious conflicts.
    expect(requestHash(base)).toBe(
      requestHash({ ...base, contactHistory: undefined })
    );
  });

  it('changes when anything the decision depends on changes', () => {
    const original = requestHash(base);
    const variants: Partial<DecisionRequest>[] = [
      { customerId: 'cust_2' },
      { channel: 'sms' },
      { placement: 'app_inbox' },
      { occurredAt: '2026-06-01T12:00:01.000Z' },
      { input: { age: 42, tenureMonths: 30 } },
      { consent: { marketing: false, profiling: true, thirdParty: false } },
      { contactHistory: { channel: 'email', withinPeriod: { month: 1 } } },
      { tenantId: 'telco-ie' },
    ];
    for (const v of variants) {
      expect(requestHash({ ...base, ...v }), JSON.stringify(v)).not.toBe(original);
    }
  });
});

describe('classify', () => {
  it('is fresh when nothing was stored', () => {
    expect(classify(undefined, 'aaaa')).toEqual({ kind: 'fresh' });
  });

  it('is a replay when the key and the question both match', () => {
    const r = record();
    expect(classify(r, 'aaaa')).toEqual({ kind: 'replay', record: r });
  });

  it('is a conflict when the key matches and the question does not', () => {
    // The caller reused a token for a different question. Returning the stored
    // answer would hand them a decision about someone else's customer while
    // looking entirely successful.
    const r = record();
    const out = classify(r, 'bbbb');
    expect(out.kind).toBe('conflict');
    if (out.kind === 'conflict') {
      expect(out.record).toBe(r);
      expect(out.attemptedHash).toBe('bbbb');
    }
  });
});

describe('the in-memory store', () => {
  it('scopes keys per tenant', async () => {
    // Two tenants choosing the same key is normal, not a collision.
    const s = new InMemoryIdempotencyStore();
    await s.put(record({ tenantId: 'a', decisionId: 'dec_a' }));
    await s.put(record({ tenantId: 'b', decisionId: 'dec_b' }));
    expect((await s.get('a', 'k1'))?.decisionId).toBe('dec_a');
    expect((await s.get('b', 'k1'))?.decisionId).toBe('dec_b');
  });

  it('cannot be confused by a tenant id containing the separator', async () => {
    // The key is length-prefixed rather than joined on ':' precisely so that
    // tenant 'a:b' with key 'c' cannot read tenant 'a' key 'b:c'.
    const s = new InMemoryIdempotencyStore();
    await s.put(record({ tenantId: 'a:b', key: 'c', decisionId: 'dec_1' }));
    expect(await s.get('a', 'b:c')).toBeUndefined();
    expect((await s.get('a:b', 'c'))?.decisionId).toBe('dec_1');
  });

  it('lets the first write win, and tells the loser', async () => {
    // Under a race two callers can both classify as fresh and both execute.
    // Only one decision id can be the answer for that key, and it has to be
    // the one already returned to whoever got there first.
    const s = new InMemoryIdempotencyStore();
    const first = await s.put(record({ decisionId: 'dec_first' }));
    const second = await s.put(record({ decisionId: 'dec_second' }));
    expect(first.decisionId).toBe('dec_first');
    expect(second.decisionId).toBe('dec_first');
    expect(s.size).toBe(1);
  });

  it('forgets everything on clear, for the test reset endpoint', async () => {
    const s = new InMemoryIdempotencyStore();
    await s.put(record());
    s.clear();
    expect(await s.get('telco-uk', 'k1')).toBeUndefined();
  });
});

describe('the conflict error', () => {
  it('carries a 409 and says what to do about it', () => {
    const e = new IdempotencyConflict('k1', 'a'.repeat(64), 'b'.repeat(64));
    expect(e.status).toBe(409);
    // Both hashes, truncated: enough to tell two requests apart in a log
    // without pasting 128 hex characters into an error message.
    expect(e.message).toContain('aaaaaaaaaaaaaaaa');
    expect(e.message).toContain('bbbbbbbbbbbbbbbb');
    expect(e.message).toMatch(/new key/);
  });
});
