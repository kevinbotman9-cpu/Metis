import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { DecisionRecord } from '@metis/runtime';
import { DecisionLedger, subjectHash, type LedgerStore } from '../src/ledger';
import { LedgerError } from '../src/types';

/**
 * One behaviour suite, run against every store.
 *
 * The ledger's rules live in `DecisionLedger`; the store only persists. Running
 * the same assertions against in-memory and PostgreSQL is what makes that
 * claim checkable — if durable storage changed a behaviour, this says which
 * one, rather than the two drifting until someone notices in production.
 */

const T = 'telco-us';
const AT = '2026-06-01T12:00:00.000Z';

export function decisionRecord(over: {
  id?: string;
  chainHash?: string;
  customerRef?: string;
  occurredAt?: string;
  artifactId?: string;
  channel?: string;
  winner?: string | null;
  winnerOfferId?: string | null;
} = {}): DecisionRecord {
  const id = over.id ?? 'dec_0000000000000001';
  return {
    id,
    chainHash: over.chainHash ?? `${id}_hash`.padEnd(64, '0'),
    decision: {
      tenantId: T,
      artifactId: over.artifactId ?? 'next-best-action',
      artifactVersion: '1.0.0',
      customerRef: over.customerRef ?? 'cust_1',
      occurredAt: over.occurredAt ?? AT,
      channel: over.channel ?? 'email',
      placement: 'weekly_offers',
      inputSnapshotHash: 'a'.repeat(64),
      catalogueSnapshotHash: 'b'.repeat(64),
      sourceBindings: [],
      packageVersions: {},
      candidateKeys: ['offer_a'],
      eliminations: [],
      scores: {},
      arbitration: {
        formula: 'P x V',
        utility: { id: 'multiplicative', version: '1.0.0' },
        winner: 'offer_a',
        runnerUp: null,
      },
      constraintsApplied: [],
      consentState: { marketing: 'granted', profiling: 'granted', thirdParty: 'withheld' },
      winner: over.winner === undefined ? 'offer_a' : over.winner,
      winnerOfferId: over.winner === null ? null : (over.winnerOfferId ?? 'p_a'),
    },
    measured: { timingsByNode: {}, totalMs: 1, executedAt: AT },
  } as unknown as DecisionRecord;
}

export interface StoreHarness {
  create(): Promise<LedgerStore>;
  teardown?(): Promise<void>;
  /** Postgres refuses an outcome for a missing decision; memory cannot. */
  enforcesForeignKeys?: boolean;
}

