import type { ErasureRecord, KeyStore } from './types';

/**
 * The key store in memory, for development and tests.
 *
 * No `await` between a check and the write that depends on it, so two callers
 * in one process cannot both create a key for the same subject.
 */
export class InMemoryKeyStore implements KeyStore {
  private readonly tenants = new Map<string, Buffer>();
  private readonly subjects = new Map<string, Buffer>();
  private readonly log: ErasureRecord[] = [];

  private id(tenantId: string, pseudonym: string): string {
    return `${tenantId.length}:${tenantId}:${pseudonym}`;
  }

  async tenantKey(tenantId: string): Promise<Buffer | undefined> {
    return this.tenants.get(tenantId);
  }

  async putTenantKeyIfAbsent(tenantId: string, wrapped: Buffer): Promise<Buffer> {
    const existing = this.tenants.get(tenantId);
    if (existing) return existing;
    this.tenants.set(tenantId, wrapped);
    return wrapped;
  }

  async subjectKey(tenantId: string, pseudonym: string): Promise<Buffer | undefined> {
    return this.subjects.get(this.id(tenantId, pseudonym));
  }

  async putSubjectKeyIfAbsent(tenantId: string, pseudonym: string, wrapped: Buffer): Promise<Buffer> {
    const key = this.id(tenantId, pseudonym);
    const existing = this.subjects.get(key);
    if (existing) return existing;
    this.subjects.set(key, wrapped);
    return wrapped;
  }

  async deleteSubjectKey(tenantId: string, pseudonym: string): Promise<boolean> {
    return this.subjects.delete(this.id(tenantId, pseudonym));
  }

  async appendErasure(record: ErasureRecord): Promise<void> {
    this.log.push({ ...record });
  }

  async erasures(tenantId?: string): Promise<ErasureRecord[]> {
    return this.log.filter((r) => tenantId === undefined || r.tenantId === tenantId).map((r) => ({ ...r }));
  }
}
