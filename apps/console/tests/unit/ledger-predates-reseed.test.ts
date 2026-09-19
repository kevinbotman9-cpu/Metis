import { describe, it, expect, vi } from 'vitest';

/**
 * A console pointed at a ledger written before the reseed says so — the
 * reseed's guard, in its smallest form, asked for by the product owner on
 * 2026-09-18.
 *
 * A durable development ledger (`metis_dev`) holds decisions somebody made by
 * clicking, recorded before decisions recorded their slate and where each value
 * came from. Every reader here would otherwise throw on a missing slate, and
 * the screen would show a 500 that says nothing about why or what to do. It
 * answers 409 with the record that is stale and the reset that clears it.
 */

describe('a ledger written before the reseed', () => {
  it('is refused on the screens that read it, with the way out', async () => {
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('metis.dev.store')];
    vi.stubEnv('METIS_DATABASE_URL', '');
    vi.stubEnv('METIS_SEED_LEDGER', '');
    const route = await import('@/app/api/[...path]/route');
    const { store } = await import('@/mocks/store');
    await store.ledgerReady;

    // One decision as the ledger held it before the reseed: no slate, no slot
    // count, and `sourceBindings` where `fieldOrigins` is now.
    const { executeAt } = await import('@/mocks/fixtures/engine');
    const record = structuredClone(executeAt(0).trace);
    const d = record.decision as unknown as Record<string, unknown>;
    delete d.slate;
    delete d.slotCount;
    delete d.fieldOrigins;
    d.sourceBindings = [];
    await store.ledger.record(store.ledger.entryFor(record, 'telco-us'));

    const marcus = store.users.find((u) => u.email === 'marcus.webb@telco.example')!;
    const res = await route.GET(
      new Request('http://localhost/api/performance/telco-us', { headers: { authorization: `Bearer metis.${marcus.id}` } }),
      { params: Promise.resolve({ path: ['performance', 'telco-us'] }) }
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; code: string; message: string };
    expect(body.code).toBe('RECORD_PREDATES_RESEED');
    expect(body.message).toContain(record.id);
    expect(body.message).toMatch(/npm run seed:ledger -- --reset --tenant telco-us/);
  });
});
