import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { seedLedger } from '@/mocks/seed-ledger';
import { findCompilation } from '@/mocks/fixtures/compiled';
import { topologicalOrder } from '@metis/runtime';
import type { FlowVolumeReportDto } from '@/lib/api-client';

/**
 * `GET /api/flow-volume/{tenant}` — the canvas's volume overlay. Proposed (G-127).
 *
 * The arithmetic is the ledger's and is tested in `packages/ledger`. These cover
 * what the route decides: which decisions are in the window, which graph and
 * order they are summed over, and what it refuses.
 *
 * They seed a history first: since slice 3 the overlay reads the ledger alone,
 * so a store nobody seeded draws an empty canvas — correctly, and with nothing
 * to assert about.
 */

const FLOW = 'next-best-action';
const HOUR = 3_600_000;

const MARCUS = () => {
  const u = store.users.find((x) => x.email === 'marcus.webb@telco.example')!;
  return { authorization: `Bearer metis.${u.id}` };
};

const get = async (query: string) => {
  const path = ['flow-volume', 'telco-us'];
  const req = new Request(`http://localhost/api/${path.join('/')}${query}`, { headers: MARCUS() });
  return GET(req, { params: Promise.resolve({ path }) });
};

const report = async (query: string) => {
  const res = await get(query);
  expect(res.status).toBe(200);
  return (await res.json()) as FlowVolumeReportDto;
};

/** Every decision the ledger holds for this flow, newest first. */
const ledgerRows = () =>
  store.ledger
    .query({ tenantId: 'telco-us', limit: 20000 })
    .then((rows) => rows.filter((e) => e.flowId === FLOW));

/** The decisions a window should hold, counted without the route. */
const expectedInWindow = async (to: string, hours: number) => {
  const start = Date.parse(to) - hours * HOUR;
  return (await ledgerRows()).filter((e) => Date.parse(e.occurredAt) > start && e.occurredAt <= to)
    .length;
};

describe('GET /api/flow-volume/{tenant}', () => {
  beforeEach(async () => {
    await resetStore();
    await store.ledgerReady;
    // Two thousand: the default window is 24 hours ending at the newest
    // decision, and the corpus spreads 10,400 over two years, so a smaller
    // history can leave that window holding one decision or none.
    await seedLedger(store.ledger, { count: 2000 });
  });

  it('refuses a request that names no flow, or a flow nothing compiled', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?flowId=no-such-flow')).status).toBe(404);
  });

  it('refuses a window that is not a whole number of hours from 1 to 8760', async () => {
    for (const hours of ['0', '1.5', '9000', 'soon']) {
      expect((await get(`?flowId=${FLOW}&hours=${hours}`)).status, `hours=${hours}`).toBe(400);
    }
  });

  it('defaults to 24 hours ending at the newest decision recorded, not at the clock', async () => {
    const r = await report(`?flowId=${FLOW}`);
    const newest = (await ledgerRows()).reduce((m, e) => (e.occurredAt > m ? e.occurredAt : m), '');

    expect(r.hours).toBe(24);
    expect(r.to! >= newest).toBe(true);
    expect(Date.parse(r.to!) - Date.parse(r.from!)).toBeLessThanOrEqual(24 * HOUR);
    expect(r.decisions).toBeGreaterThan(0);
    expect(r.decisions).toBe(await expectedInWindow(r.to!, 24));
  });

  it('sums over the flow’s graph in the order the engine visits it', async () => {
    const r = await report(`?flowId=${FLOW}`);
    const artifact = findCompilation(FLOW)!.result.artifact!;
    expect(r.nodes.map((n) => n.nodeId)).toEqual(topologicalOrder(artifact).map((n) => n.id));
    expect(r.edges.map((e) => [e.from, e.to])).toEqual(artifact.edges.map((e) => [e.from, e.to]));
  });

  it('is a decomposition: every node’s arrivals are its removals and survivors, and every edge carries its source’s survivors', async () => {
    const r = await report(`?flowId=${FLOW}`);
    expect(r.unplaced).toBe(0);
    for (const n of r.nodes) expect(n.entered - n.removed, n.nodeId).toBe(n.survived);
    expect(r.nodes[0].entered).toBe(r.entered);
    expect(r.nodes[r.nodes.length - 1].survived).toBe(r.offered);
    const survived = new Map(r.nodes.map((n) => [n.nodeId, n.survived]));
    for (const e of r.edges) expect(e.volume, `${e.from} → ${e.to}`).toBe(survived.get(e.from));
  });

  it('widens with the window', async () => {
    const day = await report(`?flowId=${FLOW}&hours=24`);
    const twoDays = await report(`?flowId=${FLOW}&hours=48`);
    expect(twoDays.decisions).toBeGreaterThanOrEqual(day.decisions);
    expect(twoDays.decisions).toBe(await expectedInWindow(twoDays.to!, 48));
  });
});