export function describeLedger(label: string, harness: StoreHarness): void {
  describe(label, () => {
    let store: LedgerStore;
    let ledger: DecisionLedger;

    beforeEach(async () => {
      store = await harness.create();
      ledger = new DecisionLedger(store);
    });

    afterAll(async () => {
      await harness.teardown?.();
    });

    describe('recording', () => {
      it('stores a decision and reads back exactly what the engine produced', async () => {
        const record = decisionRecord();
        await ledger.record(ledger.entryFor(record, T));

        const back = await ledger.get(T, record.id);
        // The whole record, not a decomposition of it: the chain hash is taken
        // over this shape, so anything less means replay compares two things
        // that were never the same.
        expect(back?.record).toEqual(record);
        expect(back?.chainHash).toBe(record.chainHash);
      });

      it('derives the queryable columns from the record rather than trusting a caller', async () => {
        const record = decisionRecord({ customerRef: 'cust_9', occurredAt: AT });
        const entry = ledger.entryFor(record, T);
        expect(entry.subjectHash).toBe(subjectHash(T, 'cust_9'));
        expect(entry.occurredAt).toBe(AT);
        expect(entry.flowId).toBe('next-best-action');
      });

      it('does not hold the customer reference in clear', async () => {
        const record = decisionRecord({ customerRef: 'cust_9' });
        const entry = ledger.entryFor(record, T);
        // Queryable without being a second copy of the customer database.
        expect(entry.subjectHash).not.toContain('cust_9');
        expect(entry.subjectHash).toMatch(/^[0-9a-f]{64}$/);
      });

      it('salts the subject hash per tenant', async () => {
        // Otherwise two tenants could confirm they share a customer by
        // comparing ledgers.
        expect(subjectHash('a', 'cust_1')).not.toBe(subjectHash('b', 'cust_1'));
      });

      it('treats the same decision arriving twice as a no-op', async () => {
        const record = decisionRecord();
        await ledger.record(ledger.entryFor(record, T));
        await ledger.record(ledger.entryFor(record, T));
        expect((await ledger.query({ tenantId: T })).length).toBe(1);
      });

      it('refuses a different decision under an id already recorded', async () => {
        // The id is a content hash, so this is a collision rather than a
        // retry, and quietly keeping one of the two would hide it.
        await ledger.record(ledger.entryFor(decisionRecord({ id: 'dec_x' }), T));
        await expect(
          ledger.record(
            ledger.entryFor(decisionRecord({ id: 'dec_x', chainHash: 'f'.repeat(64) }), T)
          )
        ).rejects.toThrow(LedgerError);
      });

      it('keeps tenants apart', async () => {
        const record = decisionRecord();
        await ledger.record(ledger.entryFor(record, T));
        expect(await ledger.get('telco-ie', record.id)).toBeUndefined();
      });
    });

    describe('querying', () => {
      beforeEach(async () => {
        await ledger.record(
          ledger.entryFor(
            decisionRecord({ id: 'dec_a', customerRef: 'c1', occurredAt: '2026-06-01T10:00:00.000Z' }),
            T
          )
        );
        await ledger.record(
          ledger.entryFor(
            decisionRecord({ id: 'dec_b', customerRef: 'c1', occurredAt: '2026-06-02T10:00:00.000Z' }),
            T
          )
        );
        await ledger.record(
          ledger.entryFor(
            decisionRecord({
              id: 'dec_c',
              customerRef: 'c2',
              occurredAt: '2026-06-03T10:00:00.000Z',
              artifactId: 'inbound-web-offers',
            }),
            T
          )
        );
      });

      it('answers "every decision about this customer", newest first', async () => {
        // The right-of-access query, and the reason subject_hash is indexed.
        const rows = await ledger.query({ tenantId: T, subjectHash: subjectHash(T, 'c1') });
        expect(rows.map((r) => r.decisionId)).toEqual(['dec_b', 'dec_a']);
      });

      it('filters by flow', async () => {
        const rows = await ledger.query({ tenantId: T, flowId: 'inbound-web-offers' });
        expect(rows.map((r) => r.decisionId)).toEqual(['dec_c']);
      });

      it('bounds a window inclusively at both ends', async () => {
        const rows = await ledger.query({
          tenantId: T,
          from: '2026-06-01T10:00:00.000Z',
          to: '2026-06-02T10:00:00.000Z',
        });
        expect(rows.map((r) => r.decisionId)).toEqual(['dec_b', 'dec_a']);
      });

      it('filters by channel, by the action that won, and by whether anything was offered', async () => {
        // The three filters /decisions sends. dec_d is a web decision that
        // offered nothing; the other three are email decisions that offered one.
        await ledger.record(
          ledger.entryFor(
            decisionRecord({
              id: 'dec_d',
              customerRef: 'c3',
              occurredAt: '2026-06-04T10:00:00.000Z',
              channel: 'web',
              winner: null,
            }),
            T
          )
        );

        expect((await ledger.query({ tenantId: T, channel: 'web' })).map((r) => r.decisionId)).toEqual(['dec_d']);
        expect((await ledger.query({ tenantId: T, action: 'offer_a' })).map((r) => r.decisionId)).toEqual([
          'dec_c',
          'dec_b',
          'dec_a',
        ]);
        expect((await ledger.query({ tenantId: T, outcome: 'suppressed' })).map((r) => r.decisionId)).toEqual(['dec_d']);
        expect((await ledger.query({ tenantId: T, outcome: 'offered' })).length).toBe(3);
      });

      it('counts what matched, not what a page returned', async () => {
        // The defect this exists to prevent: a screen reporting its page size as
        // the total. Three decisions match; the page asks for two.
        expect(await ledger.count({ tenantId: T })).toBe(3);
        expect((await ledger.query({ tenantId: T, limit: 2 })).length).toBe(2);
        expect(await ledger.count({ tenantId: T, limit: 2 })).toBe(3);
        expect(await ledger.count({ tenantId: T, flowId: 'inbound-web-offers' })).toBe(1);
        expect(await ledger.count({ tenantId: T, subjectHash: subjectHash(T, 'c1') })).toBe(2);
      });

      it('limits without changing the order', async () => {
        const rows = await ledger.query({ tenantId: T, limit: 2 });
        expect(rows.map((r) => r.decisionId)).toEqual(['dec_c', 'dec_b']);
      });
    });

    describe('outcomes', () => {
      beforeEach(async () => {
        await ledger.record(ledger.entryFor(decisionRecord({ id: 'dec_o' }), T));
      });

      it('records in the order they arrived', async () => {
        await ledger.recordOutcome({
          tenantId: T, decisionId: 'dec_o', type: 'impression',
          occurredAt: '2026-06-01T12:00:01.000Z', valueMinor: null,
        });
        await ledger.recordOutcome({
          tenantId: T, decisionId: 'dec_o', type: 'click',
          occurredAt: '2026-06-01T12:00:02.000Z', valueMinor: null,
        });
        await ledger.recordOutcome({
          tenantId: T, decisionId: 'dec_o', type: 'conversion',
          occurredAt: '2026-06-01T12:05:00.000Z', valueMinor: 3500,
        });

        const out = await ledger.outcomesFor(T, 'dec_o');
        expect(out.map((o) => o.type)).toEqual(['impression', 'click', 'conversion']);
        expect(out[2].valueMinor).toBe(3500);
      });

      it('distinguishes no value from a value of zero', async () => {
        // A click is not a conversion worth nothing, and averaging over zeros
        // would say it was.
        await ledger.recordOutcome({
          tenantId: T, decisionId: 'dec_o', type: 'click',
          occurredAt: AT, valueMinor: null,
        });
        await ledger.recordOutcome({
          tenantId: T, decisionId: 'dec_o', type: 'conversion',
          occurredAt: AT, valueMinor: 0,
        });
        const out = await ledger.outcomesFor(T, 'dec_o');
        expect(out[0].valueMinor).toBeNull();
        expect(out[1].valueMinor).toBe(0);
      });

      it('refuses an outcome for a decision nobody made', async () => {
        // A mis-routed event or a mis-typed id. Storing it would put a row in
        // the ledger that can never be joined to anything.
        await expect(
          ledger.recordOutcome({
            tenantId: T, decisionId: 'dec_nope', type: 'click',
            occurredAt: AT, valueMinor: null,
          })
        ).rejects.toThrow(LedgerError);
      });

      it('does not leak outcomes across tenants', async () => {
        await ledger.recordOutcome({
          tenantId: T, decisionId: 'dec_o', type: 'click', occurredAt: AT, valueMinor: null,
        });
        expect(await ledger.outcomesFor('telco-ie', 'dec_o')).toEqual([]);
      });
    });

    /**
     * ADR-013 §1. What the platform did about a decision, kept apart from what
     * the customer did about it.
     */
    describe('delivery attempts', () => {
      beforeEach(async () => {
        await ledger.record(ledger.entryFor(decisionRecord({ id: 'dec_d' }), T));
      });

      const attempt = (over: Partial<Parameters<typeof ledger.recordDelivery>[0]> = {}) => ({
        tenantId: T,
        decisionId: 'dec_d',
        placementKey: 'weekly_offers_send',
        channel: 'email',
        state: 'suppressed' as const,
        at: AT,
        reason: 'no_adapter',
        permanent: null,
        providerRef: null,
        ...over,
      });

      it('records what the platform did, in the order it did it', async () => {
        await ledger.recordDelivery(attempt({ state: 'dispatched', reason: null, at: '2026-06-01T12:00:01.000Z' }));
        await ledger.recordDelivery(attempt({ state: 'failed', reason: 'hard_bounce', permanent: true, at: '2026-06-01T12:00:09.000Z' }));

        const rows = await ledger.deliveriesFor(T, 'dec_d');
        expect(rows.map((d) => d.state)).toEqual(['dispatched', 'failed']);
        expect(rows[1].permanent).toBe(true);
      });

      it('keeps the deliverer’s own reference, because the return path is keyed by it', async () => {
        // Bounce and complaint webhooks arrive keyed by the provider's id, not
        // ours. Without this the join back to a decision would have to be
        // reconstructed from customer and time, which ADR-008 §2 forbids.
        await ledger.recordDelivery(attempt({ state: 'dispatched', reason: null, providerRef: 'prov_abc123' }));
        expect((await ledger.deliveriesFor(T, 'dec_d'))[0].providerRef).toBe('prov_abc123');
      });

      it('refuses an attempt for a decision nobody made', async () => {
        // The same invariant as an outcome, for the same reason: a row that
        // cannot be joined to a decision records nothing.
        await expect(
          ledger.recordDelivery(attempt({ decisionId: 'dec_nope' }))
        ).rejects.toThrow(LedgerError);
      });

      it('does not leak attempts across tenants', async () => {
        await ledger.recordDelivery(attempt());
        expect(await ledger.deliveriesFor('telco-ie', 'dec_d')).toEqual([]);
      });

      it('keeps deliveries out of the outcome funnel', async () => {
        // The whole reason this is a separate record. A delivery appearing as
        // an outcome would put the platform's own actions into the denominator
        // every rate on /performance is computed over.
        await ledger.recordDelivery(attempt({ state: 'dispatched', reason: null }));
        expect(await ledger.outcomesFor(T, 'dec_d')).toEqual([]);
      });
    });

    /**
     * ADR-021: the one query a frequency cap reads. Run against both stores, so
     * the SQL and the in-memory filter cannot quietly count differently.
     */
    describe('contacts, as a cap counts them', () => {
      const UNTIL = '2026-06-30T12:00:00.000Z';
      const ago = (ms: number) => new Date(Date.parse(UNTIL) - ms).toISOString();
      const H = 60 * 60 * 1000;
      const D = 24 * H;

      let n = 0;
      /** Record a decision for a customer and attempt its delivery. */
      async function contact(over: {
        at: string;
        state?: 'dispatched' | 'delivered' | 'failed' | 'suppressed' | 'accepted';
        customerRef?: string;
        channel?: string;
        winner?: string | null;
        winnerOfferId?: string;
        decisionId?: string;
        tenantId?: string;
      }) {
        const decisionId = over.decisionId ?? `dec_contact_${(n += 1)}`;
        const tenantId = over.tenantId ?? T;
        if (!(await ledger.get(tenantId, decisionId))) {
          await ledger.record(
            ledger.entryFor(
              decisionRecord({
                id: decisionId,
                customerRef: over.customerRef ?? 'cust_capped',
                channel: over.channel ?? 'web',
                winner: over.winner,
                winnerOfferId: over.winnerOfferId,
                occurredAt: over.at,
              }),
              tenantId
            )
          );
        }
        await ledger.recordDelivery({
          tenantId,
          decisionId,
          placementKey: 'homepage_hero',
          channel: over.channel ?? 'web',
          state: over.state ?? 'dispatched',
          at: over.at,
          reason: null,
          permanent: null,
          providerRef: null,
        });
        return decisionId;
      }
      const counts = (over: { customerRef?: string; channel?: string; tenantId?: string; offerIds?: string[] } = {}) =>
        ledger.contactsFor({
          tenantId: over.tenantId ?? T,
          customerRef: over.customerRef ?? 'cust_capped',
          channel: over.channel ?? 'web',
          until: UNTIL,
          ...(over.offerIds ? { offerIds: over.offerIds } : {}),
        });

      it('is zero, in every window, for a customer never contacted', async () => {
        expect(await counts()).toEqual({ day: 0, week: 0, month: 0 });
      });

      it('counts a message handed over or delivered, and never one suppressed or failed', async () => {
        await contact({ at: ago(H), state: 'dispatched' });
        await contact({ at: ago(H), state: 'delivered' });
        await contact({ at: ago(H), state: 'suppressed' });
        // A message that never arrived does not consume the cap (ADR-013 §6).
        await contact({ at: ago(H), state: 'failed' });
        // Held by the platform, not yet handed to anyone.
        await contact({ at: ago(H), state: 'accepted' });
        expect(await counts()).toEqual({ day: 2, week: 2, month: 2 });
      });

      it('does not count a decision that offered nothing: nothing was handed over', async () => {
        await contact({ at: ago(H), winner: null });
        expect(await counts()).toEqual({ day: 0, week: 0, month: 0 });
      });

      it('counts each window back from the decision, not the clock or the calendar', async () => {
        await contact({ at: UNTIL }); // the same instant: inside every window
        await contact({ at: ago(23 * H) }); // day, week, month
        await contact({ at: ago(D) }); // exactly a day before: outside the day
        await contact({ at: ago(3 * D) }); // week, month
        await contact({ at: ago(7 * D) }); // exactly a week before: month only
        await contact({ at: ago(20 * D) }); // month
        await contact({ at: ago(30 * D) }); // exactly thirty days: outside
        await contact({ at: new Date(Date.parse(UNTIL) + 1000).toISOString() }); // after: never
        expect(await counts()).toEqual({ day: 2, week: 4, month: 6 });
      });

      it('counts a decision once, at its first contact, however many attempts it took', async () => {
        const id = await contact({ at: ago(2 * D), state: 'dispatched' });
        await contact({ decisionId: id, at: ago(H), state: 'delivered' });
        // First handed over two days ago: in the week, not in the day.
        expect(await counts()).toEqual({ day: 0, week: 1, month: 1 });
      });

      it('counts only this customer, on this channel, in this tenant', async () => {
        await contact({ at: ago(H) });
        await contact({ at: ago(H), customerRef: 'cust_someone_else' });
        await contact({ at: ago(H), channel: 'email' });
        await contact({ at: ago(H), tenantId: 'telco-ie' });
        expect(await counts()).toEqual({ day: 1, week: 1, month: 1 });
        expect(await counts({ channel: 'email' })).toEqual({ day: 1, week: 1, month: 1 });
        expect(await counts({ tenantId: 'telco-ie' })).toEqual({ day: 1, week: 1, month: 1 });
      });

      it('counts only the contacts about the offers a scope covers, when asked for them (ADR-021 §9)', async () => {
        await contact({ at: ago(H), winner: 'disney_plus', winnerOfferId: 'off_disney_plus' });
        await contact({ at: ago(2 * H), winner: 'fios_gigabit', winnerOfferId: 'off_fios_gigabit' });
        await contact({ at: ago(3 * D), winner: 'disney_plus', winnerOfferId: 'off_disney_plus' });
        // The channel's count is every contact; the scope's is the two about Disney+.
        expect(await counts()).toEqual({ day: 2, week: 3, month: 3 });
        expect(await counts({ offerIds: ['off_disney_plus'] })).toEqual({ day: 1, week: 2, month: 2 });
        expect(await counts({ offerIds: ['off_disney_plus', 'off_fios_gigabit'] })).toEqual({ day: 2, week: 3, month: 3 });
        // A scope that covers no offer has had no contact about it.
        expect(await counts({ offerIds: [] })).toEqual({ day: 0, week: 0, month: 0 });
      });
    });

    describe('idempotency', () => {
      const request = {
        tenantId: T,
        customerId: 'cust_1',
        channel: 'email',
        placement: 'weekly_offers',
        occurredAt: AT,
        input: { age: 41 },
        idempotencyKey: 'k1',
      };

      it('is fresh the first time', async () => {
        expect((await ledger.resolve(request)).kind).toBe('fresh');
      });

      it('replays the original decision, not a re-execution', async () => {
        const record = decisionRecord({ id: 'dec_idem' });
        await ledger.record(ledger.entryFor(record, T));
        const { hash } = (await ledger.resolve(request)) as { hash: string };
        await ledger.claim({
          tenantId: T, key: 'k1', requestHash: hash,
          decisionId: record.id, storedAt: AT,
        });

        const again = await ledger.resolve(request);
        expect(again.kind).toBe('replay');
        if (again.kind === 'replay') expect(again.entry.decisionId).toBe(record.id);
      });

      it('conflicts when the same key is reused for a different question', async () => {
        const record = decisionRecord({ id: 'dec_idem2' });
        await ledger.record(ledger.entryFor(record, T));
        const { hash } = (await ledger.resolve(request)) as { hash: string };
        await ledger.claim({
          tenantId: T, key: 'k1', requestHash: hash,
          decisionId: record.id, storedAt: AT,
        });

        const other = await ledger.resolve({ ...request, customerId: 'someone_else' });
        expect(other.kind).toBe('conflict');
      });

      it('survives whatever the store does between calls, which is the point', async () => {
        // In memory this is trivially true; against PostgreSQL it is the whole
        // reason idempotency moved out of process memory — a retry after a
        // restart still finds its original decision.
        const record = decisionRecord({ id: 'dec_durable' });
        await ledger.record(ledger.entryFor(record, T));
        const { hash } = (await ledger.resolve(request)) as { hash: string };
        await ledger.claim({
          tenantId: T, key: 'k1', requestHash: hash, decisionId: record.id, storedAt: AT,
        });

        const reopened = new DecisionLedger(store);
        const again = await reopened.resolve(request);
        expect(again.kind).toBe('replay');
      });

      it('lets the first claim win and tells the loser', async () => {
        const a = decisionRecord({ id: 'dec_first' });
        const b = decisionRecord({ id: 'dec_second' });
        await ledger.record(ledger.entryFor(a, T));
        await ledger.record(ledger.entryFor(b, T));

        const first = await ledger.claim({
          tenantId: T, key: 'race', requestHash: 'h', decisionId: a.id, storedAt: AT,
        });
        const second = await ledger.claim({
          tenantId: T, key: 'race', requestHash: 'h', decisionId: b.id, storedAt: AT,
        });
        expect(first.decisionId).toBe(a.id);
        expect(second.decisionId).toBe(a.id);
      });

      it('has no opinion when the caller supplied no key', async () => {
        const { idempotencyKey: _unused, ...noKey } = request;
        expect((await ledger.resolve(noKey)).kind).toBe('fresh');
      });
    });
  });
}
