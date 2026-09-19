import { newKey, pseudonym } from './crypto';
import type { TenantKeyProvider } from './providers';
import type { ErasureRecord, KeyStore } from './types';

/** A subject's key, ready to use, and the column their rows are found by. */
export interface SubjectKey {
  key: Buffer;
  /** `HMAC(subjectKey, customerRef)`: the ledger's subject column (ADR-004 amendment, point 3). */
  column: string;
  /** `HMAC(tenant pseudonym key, customerRef)`: how the key store finds the key. */
  tenantPseudonym: string;
}

/** What `verifyErasure` found. */
export interface ErasureCheck {
  /** The subject's key is gone from the store: nothing can unwrap it again. */
  keyDestroyed: boolean;
  /** This process holds no unwrapped copy of it. Others forget within `cacheMs`. */
  notCachedHere: boolean;
}

export interface KeyRingOptions {
  /** How long an unwrapped subject key may be reused in this process. ADR-025 §3: at most 60 seconds. */
  cacheMs?: number;
  /** Milliseconds since the epoch. Injected so the cache bound can be tested without waiting. */
  now?: () => number;
}

/** ADR-025 §3's bound, and the longest this process may hold an erased subject's key. */
export const MAX_CACHE_MS = 60_000;

const tenantAad = (tenantId: string) => `keys:key_tenants:${tenantId}`;
const subjectAad = (tenantId: string, tenantPseudonym: string) => `keys:subject_keys:${tenantId}:${tenantPseudonym}`;

/**
 * The key lifecycle — ADR-025 §1 and §3 — over one tenant key provider.
 *
 * A ring serves one tenant key, so one tenant: a tenant's provider is chosen at
 * provisioning and checked against its data class there (`providerFor`).
 *
 * The rules live here rather than in the stores, so memory and PostgreSQL cannot
 * enforce them differently:
 *
 * - a subject key is created on the subject's first write, never on a read;
 * - an unwrapped key is reused for at most `cacheMs`, which is the bound on how
 *   long erasure takes to reach every process;
 * - erasure records before it destroys, so a crash in between leaves a record
 *   that `verifyErasure` reports as not yet held and `reapplyErasures` completes,
 *   rather than a destroyed key nobody can prove was destroyed on purpose.
 */
export class KeyRing {
  private readonly cacheMs: number;
  private readonly now: () => number;
  private readonly pseudonymKeys = new Map<string, Buffer>();
  private readonly cache = new Map<string, { key: Buffer; expires: number }>();

  constructor(
    private readonly store: KeyStore,
    private readonly provider: TenantKeyProvider,
    options: KeyRingOptions = {}
  ) {
    const cacheMs = options.cacheMs ?? MAX_CACHE_MS;
    if (cacheMs < 0 || cacheMs > MAX_CACHE_MS) {
      throw new Error(`A subject key may be cached for at most ${MAX_CACHE_MS} ms (ADR-025 §3), not ${cacheMs}.`);
    }
    this.cacheMs = cacheMs;
    this.now = options.now ?? Date.now;
  }

  /**
   * The key tenant pseudonyms are computed under: created once per tenant,
   * stored wrapped, and unwrapped once per process — so a tenant key held in a
   * KMS is asked once per start, not once per decision.
   */
  private async pseudonymKey(tenantId: string): Promise<Buffer> {
    const held = this.pseudonymKeys.get(tenantId);
    if (held) return held;
    let wrapped = await this.store.tenantKey(tenantId);
    if (!wrapped) {
      wrapped = await this.store.putTenantKeyIfAbsent(tenantId, await this.provider.wrap(newKey(), tenantAad(tenantId)));
    }
    const key = await this.provider.unwrap(wrapped, tenantAad(tenantId));
    this.pseudonymKeys.set(tenantId, key);
    return key;
  }

  /** How the key store finds this subject's key. Reveals nothing without the tenant key. */
  async tenantPseudonym(tenantId: string, customerRef: string): Promise<string> {
    return pseudonym(await this.pseudonymKey(tenantId), customerRef);
  }

  private cacheId(tenantId: string, tenantPseudonym: string) {
    return `${tenantId.length}:${tenantId}:${tenantPseudonym}`;
  }

  /** Unwrap, and hold the result for at most `cacheMs`. Callers check the cache first. */
  private async unwrapped(tenantId: string, tenantPseudonym: string, wrapped: Buffer): Promise<Buffer> {
    const key = await this.provider.unwrap(wrapped, subjectAad(tenantId, tenantPseudonym));
    this.cache.set(this.cacheId(tenantId, tenantPseudonym), { key, expires: this.now() + this.cacheMs });
    return key;
  }

