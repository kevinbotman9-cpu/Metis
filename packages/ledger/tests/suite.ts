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

const T = 'telco-uk';
const AT = '2026-06-01T12:00:00.000Z';

export function decisionRecord(over: {
  id?: string;
  chainHash?: string;
  customerRef?: string;
  occurredAt?: string;
  artifactId?: string;
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
      channel: 'email',
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
      consentState: { marketing: true, profiling: true, thirdParty: false },
      winner: 'offer_a',
      winnerOfferId: 'p_a',
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
