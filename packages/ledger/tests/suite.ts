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
  /** What was shown, best first; the winner alone when not given (ADR-020 §1). */
  slate?: { action: string; offerId: string }[];
} = {}): DecisionRecord {
  const id = over.id ?? 'dec_0000000000000001';
  const winner = over.winner === undefined ? 'offer_a' : over.winner;
  const winnerOfferId = over.winner === null ? null : (over.winnerOfferId ?? 'p_a');
  const shown = over.slate ?? (winner ? [{ action: winner, offerId: winnerOfferId as string }] : []);
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
      fieldOrigins: [],
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
      winner,
      winnerOfferId,
      slotCount: Math.max(1, shown.length),
      slate: shown.map((e, i) => ({ rank: i + 1, action: e.action, offerId: e.offerId, priority: 1 - i / 10 })),
    },
    measured: { timingsByNode: {}, totalMs: 1, executedAt: AT },
  } as unknown as DecisionRecord;
}

export interface StoreHarness {
  create(): Promise<LedgerStore>;
  teardown?(): Promise<void>;
  /** Postgres refuses an outcome for a missing decision; memory cannot. */
  enforcesForeignKeys?: boolean;
  /**
   * A second store over the same data, as a second instance of the decision
   * service would hold (G-160). Only a store shared between processes has one;
   * the in-process order cannot help across two of them, so only the store's
   * own lock can pass the test that uses it.
   */
  another?(): Promise<LedgerStore>;
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

