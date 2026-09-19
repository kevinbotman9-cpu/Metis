import { describe, it, expect, beforeEach } from 'vitest';
import { KeyRing, KeyError, open, seal, pseudonym, type KeyStore, type TenantKeyProvider } from '../src';
import { newKey } from '../src/crypto';

/**
 * The key lifecycle — ADR-025 §1 and §3 — over any store.
 *
 * Run over memory and PostgreSQL. The rules are `KeyRing`'s, so what differs
 * between the two is only whether the store keeps what it is given.
 */

/** A tenant key in memory: what `FileKeyProvider` does, without a file. */
export function memoryProvider(): TenantKeyProvider {
  const key = newKey();
  return {
    kind: 'file',
    wrap: async (plain, aad) => seal(key, plain, aad),
    unwrap: async (wrapped, aad) => open(key, wrapped, aad),
  };
}

export interface KeyStoreHarness {
  create(): Promise<KeyStore>;
  /** PostgreSQL refuses to change an erasure record; memory has no triggers. */
  enforcesAppendOnly?: (store: KeyStore) => Promise<void>;
}

const T = 'telco-us';
const by = { erasedBy: 'dpo@telco.example', requestRef: 'DSR-2026-0042' };

export function describeKeyStore(label: string, harness: KeyStoreHarness): void {
  describe(label, () => {
    let store: KeyStore;
    let provider: TenantKeyProvider;
    let clock: number;
    const ring = (cacheMs?: number) => new KeyRing(store, provider, { now: () => clock, cacheMs });

    beforeEach(async () => {
      store = await harness.create();
      provider = memoryProvider();
      clock = Date.parse('2026-09-19T12:00:00.000Z');
    });

    describe('a subject key (ADR-025 §1)', () => {
      it('is created on the first write, and every process after that finds the same one', async () => {
        const a = await ring().forWrite(T, 'cust_eva');
        const b = await ring().forWrite(T, 'cust_eva');
        expect(b.key.equals(a.key)).toBe(true);
        expect(a.column).toBe(pseudonym(a.key, 'cust_eva'));
        expect(a.column).not.toContain('cust_eva');
      });

      it('is never created by a read', async () => {
        expect(await ring().forRead(T, 'cust_nobody')).toBeUndefined();
        expect(await store.subjectKey(T, await ring().tenantPseudonym(T, 'cust_nobody'))).toBeUndefined();
      });

      it('is one key when two processes write for the same subject at once', async () => {
        const [a, b] = await Promise.all([ring().forWrite(T, 'cust_race'), ring().forWrite(T, 'cust_race')]);
        expect(b.key.equals(a.key)).toBe(true);
      });

      it('differs between tenants for the same customer reference', async () => {
        const a = await ring().forWrite('telco-us', 'cust_1');
        const b = await ring().forWrite('telco-uk', 'cust_1');
        expect(b.key.equals(a.key)).toBe(false);
        expect(b.tenantPseudonym).not.toBe(a.tenantPseudonym);
      });

      it('is stored wrapped: what the store holds does not open anything', async () => {
        const s = await ring().forWrite(T, 'cust_wrapped');
        const held = (await store.subjectKey(T, s.tenantPseudonym))!;
        expect(held.equals(s.key)).toBe(false);
        expect(held.includes(s.key)).toBe(false);
      });
    });

    describe('erasure (ADR-025 §3)', () => {
      it('destroys the key, records it, and leaves what was sealed under it unopenable', async () => {
        const r = ring();
        const s = await r.forWrite(T, 'cust_eva');
        const sealed = seal(s.key, Buffer.from('{"offered":"fios_gigabit"}'), 'ledger:decision_records:telco-us:dec_1');

        const erased = await r.erase(T, 'cust_eva', by);
        expect(erased).toMatchObject({ tenantId: T, subjectColumn: s.column, hadKey: true, ...by });
        expect(await r.verifyErasure(erased)).toEqual({ keyDestroyed: true, notCachedHere: true });
        expect(await r.forRead(T, 'cust_eva')).toBeUndefined();

        // A later write is new data under a new key; the old rows stay shut.
        const after = await r.forWrite(T, 'cust_eva');
        expect(after.key.equals(s.key)).toBe(false);
        expect(() => open(after.key, sealed, 'ledger:decision_records:telco-us:dec_1')).toThrow(KeyError);
        expect(await store.erasures(T)).toEqual([erased]);
      });

      it('records an erasure even when there was no key to destroy', async () => {
        const erased = await ring().erase(T, 'cust_never_seen', by);
        expect(erased).toMatchObject({ hadKey: false, subjectColumn: '' });
        expect(await store.erasures(T)).toHaveLength(1);
      });

      it('reaches another process within the cache bound, and not before', async () => {
        // Process B read the key before A erased it: it may keep using its
        // copy for up to 60 seconds, which is why erasure is not instant.
        const a = ring();
        const b = ring();
        await a.forWrite(T, 'cust_eva');
        const held = await b.forRead(T, 'cust_eva');
        await a.erase(T, 'cust_eva', by);

        clock += 59_999;
        expect((await b.forRead(T, 'cust_eva'))?.key.equals(held!.key)).toBe(true);
        clock += 2;
        expect(await b.forRead(T, 'cust_eva')).toBeUndefined();
      });

      it('refuses a cache bound longer than the erasure claim allows', () => {
        expect(() => ring(60_001)).toThrow(/at most 60000 ms/);
      });

      it('is re-applied after a restore brings a destroyed key back', async () => {
        const r = ring();
        const s = await r.forWrite(T, 'cust_eva');
        const backedUp = (await store.subjectKey(T, s.tenantPseudonym))!;
        const erased = await r.erase(T, 'cust_eva', by);

        // The data is restored from a backup taken before the erasure; the
        // erasure record, backed up apart, is not rolled back.
        await store.putSubjectKeyIfAbsent(T, s.tenantPseudonym, backedUp);
        expect(await r.verifyErasure(erased)).toMatchObject({ keyDestroyed: false });
        expect((await ring().forRead(T, 'cust_eva'))?.key.equals(s.key)).toBe(true);

        expect(await r.reapplyErasures(T)).toBe(1);
        expect(await r.verifyErasure(erased)).toEqual({ keyDestroyed: true, notCachedHere: true });
        expect(await ring().forRead(T, 'cust_eva')).toBeUndefined();
        expect(await r.reapplyErasures(T)).toBe(0);
      });

      it('keeps each tenant’s erasures apart, oldest first', async () => {
        await ring().forWrite('telco-us', 'cust_1');
        await ring().erase('telco-us', 'cust_1', by);
        clock += 1000;
        await ring().erase('telco-uk', 'cust_1', by);
        clock += 1000;
        await ring().erase('telco-us', 'cust_2', by);
        expect((await store.erasures('telco-us')).map((e) => e.erasedAt)).toEqual([
          '2026-09-19T12:00:00.000Z',
          '2026-09-19T12:00:02.000Z',
        ]);
        expect(await store.erasures()).toHaveLength(3);
      });

      if (harness.enforcesAppendOnly) {
        it('cannot be changed once recorded', async () => {
          await ring().erase(T, 'cust_eva', by);
          await harness.enforcesAppendOnly!(store);
        });
      }
    });
  });
}
