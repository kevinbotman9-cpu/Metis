import { describe, it, expect, beforeAll } from 'vitest';
import { GET } from '@/app/api/[...path]/route';
import { store } from '@/mocks/store';
import { decisions } from '@/mocks/fixtures/decisions';
import { buildSeededHistory } from '@/mocks/seed-ledger';

/**
 * Decision search reads the ledger — ADR-018 clause 1, slice 2b.
 *
 * Until this slice the list read the committed index and never the ledger, so a
 * decision the platform actually made could be opened by id and did not appear
 * in `/decisions`. These hold the move: the same rows, the same totals, and a
 * customer matched exactly through the subject hash rather than by a substring
 * of the identifier the ledger stores in clear (G-068).
 *
 * A history of 300 decisions, not all 10,400: these assert the query, and the
 * seeded ledger's equality with the corpus is `seeded-ledger.test.ts`'s subject.
 */

const TENANT = 'telco-us';
const HISTORY = 300;

async function search(query: Record<string, string> = {}) {
  const marcus = store.users.find((u) => u.email === 'marcus.webb@telco.example')!;
  const qs = new URLSearchParams(query).toString();
  const req = new Request(`http://localhost/api/decisions/search${qs ? `?${qs}` : ''}`, {
    headers: { authorization: `Bearer metis.${marcus.id}` },
  });
  const res = await GET(req, { params: Promise.resolve({ path: ['decisions', 'search'] }) });
  expect(res.status).toBe(200);
  return res.json() as Promise<{
    decisions: { id: string; customerId: string; channel: string; winner: string | null }[];
    total: number;
    provenance: { source: string };
  }>;
}

describe('search falls back to the committed index while the ledger is empty', () => {
  it('answers from the index, as it did before the ledger held anything', async () => {
    await store.ledgerReady;
    expect(await store.ledger.count({ tenantId: TENANT }), 'this file expects an unseeded store').toBe(0);
    const body = await search({ limit: '25' });
    expect(body.total).toBe(decisions.length);
    expect(body.decisions.length).toBe(25);
    expect(body.provenance.source).toBe('synthetic');
  });
});

describe('search reads the ledger once it holds decisions', () => {
  let history: ReturnType<typeof buildSeededHistory>;

  beforeAll(async () => {
    await store.ledgerReady;
    // Decisions only. Outcomes are the report's subject, not search's, and
    // writing them here would put the corpus's events in the ledger while the
    // projection still reads them — the double count slice 2a corrected.
    history = buildSeededHistory(HISTORY);
    for (const entry of history.entries) await store.ledger.record(entry);
  }, 60_000);

  const rows = () => history.entries.map((e) => e.record.decision);

  it('returns what the ledger holds, newest first, with the unpaged total', async () => {
    const body = (await search({ limit: '10' })) as unknown as {
      decisions: { id: string; timestamp: string }[];
      total: number;
      provenance: { source: string };
    };
    expect(body.total).toBe(HISTORY);
    expect(body.decisions.length).toBe(10);

    // Newest first, and the page is the newest ten of the whole history — not
    // the first ten the store happened to hold.
    const times = body.decisions.map((d) => d.timestamp);
    expect(times).toEqual([...times].sort((a, b) => b.localeCompare(a)));
    const newest = rows()
      .map((d) => d.occurredAt)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 10);
    expect(times).toEqual(newest);
    expect(body.provenance.source).toBe('synthetic');
  });

  it('filters by channel and by the action that won', async () => {
    const channel = rows()[0].channel;
    const expected = rows().filter((d) => d.channel === channel).length;
    expect((await search({ channel, limit: '5000' })).total).toBe(expected);

    const winner = rows().find((d) => d.winner)!.winner!;
    const wins = rows().filter((d) => d.winner === winner).length;
    expect((await search({ action: winner, limit: '5000' })).total).toBe(wins);
  });

  it('separates a decision that offered something from one that did not', async () => {
    const offered = rows().filter((d) => d.winner !== null).length;
    expect((await search({ outcome: 'offered', limit: '5000' })).total).toBe(offered);
    expect((await search({ outcome: 'suppressed', limit: '5000' })).total).toBe(HISTORY - offered);
  });

  it('matches a customer exactly, through the subject hash, and not by part of an id', async () => {
    const customerId = rows()[0].customerRef;
    const theirs = rows().filter((d) => d.customerRef === customerId).length;
    const body = await search({ customerId, limit: '5000' });
    expect(body.total).toBe(theirs);
    expect(body.decisions.every((d) => d.customerId === customerId)).toBe(true);

    // The behaviour this slice changes, and the reason: a substring search would
    // have to read the raw reference out of the stored record (G-068).
    expect((await search({ customerId: customerId.slice(0, 8), limit: '5000' })).total).toBe(0);
  });

  it('bounds a window by the decision time', async () => {
    const sorted = [...rows()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const from = sorted[Math.floor(sorted.length / 2)].occurredAt;
    const expected = sorted.filter((d) => d.occurredAt >= from).length;
    expect((await search({ dateFrom: from, limit: '5000' })).total).toBe(expected);
  });
});
