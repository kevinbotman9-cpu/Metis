import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { executeAt, DECISION_COUNT } from '@/mocks/fixtures/engine';

/**
 * The performance surface over HTTP.
 *
 * The arithmetic is covered in `packages/ledger`. What is covered here is that
 * the join reaches real recorded outcomes — the thing that had never happened,
 * because `POST /outcomes` wrote to a store nothing read.
 */

const MARCUS = () => {
  const u = store.users.find((x) => x.email === 'marcus.webb@telco.example')!;
  return { authorization: `Bearer metis.${u.id}`, 'content-type': 'application/json' };
};

const call = (path: string[], body?: unknown, method: 'GET' | 'POST' = 'GET') => {
  const req = new Request(`http://localhost/api/${path.join('/')}`, {
    method,
    headers: MARCUS(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const ctx = { params: Promise.resolve({ path }) };
  return method === 'GET' ? GET(req, ctx) : POST(req, ctx);
};

const report = async (query = '') => {
  const res = await call(['performance', `telco-uk${query}`]);
  expect(res.status).toBe(200);
  return (await res.json()) as {
    rows: {
      action: string;
      channel: string;
      flowId: string;
      offered: number;
      acceptances: number;
      acceptanceRate: number | null;
      valueMinor: number | null;
    }[];
    decisions: number;
    offered: number;
    suppressed: number;
    measured: number;
  };
};

/**
 * The first seeded decision that actually offered something.
 *
 * From the corpus the console displays, not the ledger: the ledger starts empty
 * and only holds decisions made at runtime, while `POST /outcomes` accepts
 * either — a seeded decision is real to this console even though it predates
 * the ledger.
 */
function anOfferedDecision() {
  // The first decision that produced a winner. Executed as we go rather than
  // taken from an array of all 10,400, which no longer exists — see
  // `executeAt` in mocks/fixtures/engine.ts.
  let found: ReturnType<typeof executeAt> | undefined;
  for (let i = 0; i < DECISION_COUNT && !found; i++) {
    const made = executeAt(i);
    if (made.trace.decision.winner) found = made;
  }
  if (!found) throw new Error('no seeded decision offered anything');
  return {
    decisionId: found.trace.id,
    winner: found.trace.decision.winner!,
    // A row is a bucket of (action, channel, flow), not of action alone. With
    // 251 offers across four flows the same action wins on several channels,
    // so matching on the action picks whichever bucket sorted first — which
    // was a different decision's, and reported nothing.
    channel: found.trace.decision.channel,
    flowId: found.trace.decision.artifactId,
  };
}

describe('the report reaches real outcomes', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('counts the seeded decisions and separates suppression', () => {
    // Guard on the fixture: a report over nothing would make every assertion
    // below pass vacuously.
    return report().then((r) => {
      expect(r.decisions).toBeGreaterThan(100);
      expect(r.offered + r.suppressed).toBe(r.decisions);
      expect(r.rows.length).toBeGreaterThan(0);
    });
  });

  it('reports nothing measured until an outcome is recorded', () => {
    // The state the platform has actually been in since the ledger existed:
    // decisions recorded, outcomes captured by nobody.
    return report().then((r) => expect(r.measured).toBe(0));
  });

  it('picks up an outcome once one is recorded', async () => {
    const decision = anOfferedDecision();

    const recorded = await call(
      ['outcomes', 'telco-uk', decision.decisionId],
      { type: 'acceptance', occurredAt: '2026-09-05T10:00:00.000Z', valueMinor: 4500 },
      'POST'
    );
    expect(recorded.status, await recorded.clone().text()).toBeLessThan(300);

    const r = await report();
    expect(r.measured).toBe(1);

    const row = r.rows.find(
      (x) => x.action === decision.winner && x.channel === decision.channel && x.flowId === decision.flowId
    )!;
    expect(row, 'no row for the bucket this decision belongs to').toBeDefined();
    expect(row.acceptances).toBe(1);
    expect(row.valueMinor).toBe(4500);
  });

  it('does not let a repeated outcome inflate the count', async () => {
    // A channel that fires twice must report once, or a rate can exceed 1.
    const decision = anOfferedDecision();
    for (const at of ['2026-09-05T10:00:00.000Z', '2026-09-05T10:00:01.000Z']) {
      await call(
        ['outcomes', 'telco-uk', decision.decisionId],
        { type: 'acceptance', occurredAt: at },
        'POST'
      );
    }

    const r = await report();
    const row = r.rows.find(
      (x) => x.action === decision.winner && x.channel === decision.channel && x.flowId === decision.flowId
    )!;
    expect(row, 'no row for the bucket this decision belongs to').toBeDefined();
    expect(row.acceptances).toBe(1);
    expect(row.acceptanceRate).toBeLessThanOrEqual(1);
  });

  it('leaves a rate empty rather than reporting zero', async () => {
    // Every row here has been offered and none measured, so every rate must be
    // null — the distinction the whole surface is built on.
    const r = await report();
    expect(r.rows.every((x) => x.acceptanceRate === null || x.acceptanceRate === 0)).toBe(true);
    expect(r.rows.every((x) => x.valueMinor === null)).toBe(true);
  });

  it('filters by channel without changing what a row means', async () => {
    const all = await report();
    const web = await report('?channel=web');

    expect(web.decisions).toBeLessThanOrEqual(all.decisions);
    expect(web.rows.every((x) => x.offered > 0)).toBe(true);
  });
});
