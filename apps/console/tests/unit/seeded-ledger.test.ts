import { describe, it, expect, beforeAll, vi } from 'vitest';
import { DecisionLedger, InMemoryLedgerStore, type OutcomeEvent } from '@metis/ledger';
import { decisions } from '@/mocks/fixtures/decisions';
import { placements } from '@/mocks/fixtures/catalogue';
import { seededOutcomesFor } from '@/mocks/fixtures/outcomes';
import { outcomesFor, deliversOnChannel } from '@/mocks/fixtures/synthetic-customers';
import { deliveryFor } from '@/mocks/delivery-state';
import { seededHistory, seedLedger, type SeededHistory } from '@/mocks/seed-ledger';
import index from '@/mocks/fixtures/decision-index.json';

/**
 * The seeded ledger is the committed corpus, row for row — ADR-018 §4, §5, §6.
 *
 * Everything here has to hold before slice 3 deletes the index and the
 * projection: once they are gone there is nothing left to compare against, and
 * a gate that picked different decisions but landed on the same total would be
 * invisible.
 *
 * The history is built once for the file, through the same per-process memo the
 * store uses, so the store's seed below restores it instead of executing again.
 * Executing all 10,400 decisions takes about twelve seconds on a development
 * machine — the cost the index existed to avoid — so this file carries its own
 * budget rather than the five-second default a loaded machine cannot meet
 * (G-133).
 */

const BUDGET_MS = 180_000;
const TENANT = 'telco-us';
let history: SeededHistory;

beforeAll(() => {
  history = seededHistory().history;
}, BUDGET_MS);

const placementByKey = new Map(placements.map((p) => [p.key, p]));
const eventKey = (e: OutcomeEvent) => [e.decisionId, e.type, e.occurredAt, e.valueMinor ?? 'null'].join('|');

describe('the seed writes the tenant it was asked for', () => {
  it('writes every row under the named tenant, and none under the generator default', async () => {
    // Found on 2026-09-16, exercising `npm run seed:ledger` against a real
    // database: the command planned against `--tenant` but the seed wrote the
    // generator's own tenant, so a second run seeded again instead of leaving
    // what it found, and a reset refused because of rows it had just written
    // itself. Nothing in the suite looked at which tenant the rows landed
    // under, because every caller until the command used the default.
    const ledger = new DecisionLedger(new InMemoryLedgerStore());
    const report = await seedLedger(ledger, { count: 20, tenantId: 'a-named-tenant' });

    expect(report.decisions).toBe(20);
    expect(await ledger.count({ tenantId: 'a-named-tenant' })).toBe(20);
    expect(await ledger.count({ tenantId: TENANT })).toBe(0);

    // The rows joined to the decisions carry it too: a delivery or an outcome
    // written under a different tenant is a row the screens never see.
    const [entry] = await ledger.query({ tenantId: 'a-named-tenant' });
    expect((await ledger.deliveriesFor('a-named-tenant', entry.record.id)).length).toBe(1);
  });
});

describe('the seeded decisions are the committed index', () => {
  it('holds every row of the index, and nothing else', () => {
    expect(history.entries.length).toBe(decisions.length);
    expect(new Set(history.entries.map((e) => e.decisionId))).toEqual(new Set(decisions.map((d) => d.id)));
  });

  it('agrees with the index on every column the index holds, chain hash included, for every decision', () => {
    const rows = (index as unknown as { rows: unknown[][] }).rows;
    const byId = new Map(history.entries.map((e) => [e.decisionId, e]));
    const differ: string[] = [];
    for (const row of rows) {
      const entry = byId.get(row[1] as string);
      if (!entry) {
        differ.push(`${row[1]}: missing`);
        continue;
      }
      const d = entry.record.decision;
      const seeded = [d.artifactId, d.artifactVersion, d.customerRef, d.occurredAt, d.channel, d.placement, d.winner, d.winnerOfferId, d.candidateKeys.length, entry.chainHash];
      const indexed = [row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11]];
      if (JSON.stringify(seeded) !== JSON.stringify(indexed) || entry.occurredAt !== row[5]) differ.push(row[1] as string);
    }
    expect(differ.slice(0, 5), `${differ.length} rows where the seeded ledger and the index disagree`).toEqual([]);
  });
});

describe('the delivery gate picks the same decisions as the channel rule it replaces', () => {
  it('agrees decision by decision, not only in total', () => {
    // The projection asks "does any placement on this channel deliver"; the
    // seed asks "what did this decision's own placement record". Two gates can
    // land on one total from different decisions. ADR-018 §5.5.
    const disagree = decisions
      .map((d) => ({
        id: d.id,
        placement: d.placement,
        channelRule: deliversOnChannel(d.channel),
        gate: deliveryFor(placementByKey.get(d.placement)).state === 'dispatched',
      }))
      .filter((x) => x.channelRule !== x.gate);
    expect(disagree.slice(0, 5), `${disagree.length} decisions where the two gates differ`).toEqual([]);
  });

  it('records a delivery for every seeded decision, dispatched on exactly the decisions the channel rule names', () => {
    expect(history.deliveries.length).toBe(decisions.length);
    const dispatched = new Set(history.deliveries.filter((a) => a.state === 'dispatched').map((a) => a.decisionId));
    const byChannelRule = new Set(decisions.filter((d) => deliversOnChannel(d.channel)).map((d) => d.id));
    expect(dispatched.size).toBe(byChannelRule.size);
    expect([...dispatched].filter((id) => !byChannelRule.has(id)).slice(0, 5)).toEqual([]);
  });
});

