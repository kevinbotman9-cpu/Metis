import { describe, it, expect, beforeAll, vi } from 'vitest';
import { DecisionLedger, InMemoryLedgerStore, type OutcomeEvent } from '@metis/ledger';
import { placements } from '@/mocks/fixtures/catalogue';
import { executeAt, DECISION_COUNT } from '@/mocks/fixtures/engine';
import { rowOf } from '@/mocks/seed-ledger';
import { outcomesFor, deliversOnChannel } from '@/mocks/fixtures/synthetic-customers';
import { deliveryFor } from '@/mocks/delivery-state';
import { seededHistory, seedLedger, type SeededHistory } from '@/mocks/seed-ledger';

/**
 * The seeded ledger is the generator's own output, decision for decision —
 * ADR-018 §4, §5, §6.
 *
 * Until slice 3 this compared the ledger against the committed index, because
 * the index was what the screens read. The index has been deleted and the
 * comparison is against the generator, which is what the index was built from:
 * the ledger holds the same 10,400 decisions, the same chain hashes and the
 * same 1,654 outcome events, or this file fails.
 *
 * The figures below are the ones the deletion was gated on. ADR-018 §6 required
 * each report computed both ways and equal before the index came out;
 * `ledger-report-equality.test.ts` did that on the whole corpus and was deleted
 * with the index it read, so what it agreed is pinned here.
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

/**
 * The generator's decisions, in the console's flat shape.
 *
 * `executeAt` is memoised and the history above has already run all 10,400, so
 * this costs a loop rather than an execution.
 */
const generated = Array.from({ length: DECISION_COUNT }, (_, i) => {
  const { trace } = executeAt(i);
  return {
    id: trace.id,
    channel: trace.decision.channel,
    placement: trace.decision.placement,
    winner: trace.decision.winner,
    /** The engine's own record, which is what the ledger stores. */
    trace,
    /** The flat row the model judges, the same projection the seed uses. */
    row: rowOf(trace, TENANT),
  };
});
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

describe('the seeded decisions are the generator’s decisions', () => {
  it('holds every decision the generator produced, and nothing else', () => {
    expect(history.entries.length).toBe(DECISION_COUNT);
    expect(new Set(history.entries.map((e) => e.decisionId))).toEqual(new Set(generated.map((d) => d.id)));
  });

  it('agrees with the generator on every field a screen reads, chain hash included, for every decision', () => {
    const byId = new Map(history.entries.map((e) => [e.decisionId, e]));
    const differ: string[] = [];
    for (const g of generated) {
      const entry = byId.get(g.id);
      if (!entry) {
        differ.push(`${g.id}: missing`);
        continue;
      }
      const seeded = entry.record.decision;
      const made = g.trace.decision;
      const fields = ['artifactId', 'artifactVersion', 'customerRef', 'occurredAt', 'channel', 'placement', 'winner', 'winnerOfferId'] as const;
      const same =
        fields.every((f) => seeded[f] === made[f]) &&
        seeded.candidateKeys.length === made.candidateKeys.length &&
        entry.chainHash === g.trace.chainHash &&
        entry.occurredAt === made.occurredAt;
      if (!same) differ.push(g.id);
    }
    expect(differ.slice(0, 5), `${differ.length} decisions where the seeded ledger and the generator disagree`).toEqual([]);
  });
});

describe('the delivery gate picks the same decisions as the channel rule it replaces', () => {
  it('agrees decision by decision, not only in total', () => {
    // The projection asks "does any placement on this channel deliver"; the
    // seed asks "what did this decision's own placement record". Two gates can
    // land on one total from different decisions. ADR-018 §5.5.
    const disagree = generated
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
    expect(history.deliveries.length).toBe(DECISION_COUNT);
    const dispatched = new Set(history.deliveries.filter((a) => a.state === 'dispatched').map((a) => a.decisionId));
    const byChannelRule = new Set(generated.filter((d) => deliversOnChannel(d.channel)).map((d) => d.id));
    expect(dispatched.size).toBe(byChannelRule.size);
    expect([...dispatched].filter((id) => !byChannelRule.has(id)).slice(0, 5)).toEqual([]);
  });
});

