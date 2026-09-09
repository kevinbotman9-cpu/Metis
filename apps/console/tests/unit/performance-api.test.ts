import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { executeAt, DECISION_COUNT } from '@/mocks/fixtures/engine';
import { decisions } from '../../mocks/fixtures/decisions';
import { seededOutcomesFor } from '../../mocks/fixtures/outcomes';

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
      measured: number;
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
  // The first decision that produced a winner **and has no seeded outcome of
  // its own**. Since ADR-008 phase two the corpus reports back on roughly six
  // decisions in ten, and picking one of those would have this test assert
  // that recording an outcome against an already-measured decision raises the
  // measured count — which it must not, because the count is of decisions and
  // not of events.
  let found: ReturnType<typeof executeAt> | undefined;
  for (let i = 0; i < DECISION_COUNT && !found; i++) {
    const made = executeAt(i);
    if (!made.trace.decision.winner) continue;
    const row = decisions.find((d) => d.id === made.trace.id);
    if (row && seededOutcomesFor(row).length > 0) continue;
    found = made;
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

  it('measures a minority of what it offered, so both denominators stay visible', async () => {
    // Until ADR-008 phase two this asserted `measured === 0`, which was the
    // state the platform had been in since the ledger existed: decisions
    // recorded, outcomes captured by nobody. The seeded corpus now reports
    // back on some of them, and the property worth holding is the one the
    // report is designed around — `measured` is smaller than `offered`, so a
    // rate over the wrong denominator is visibly wrong rather than plausible.
    const r = await report();
    expect(r.measured).toBeGreaterThan(0);
    expect(r.measured).toBeLessThan(r.offered);
  });

  it('picks up an outcome once one is recorded', async () => {
    const decision = anOfferedDecision();
    const before = await report();

    const recorded = await call(
      ['outcomes', 'telco-uk', decision.decisionId],
      { type: 'acceptance', occurredAt: '2026-09-05T10:00:00.000Z', valueMinor: 4500 },
      'POST'
    );
    expect(recorded.status, await recorded.clone().text()).toBeLessThan(300);

    const r = await report();
    // A delta, not an absolute: the seeded corpus already measures thousands,
    // and asserting a total here would be asserting the fixture rather than
    // the endpoint.
    expect(r.measured).toBe(before.measured + 1);

    const row = r.rows.find(
      (x) => x.action === decision.winner && x.channel === decision.channel && x.flowId === decision.flowId
    )!;
    expect(row, 'no row for the bucket this decision belongs to').toBeDefined();

    // Deltas against the same bucket before the write. The bucket is (action,
    // channel, flow) and the seeded corpus may already have measured other
    // decisions in it, so an absolute here would be asserting the fixture.
    const was = before.rows.find(
      (x) =>
        x.action === decision.winner &&
        x.channel === decision.channel &&
        x.flowId === decision.flowId
    );
    expect(row.acceptances).toBe((was?.acceptances ?? 0) + 1);
    expect(row.valueMinor).toBe((was?.valueMinor ?? 0) + 4500);
  });

  it('does not let a repeated outcome inflate the count', async () => {
    // A channel that fires twice must report once, or a rate can exceed 1.
    const decision = anOfferedDecision();
    const before = await report();
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
    const was = before.rows.find(
      (x) =>
        x.action === decision.winner &&
        x.channel === decision.channel &&
        x.flowId === decision.flowId
    );
    // Two events, one decision: the count moves by one, which is the whole
    // property. A delta because the seeded corpus has already measured other
    // decisions in this bucket.
    expect(row.acceptances).toBe((was?.acceptances ?? 0) + 1);
    expect(row.acceptanceRate).toBeLessThanOrEqual(1);
  });

  it('leaves a rate empty rather than reporting zero, on rows nobody reported on', async () => {
    // The distinction the whole surface is built on: a row with no outcomes has
    // no rate, not a rate of zero. Asserted on the rows that are genuinely
    // unmeasured now that the seeded corpus measures some of them — which is a
    // stronger test than the old one, because it holds while both kinds of row
    // are on screen together.
    const r = await report();
    const unmeasured = r.rows.filter((x) => x.measured === 0);
    expect(unmeasured.length, 'no unmeasured rows left to check').toBeGreaterThan(0);
    expect(unmeasured.every((x) => x.acceptanceRate === null)).toBe(true);
    expect(unmeasured.every((x) => x.valueMinor === null)).toBe(true);

    // And the converse, which the old assertion could not make: a measured row
    // reports a real rate.
    const measured = r.rows.filter((x) => x.measured > 0);
    expect(measured.length).toBeGreaterThan(0);
    expect(measured.every((x) => x.acceptanceRate !== null)).toBe(true);
  });

  it('filters by channel without changing what a row means', async () => {
    const all = await report();
    const web = await report('?channel=web');

    expect(web.decisions).toBeLessThanOrEqual(all.decisions);
    expect(web.rows.every((x) => x.offered > 0)).toBe(true);
  });
});
