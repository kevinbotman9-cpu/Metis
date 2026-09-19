import type { ErasureRecord, KeyStore } from './types';

/** A pool, or a client inside a transaction: anything that can run one statement. */
export interface Queryable {
  query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

type ErasureRow = {
  tenant_id: string;
  pseudonym: string;
  subject_column: string;
  erased_at: Date | string;
  erased_by: string;
  request_ref: string;
  had_key: boolean;
};

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

/**
 * The key store in PostgreSQL — `001_keys.sql`.
 *
 * "If absent" is one statement, `ON CONFLICT DO NOTHING` plus a read-back, so two
 * processes creating a key for the same subject at once both end up holding the
 * one that was written.
 */
export class PostgresKeyStore implements KeyStore {
  constructor(private readonly db: Queryable) {}

  async tenantKey(tenantId: string): Promise<Buffer | undefined> {
    const { rows } = await this.db.query<{ pseudonym_key: Buffer }>(
      'SELECT pseudonym_key FROM key_tenants WHERE tenant_id = $1',
      [tenantId]
    );
    return rows[0]?.pseudonym_key;
  }

  async putTenantKeyIfAbsent(tenantId: string, wrapped: Buffer): Promise<Buffer> {
    await this.db.query(
      'INSERT INTO key_tenants (tenant_id, pseudonym_key) VALUES ($1, $2) ON CONFLICT (tenant_id) DO NOTHING',
      [tenantId, wrapped]
    );
    return (await this.tenantKey(tenantId)) ?? wrapped;
  }

  async subjectKey(tenantId: string, pseudonym: string): Promise<Buffer | undefined> {
    const { rows } = await this.db.query<{ wrapped: Buffer }>(
      'SELECT wrapped FROM subject_keys WHERE tenant_id = $1 AND pseudonym = $2',
      [tenantId, pseudonym]
    );
    return rows[0]?.wrapped;
  }

  async putSubjectKeyIfAbsent(tenantId: string, pseudonym: string, wrapped: Buffer): Promise<Buffer> {
    await this.db.query(
      `INSERT INTO subject_keys (tenant_id, pseudonym, wrapped) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, pseudonym) DO NOTHING`,
      [tenantId, pseudonym, wrapped]
    );
    return (await this.subjectKey(tenantId, pseudonym)) ?? wrapped;
  }

  async deleteSubjectKey(tenantId: string, pseudonym: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      'DELETE FROM subject_keys WHERE tenant_id = $1 AND pseudonym = $2',
      [tenantId, pseudonym]
    );
    return (rowCount ?? 0) > 0;
  }

  async appendErasure(r: ErasureRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO erasures (tenant_id, pseudonym, subject_column, erased_at, erased_by, request_ref, had_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [r.tenantId, r.pseudonym, r.subjectColumn, r.erasedAt, r.erasedBy, r.requestRef, r.hadKey]
    );
  }

  async erasures(tenantId?: string): Promise<ErasureRecord[]> {
    const { rows } = await this.db.query<ErasureRow>(
      `SELECT tenant_id, pseudonym, subject_column, erased_at, erased_by, request_ref, had_key
         FROM erasures WHERE ($1::text IS NULL OR tenant_id = $1) ORDER BY seq`,
      [tenantId ?? null]
    );
    return rows.map((r) => ({
      tenantId: r.tenant_id,
      pseudonym: r.pseudonym,
      subjectColumn: r.subject_column,
      erasedAt: iso(r.erased_at),
      erasedBy: r.erased_by,
      requestRef: r.request_ref,
      hadKey: r.had_key,
    }));
  }
}