describe('the seeded outcomes are exactly what the model says', () => {
  it('writes 1,654 events across 1,228 decisions, by type', () => {
    const byType: Record<string, number> = {};
    for (const e of history.outcomes) byType[e.type] = (byType[e.type] ?? 0) + 1;
    expect(history.outcomes.length).toBe(1654);
    expect(new Set(history.outcomes.map((e) => e.decisionId)).size).toBe(1228);
    expect(byType).toEqual({ impression: 1228, click: 278, rejection: 80, acceptance: 44, conversion: 24 });
  });

  it('gives every decision the model’s events under the channel rule, decision by decision', () => {
    // The ledger's events come from the model under the *delivery record's*
    // gate; this compares them against the model under the *channel rule*, the
    // gate the deleted projection used. Two gates can produce one total from
    // different decisions (ADR-018 §5.5), so the comparison is per decision.
    const seeded = new Map<string, string[]>();
    for (const e of history.outcomes) seeded.set(e.decisionId, [...(seeded.get(e.decisionId) ?? []), eventKey(e)]);
    const differ: string[] = [];
    for (const d of generated) {
      const underChannelRule = outcomesFor(d.row, { dispatched: deliversOnChannel(d.channel) }).map(eventKey);
      if (JSON.stringify(seeded.get(d.id) ?? []) !== JSON.stringify(underChannelRule)) differ.push(d.id);
    }
    expect(differ.slice(0, 5), `${differ.length} decisions whose outcomes differ`).toEqual([]);
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

describe('the in-memory store seeds once per process, and the reports read it alone', () => {
  let seeded: {
    performance: Record<string, unknown>;
    funnel: Record<string, unknown>;
    volume: Record<string, unknown>;
    outcomes: Map<string, unknown>;
  };

  it('seeds when METIS_SEED_LEDGER is set, and a reset restores the history without executing again', async () => {
    const booted = await boot(true);
    expect(booted.store.ledgerSeed, 'the store did not seed').not.toBeNull();
    expect(booted.store.ledgerSeed).toMatchObject({ decisions: 10_400, deliveries: 10_400, outcomes: 1654 });

    await booted.resetStore();
    expect(booted.store.ledgerSeed).toMatchObject({ decisions: 10_400, deliveries: 10_400, outcomes: 1654, executed: false });
    expect((await booted.store.ledger.query({ tenantId: TENANT })).length).toBe(10_400);

    // Captured here, from the seeded store, for the assertions below.
    const withOutcomes = [...new Set(history.outcomes.map((e) => e.decisionId))];
    seeded = {
      performance: await get(booted, ['performance', TENANT]),
      funnel: await get(booted, ['policy-funnel', TENANT]),
      volume: await get(booted, ['flow-volume', TENANT, '?flowId=next-best-action&hours=8760']),
      outcomes: new Map(),
    };
    for (const id of withOutcomes) seeded.outcomes.set(id, await get(booted, ['outcomes', TENANT, id]));
  }, BUDGET_MS);

  it('reports the figures the deletion was gated on', () => {
    // ADR-018 §6 required each report computed both ways — the ledger, and the
    // committed index with its outcome projection — and equal, before the
    // index could be deleted. `ledger-report-equality.test.ts` did that over
    // the whole corpus, every flow, both windows and all 1,228 decisions that
    // have outcomes, and was deleted with the index it read. These are the
    // figures the two agreed on, so a later change moves them here rather than
    // quietly.
    expect(seeded.performance).toMatchObject({
      decisions: 10_400,
      offered: 4_688,
      suppressed: 5_712,
      // Only web delivers, so it is the only channel anything can be seen on.
      deliverable: 1_686,
      measured: 1_228,
      acted: 278,
    });
    // Why the 5,712 offered nothing, each counted once at the stage that removed
    // its last candidate. Added 2026-09-17; they sum to `suppressed`.
    const suppressedBy = seeded.performance.suppressedBy as { stage: string; decisions: number }[];
    expect(suppressedBy.map(({ stage, decisions }) => [stage, decisions])).toEqual([
      ['relevance', 4_320],
      ['consent', 810],
      ['eligibility', 326],
      ['frequency', 256],
    ]);
    expect(seeded.performance.channels).toEqual([
      { channel: 'web', delivers: true, decisions: 3_499, offered: 1_686, deliverable: 1_686, seen: 1_228, acted: 278 },
      { channel: 'email', delivers: false, decisions: 3_466, offered: 1_394, deliverable: 0, seen: 0, acted: 0 },
      { channel: 'sms', delivers: false, decisions: 3_435, offered: 1_608, deliverable: 0, seen: 0, acted: 0 },
    ]);
    expect(seeded.performance.arms).toEqual([
      { experimentKey: 'hero_copy', arm: 'control', holdout: true, offered: 2_362, measured: 624, acceptances: 28, acceptanceRate: 28 / 624, valueMinor: 156_917 },
      { experimentKey: 'hero_copy', arm: 'variant', holdout: false, offered: 2_326, measured: 604, acceptances: 16, acceptanceRate: 16 / 604, valueMinor: 70_992 },
    ]);
    expect(seeded.performance.provenance).toEqual({
      source: 'synthetic',
      syntheticCount: 10_400,
      recordedCount: 0,
      // The tenant the report was asked for, not a name typed into the note.
      note: expect.stringContaining('Synthetic, for tenant telco-us.'),
    });
  });

  it('reports the funnel and the volume the deletion was gated on', () => {
    // Both read the ledger's records now, whose eliminations the index carried
    // as an encoded `removals` column. Five candidates enter per decision.
    expect(seeded.funnel).toMatchObject({
      decisions: 10_400,
      entered: 52_000,
      offered: 4_688,
      // Every removal lands in a stage: a decision's candidates are accounted
      // for or the cascade is lying about where they went.
      unaccounted: 0,
    });
    expect(
      (seeded.funnel.stages as { id: string; removed: number; asked: boolean }[]).map((s) => [
        s.id,
        s.removed,
        s.asked,
      ])
    ).toEqual([
      ['not_live', 0, true],
      ['eligibility', 17_672, true],
      ['relevance', 23_775, true],
      // Nothing in this flow asks about suitability, which the stage says
      // rather than reporting a zero that looks like a pass.
      ['suitability', 0, false],
      ['consent', 1_499, true],
      ['frequency', 468, true],
      ['not_ranked', 3_898, true],
    ]);

    expect(seeded.volume).toMatchObject({
      flowId: 'next-best-action',
      hours: 8_760,
      decisions: 6_754,
      entered: 33_770,
      offered: 3_055,
      // Nothing was removed at a step the compiled flow does not hold.
      unplaced: 0,
    });
  });

  it('reports nothing at all on a console that never seeded, rather than a corpus its ledger does not hold', async () => {
    // The honest empty. Until slice 3 an unseeded console answered from the
    // committed index and reported 10,400 decisions it could not show a trace
    // for from its own history; now the report and the ledger agree, including
    // when the answer is zero.
    vi.resetModules();
    const booted = await boot(false);
    expect(booted.store.ledgerSeed).toBeNull();

    expect(await get(booted, ['performance', TENANT])).toMatchObject({
      decisions: 0,
      offered: 0,
      measured: 0,
    });
    expect(await get(booted, ['policy-funnel', TENANT])).toMatchObject({ decisions: 0, entered: 0, offered: 0 });
    const search = (await get(booted, ['decisions', 'search'])) as { decisions: unknown[]; total: number };
    expect(search).toMatchObject({ total: 0 });
    expect(search.decisions).toEqual([]);
    vi.unstubAllEnvs();
  }, BUDGET_MS);
});
