import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { DecisionLedger, InMemoryLedgerStore } from '@metis/ledger';
import { json, wrongAnswers, type Json } from './helpers';
import { createService } from '../src/server';
import { loadTenants, type LoadResult } from '../src/state';
import { readCases, readBundle, seedFromBundle, CASES_PATH } from './seed';

/**
 * The decision service as a caller meets it: over HTTP, from real stores.
 * ADR-016 §1.
 *
 * Stores are the in-memory implementations of the same interfaces Postgres
 * implements, loaded from `docs/conformance/service-bundle.json` — the console's
 * own flows and catalogue — so what is exercised is the product's data, not a
 * catalogue written to make the service look right.
 */

const TOKEN = 'test-credential';

let server: Server;
let base: string;
let loaded: LoadResult | null = null;
let tenantId: string;
let ledgerStore: InMemoryLedgerStore;
const bundle = readBundle();
const cases = readCases();

beforeAll(async () => {
  const seeded = await seedFromBundle(bundle);
  tenantId = seeded.tenantId;
  ledgerStore = new InMemoryLedgerStore();
  server = createService({
    token: TOKEN,
    loaded: () => loaded,
    ledger: new DecisionLedger(ledgerStore),
    gateway: wrongAnswers,
    integrations: 'live',
    dataClass: 'synthetic',
    now: () => '2026-09-14T12:00:00.000Z',
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  loaded = await loadTenants({
    catalogueStore: seeded.catalogueStore,
    registry: seeded.registry,
    environment: 'production',
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (p: string, body: unknown, token: string | null = TOKEN) =>
  fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token === null ? {} : { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });

describe('the decision service', () => {
  it('reports what it loaded, without a credential', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.status).toBe('ok');
    expect(body.engine).toBe('typescript');
    expect(body.integrations).toBe('live');
    const tenant = (body.tenants as { tenantId: string; artifacts: string[]; catalogueSnapshotHash: string }[]).find((t) => t.tenantId === tenantId)!;
    expect(tenant.artifacts).toEqual(bundle.artifacts.map((a) => a.id).sort());
    // The hash every decision this tenant makes will carry, and the one the
    // TypeScript engine stamped on the cases. If this differs, the stores did
    // not hold the catalogue faithfully and every decision would diverge.
    expect(tenant.catalogueSnapshotHash).toBe(
      JSON.parse(readFileSync(CASES_PATH, 'utf8')).cases[0].expected.catalogueSnapshotHash
    );
  });

  it('refuses a decision without the credential, and with the wrong one', async () => {
    const c = cases[0];
    expect((await post('/api/decisions', { artifactId: c.artifactId, request: c.request }, null)).status).toBe(401);
    expect((await post('/api/decisions', { artifactId: c.artifactId, request: c.request }, 'not-it')).status).toBe(401);
  });

  it('makes a decision, records it, and answers a retry with the same one', async () => {
    const c = cases.find((x) => x.expected.winner !== null)!;
    const request = { ...c.request, idempotencyKey: 'retry-me' };

    const first = await post('/api/decisions', { artifactId: c.artifactId, request });
    expect(first.status).toBe(200);
    const decided = await json(first);
    expect(decided.chainHash).toBe(c.expected.chainHash);
    expect(decided.replayed).toBe(false);
    expect(await ledgerStore.get(tenantId, decided.id as string)).toBeDefined();

    const retry = await post('/api/decisions', { artifactId: c.artifactId, request });
    const replayed: Json = await json(retry);
    expect(replayed.id).toBe(decided.id);
    expect(replayed.replayed).toBe(true);
  });

  it('stamps a placement’s delivery with when the decision happened, not the clock', async () => {
    // G-151. The hand-over is part of the same request, so it happened when the
    // decision did. The clock here says 2026-09-14; the case says otherwise, and
    // a cap counting contacts back from a decision's time needs the case's.
    const c = cases.find((x) => x.expected.winner !== null)!;
    const res = await post(`/api/placements/${tenantId}/${c.request.placement}/decisions`, {
      request: { ...c.request, idempotencyKey: 'stamped-at-decision' },
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const { decisionId } = await json(res);
    const [delivery] = await ledgerStore.deliveriesFor(tenantId, decisionId as string);
    expect(delivery.at).toBe(c.request.occurredAt);
    expect(delivery.at).not.toBe('2026-09-14T12:00:00.000Z');
  });

  it('refuses a key reused for a different request', async () => {
    const [a, b] = cases;
    await post('/api/decisions', { artifactId: a.artifactId, request: { ...a.request, idempotencyKey: 'one-key' } });
    const clash = await post('/api/decisions', { artifactId: b.artifactId, request: { ...b.request, idempotencyKey: 'one-key' } });
    expect(clash.status).toBe(409);
  });

  it('says which thing it does not know: tenant, flow, placement', async () => {
    const c = cases[0];
    expect((await post('/api/decisions', { artifactId: c.artifactId, request: { ...c.request, tenantId: 'nobody' } })).status).toBe(404);
    expect((await post('/api/decisions', { artifactId: 'no-such-flow', request: c.request })).status).toBe(404);
    expect((await post(`/api/placements/${tenantId}/no_such_slot/decisions`, { request: c.request })).status).toBe(404);
  });

  it('refuses a request missing what a decision needs', async () => {
    const c = cases[0];
    const { occurredAt: _omitted, ...rest } = c.request;
    expect((await post('/api/decisions', { artifactId: c.artifactId, request: rest })).status).toBe(400);
  });
});