  /**
   * The subject's key for writing their data: created, and stored wrapped, on
   * their first write. After an erasure this creates a new key — data written
   * after erasure is new data — and the erased rows stay unreadable, because
   * their key is gone.
   */
  async forWrite(tenantId: string, customerRef: string): Promise<SubjectKey> {
    const tenantPseudonym = await this.tenantPseudonym(tenantId, customerRef);
    const cached = this.cache.get(this.cacheId(tenantId, tenantPseudonym));
    let key: Buffer;
    if (cached && cached.expires > this.now()) {
      key = cached.key;
    } else {
      let wrapped = await this.store.subjectKey(tenantId, tenantPseudonym);
      if (!wrapped) {
        wrapped = await this.store.putSubjectKeyIfAbsent(
          tenantId,
          tenantPseudonym,
          await this.provider.wrap(newKey(), subjectAad(tenantId, tenantPseudonym))
        );
      }
      key = await this.unwrapped(tenantId, tenantPseudonym, wrapped);
    }
    return { key, column: pseudonym(key, customerRef), tenantPseudonym };
  }

  /**
   * The subject's key for reading their data, or `undefined` if they have none —
   * never written, or erased. A read never creates a key: one that did would
   * hand an erased subject's reader a fresh key and a silent "nothing found".
   */
  async forRead(tenantId: string, customerRef: string): Promise<SubjectKey | undefined> {
    const tenantPseudonym = await this.tenantPseudonym(tenantId, customerRef);
    const cached = this.cache.get(this.cacheId(tenantId, tenantPseudonym));
    let key: Buffer;
    if (cached && cached.expires > this.now()) {
      key = cached.key;
    } else {
      const wrapped = await this.store.subjectKey(tenantId, tenantPseudonym);
      if (!wrapped) return undefined;
      key = await this.unwrapped(tenantId, tenantPseudonym, wrapped);
    }
    return { key, column: pseudonym(key, customerRef), tenantPseudonym };
  }

  /**
   * Erase a subject: record it, destroy their key, forget any copy here.
   *
   * Recorded even when there is no key to destroy, because "we were asked and
   * held nothing" is a fact an auditor asks for too.
   */
  async erase(
    tenantId: string,
    customerRef: string,
    by: { erasedBy: string; requestRef: string }
  ): Promise<ErasureRecord> {
    const tenantPseudonym = await this.tenantPseudonym(tenantId, customerRef);
    const wrapped = await this.store.subjectKey(tenantId, tenantPseudonym);
    const subjectColumn = wrapped
      ? pseudonym(await this.unwrapped(tenantId, tenantPseudonym, wrapped), customerRef)
      : '';
    const record: ErasureRecord = {
      tenantId,
      pseudonym: tenantPseudonym,
      subjectColumn,
      erasedAt: new Date(this.now()).toISOString(),
      erasedBy: by.erasedBy,
      requestRef: by.requestRef,
      hadKey: wrapped !== undefined,
    };
    // The record first: see the class comment.
    await this.store.appendErasure(record);
    await this.store.deleteSubjectKey(tenantId, tenantPseudonym);
    this.cache.delete(this.cacheId(tenantId, tenantPseudonym));
    return record;
  }

  /**
   * Destroy again every key an erasure record names — after a restore brought
   * back keys that had been destroyed since the backup was taken (ADR-025 §3).
   * Returns how many keys it found and destroyed; zero means nothing was
   * resurrected.
   */
  async reapplyErasures(tenantId?: string): Promise<number> {
    let destroyed = 0;
    for (const r of await this.store.erasures(tenantId)) {
      if (await this.store.deleteSubjectKey(r.tenantId, r.pseudonym)) destroyed += 1;
      this.cache.delete(this.cacheId(r.tenantId, r.pseudonym));
    }
    return destroyed;
  }

  /** Whether an erasure holds: the key is gone, and this process keeps no copy. */
  async verifyErasure(record: ErasureRecord): Promise<ErasureCheck> {
    return {
      keyDestroyed: (await this.store.subjectKey(record.tenantId, record.pseudonym)) === undefined,
      notCachedHere: !this.cache.has(this.cacheId(record.tenantId, record.pseudonym)),
    };
  }
}