      /**
       * ADR-020 §4. An outcome names the offer it was about, checked against
       * what the decision recorded it showed — never the catalogue.
       */
      describe('which offer it was about', () => {
        const slate = [
          { action: 'fios_gigabit', offerId: 'off_fios_gigabit' },
          { action: 'disney_plus', offerId: 'off_disney_plus' },
        ];
        beforeEach(async () => {
          await ledger.record(
            ledger.entryFor(decisionRecord({ id: 'dec_two', winner: 'fios_gigabit', winnerOfferId: 'off_fios_gigabit', slate }), T)
          );
        });

        it('keeps the action an outcome names, on either store', async () => {
          await ledger.recordOutcome({
            tenantId: T, decisionId: 'dec_two', type: 'click', occurredAt: AT, valueMinor: null, action: 'disney_plus',
          });
          const [out] = await ledger.outcomesFor(T, 'dec_two');
          expect(out.action).toBe('disney_plus');
        });

        it('requires it on a decision that showed several, and says which it showed', async () => {
          const e = await ledger
            .recordOutcome({ tenantId: T, decisionId: 'dec_two', type: 'click', occurredAt: AT, valueMinor: null })
            .catch((x) => x);
          expect(e).toBeInstanceOf(LedgerError);
          expect(e.code).toBe('OUTCOME_ACTION_REQUIRED');
          expect(e.message).toMatch(/fios_gigabit, disney_plus/);
        });

        it('refuses an action the decision did not show', async () => {
          const e = await ledger
            .recordOutcome({ tenantId: T, decisionId: 'dec_two', type: 'click', occurredAt: AT, valueMinor: null, action: 'netflix' })
            .catch((x) => x);
          expect(e.code).toBe('OUTCOME_ACTION_NOT_SHOWN');
          // Refused, not stored.
          expect(await ledger.outcomesFor(T, 'dec_two')).toEqual([]);
        });

        it('takes an outcome that names nothing, on a decision that showed one, as about that one', async () => {
          await ledger.recordOutcome({ tenantId: T, decisionId: 'dec_o', type: 'click', occurredAt: AT, valueMinor: null });
          const [out] = await ledger.outcomesFor(T, 'dec_o');
          expect(out.action).toBeUndefined();
        });
      });
    });

    /**
     * A ledger written before the reseed (ADR-019 §7, ADR-020 §1, ADR-022 §2):
     * its records have no slate and name `sourceBindings`. Refused, with the
     * way out, rather than thrown on by the first reader that meets one — or
     * worse, read as a decision that showed nothing.
     */
    describe('a record from before the reseed', () => {
      const stale = () => {
        const r = decisionRecord({ id: 'dec_stale', customerRef: 'cust_capped', channel: 'web', occurredAt: '2026-06-01T11:00:00.000Z' });
        const d = r.decision as unknown as Record<string, unknown>;
        delete d.slate;
        delete d.slotCount;
        delete d.fieldOrigins;
        d.sourceBindings = [];
        return r;
      };
      beforeEach(async () => {
        await ledger.record(ledger.entryFor(stale(), T));
      });

      it('is refused on read, naming the decision and the reset', async () => {
        const e = await ledger.get(T, 'dec_stale').catch((x) => x);
        expect(e).toBeInstanceOf(LedgerError);
        expect(e.code).toBe('RECORD_PREDATES_RESEED');
        expect(e.message).toMatch(/dec_stale/);
        expect(e.message).toMatch(/seed:ledger -- --reset --tenant telco-us/);
        await expect(ledger.query({ tenantId: T })).rejects.toMatchObject({ code: 'RECORD_PREDATES_RESEED' });
        await expect(
          ledger.recordOutcome({ tenantId: T, decisionId: 'dec_stale', type: 'click', occurredAt: AT, valueMinor: null })
        ).rejects.toMatchObject({ code: 'RECORD_PREDATES_RESEED' });
      });

      it('refuses a scoped contact count rather than reading it as zero, and still counts the channel', async () => {
        await ledger.recordDelivery({
          tenantId: T, decisionId: 'dec_stale', placementKey: 'homepage_hero', channel: 'web', state: 'dispatched',
          at: '2026-06-01T11:00:00.000Z', reason: null, permanent: null, providerRef: null,
        });
        const q = { tenantId: T, customerRef: 'cust_capped', channel: 'web', until: AT };
        // Under-counting a cap is a customer protection failing open (ADR-021 §3).
        await expect(ledger.contactsFor({ ...q, offerIds: ['p_a'] })).rejects.toMatchObject({ code: 'RECORD_PREDATES_RESEED' });
        // A channel count needs no slate.
        expect(await ledger.contactsFor(q)).toEqual({ day: 1, week: 1, month: 1 });
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
        slate?: { action: string; offerId: string }[];
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
                slate: over.slate,
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
      const counts = (
        over: { customerRef?: string; channel?: string; tenantId?: string; offerIds?: string[]; actionKeys?: string[] } = {}
      ) =>
        ledger.contactsFor({
          tenantId: over.tenantId ?? T,
          customerRef: over.customerRef ?? 'cust_capped',
          channel: over.channel ?? 'web',
          until: UNTIL,
          ...(over.offerIds ? { offerIds: over.offerIds } : {}),
          ...(over.actionKeys ? { actionKeys: over.actionKeys } : {}),
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

      /**
       * G-160: a cap read, an engine's worth of time, and a contact written —
       * six times at once for one customer against a cap of three. Each one
       * reads the count before deciding, as the placement route does; without
       * the subject lock every one of them reads zero.
       */
      async function rushTheCap(ledgers: DecisionLedger[], attempts: number) {
        let made = 0;
        const one = (l: DecisionLedger, i: number) =>
          l.withSubject(T, 'cust_rush', async () => {
            const seen = await l.contactsFor({ tenantId: T, customerRef: 'cust_rush', channel: 'web', until: UNTIL });
            if (seen.day >= 3) return false;
            // The engine's time: long enough that without the lock every
            // attempt has read before the first one writes.
            await new Promise((r) => setTimeout(r, 25));
            const decisionId = `dec_rush_${i}`;
            await l.record(
              l.entryFor(
                decisionRecord({ id: decisionId, customerRef: 'cust_rush', channel: 'web', occurredAt: ago(H) }),
                T
              )
            );
            await l.recordDelivery({
              tenantId: T,
              decisionId,
              placementKey: 'homepage_hero',
              channel: 'web',
              state: 'dispatched',
              at: ago(H),
              reason: null,
              permanent: null,
              providerRef: null,
            });
            made += 1;
            return true;
          });
        await Promise.all(Array.from({ length: attempts }, (_, i) => one(ledgers[i % ledgers.length], i)));
        return made;
      }

      it('holds decisions for one customer made at once to the cap (G-160)', async () => {
        expect(await rushTheCap([ledger], 6)).toBe(3);
        expect(await counts({ customerRef: 'cust_rush' })).toEqual({ day: 3, week: 3, month: 3 });
      });

      it('holds them to the cap across four instances sharing the store (G-160)', async (ctx) => {
        if (!harness.another) return ctx.skip();
        // Four, not two. Each instance orders its own decisions, so two
        // instances overlap one attempt at a time and could land on three by
        // luck — which is what this test did with the store's lock removed, on
        // 2026-09-18, until it was widened. Four readers of zero cannot.
        const others = await Promise.all([1, 2, 3].map(async () => new DecisionLedger(await harness.another!())));
        expect(await rushTheCap([ledger, ...others], 8)).toBe(3);
        expect(await counts({ customerRef: 'cust_rush' })).toEqual({ day: 3, week: 3, month: 3 });
      });

      it('lets a failed decision go, and the next one for the customer runs', async () => {
        await expect(ledger.withSubject(T, 'cust_rush', async () => { throw new Error('engine refused'); })).rejects.toThrow(
          'engine refused'
        );
        expect(await ledger.withSubject(T, 'cust_rush', async () => 'next')).toBe('next');
      });

      it('counts a contact about every offer the decision showed, not only its winner (ADR-020 §4)', async () => {
        // A two-offer email contacted the customer about both. Counting only
        // winners let the second offer contact somebody without limit.
        await contact({
          at: ago(H),
          winner: 'fios_gigabit',
          winnerOfferId: 'off_fios_gigabit',
          slate: [
            { action: 'fios_gigabit', offerId: 'off_fios_gigabit' },
            { action: 'disney_plus', offerId: 'off_disney_plus' },
          ],
        });
        expect(await counts({ offerIds: ['off_disney_plus'] })).toEqual({ day: 1, week: 1, month: 1 });
        expect(await counts({ offerIds: ['off_fios_gigabit'] })).toEqual({ day: 1, week: 1, month: 1 });
        // Once per decision, however many of its entries a scope covers.
        expect(await counts({ offerIds: ['off_disney_plus', 'off_fios_gigabit'] })).toEqual({ day: 1, week: 1, month: 1 });
      });

      it('counts the contacts about one action, not its offer’s other action (ADR-019 §4)', async () => {
        // Two actions of one offer. The offer's count is both; each action's
        // is its own, so a cap on one narrows within the offer's.
        await contact({
          at: ago(H),
          winner: 'disney_plus_retain',
          winnerOfferId: 'off_disney_plus',
          slate: [{ action: 'disney_plus_retain', offerId: 'off_disney_plus' }],
        });
        await contact({
          at: ago(3 * D),
          winner: 'disney_plus',
          winnerOfferId: 'off_disney_plus',
          slate: [{ action: 'disney_plus', offerId: 'off_disney_plus' }],
        });
        expect(await counts({ offerIds: ['off_disney_plus'] })).toEqual({ day: 1, week: 2, month: 2 });
        expect(await counts({ actionKeys: ['disney_plus_retain'] })).toEqual({ day: 1, week: 1, month: 1 });
        expect(await counts({ actionKeys: ['disney_plus'] })).toEqual({ day: 0, week: 1, month: 1 });
        expect(await counts({ actionKeys: [] })).toEqual({ day: 0, week: 0, month: 0 });
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
