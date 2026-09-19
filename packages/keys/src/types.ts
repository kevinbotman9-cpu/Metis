/**
 * What the key store holds — ADR-025 §1 and §3.
 *
 * Everything a store holds is either wrapped under a tenant key it never sees,
 * or a record of an erasure that names no one. A store is storage; the rules —
 * who may create, when a key is destroyed, what an erasure must record — are
 * `KeyRing`'s, so the memory store and PostgreSQL cannot enforce them
 * differently.
 */

/** That a subject's key was destroyed. Carries no identifier and no key. */
export interface ErasureRecord {
  tenantId: string;
  /** The tenant pseudonym the key was found by, so a restore can re-apply this. */
  pseudonym: string;
  /** The subject column the subject's rows carry, so the erasure can be checked against them. */
  subjectColumn: string;
  erasedAt: string;
  erasedBy: string;
  /** The request it was made under: a ticket, a case id — whatever the tenant's process names. */
  requestRef: string;
  /** False when there was no key to destroy: an erasure is recorded even then. */
  hadKey: boolean;
}

export interface KeyStore {
  /** The tenant's pseudonym key, wrapped. */
  tenantKey(tenantId: string): Promise<Buffer | undefined>;
  /** Store it unless one exists, and return whichever stands — two processes may race to create it. */
  putTenantKeyIfAbsent(tenantId: string, wrapped: Buffer): Promise<Buffer>;

  /** A subject's key, wrapped, by tenant pseudonym. */
  subjectKey(tenantId: string, pseudonym: string): Promise<Buffer | undefined>;
  /** Store it unless one exists, and return whichever stands. */
  putSubjectKeyIfAbsent(tenantId: string, pseudonym: string, wrapped: Buffer): Promise<Buffer>;
  /** Destroy it. True if there was one. */
  deleteSubjectKey(tenantId: string, pseudonym: string): Promise<boolean>;

  appendErasure(record: ErasureRecord): Promise<void>;
  /** Every erasure recorded for the tenant, oldest first; every tenant's when none is named. */
  erasures(tenantId?: string): Promise<ErasureRecord[]>;
}