describe('the seeded outcomes are exactly the projection', () => {
  it('writes 1,654 events across 1,228 decisions, by type', () => {
    const byType: Record<string, number> = {};
    for (const e of history.outcomes) byType[e.type] = (byType[e.type] ?? 0) + 1;
    expect(history.outcomes.length).toBe(1654);
    expect(new Set(history.outcomes.map((e) => e.decisionId)).size).toBe(1228);
    expect(byType).toEqual({ impression: 1228, click: 278, rejection: 80, acceptance: 44, conversion: 24 });
  });

  it('gives every decision the projection’s events, decision by decision', () => {
    const seeded = new Map<string, string[]>();
    for (const e of history.outcomes) seeded.set(e.decisionId, [...(seeded.get(e.decisionId) ?? []), eventKey(e)]);
    const differ: string[] = [];
    for (const d of decisions) {
      const projected = seededOutcomesFor(d).map(eventKey);
      if (JSON.stringify(seeded.get(d.id) ?? []) !== JSON.stringify(projected)) differ.push(d.id);
    }
    expect(differ.slice(0, 5), `${differ.length} decisions whose outcomes differ`).toEqual([]);
  });

  it('is one model under either gate, so the comparison above is of the gate alone', () => {
    for (const d of decisions) {
      expect(outcomesFor(d, { dispatched: deliversOnChannel(d.channel) })).toEqual(seededOutcomesFor(d));
    }
  });
});

// ---------------------------------------------------------------------------
// The store, and the reports read from it
// ---------------------------------------------------------------------------

type Route = typeof import('@/app/api/[...path]/route');
type Store = typeof import('@/mocks/store');

async function boot(seed: boolean): Promise<{ route: Route; store: Store['store']; resetStore: Store['resetStore'] }> {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('metis.dev.store')];
  vi.stubEnv('METIS_DATABASE_URL', '');
  vi.stubEnv('METIS_SEED_LEDGER', seed ? '1' : '');
  const route = await import('@/app/api/[...path]/route');
  const { store, resetStore } = await import('@/mocks/store');
  await store.ledgerReady;
  return { route, store, resetStore };
}

async function get(booted: { route: Route; store: Store['store'] }, path: string[]) {
  const marcus = booted.store.users.find((u) => u.email === 'marcus.webb@telco.example')!;
  const req = new Request(`http://localhost/api/${path.join('/')}`, {
    headers: { authorization: `Bearer metis.${marcus.id}` },
  });
  const res = await booted.route.GET(req, { params: Promise.resolve({ path }) });
  expect(res.status, `${path.join('/')}: ${res.status}`).toBe(200);
  return res.json();
}

describe('the in-memory store seeds once per process, and the reports do not count anything twice', () => {
  let seeded: { performance: unknown; outcomes: Map<string, unknown> };

  it('seeds when METIS_SEED_LEDGER is set, and a reset restores the history without executing again', async () => {
    const booted = await boot(true);
    expect(booted.store.ledgerSeed, 'the store did not seed').not.toBeNull();
    expect(booted.store.ledgerSeed).toMatchObject({ decisions: 10_400, deliveries: 10_400, outcomes: 1654 });

    await booted.resetStore();
    expect(booted.store.ledgerSeed).toMatchObject({ decisions: 10_400, deliveries: 10_400, outcomes: 1654, executed: false });
    expect((await booted.store.ledger.query({ tenantId: TENANT })).length).toBe(10_400);

    // Captured here, from the seeded store, for the comparison below.
    const withOutcomes = [...new Set(history.outcomes.map((e) => e.decisionId))];
    seeded = { performance: await get(booted, ['performance', TENANT]), outcomes: new Map() };
    for (const id of withOutcomes) seeded.outcomes.set(id, await get(booted, ['outcomes', TENANT, id]));
  }, BUDGET_MS);

  it('reports performance and outcomes identically with the ledger seeded and without it', async () => {
    // Without the seed, the report reads the projection for the corpus. With
    // it, the same 1,654 events are ledger rows. A report that added the
    // projection to the ledger would count each of them twice, and the
    // performance figures and every outcome list would differ here.
    vi.resetModules();
    const booted = await boot(false);
    expect(booted.store.ledgerSeed).toBeNull();

    expect(seeded.performance).toEqual(await get(booted, ['performance', TENANT]));
    for (const [id, body] of seeded.outcomes) {
      expect((body as { outcomes: unknown }).outcomes, id).toEqual(
        ((await get(booted, ['outcomes', TENANT, id])) as { outcomes: unknown }).outcomes
      );
    }
    vi.unstubAllEnvs();
  }, BUDGET_MS);
});
