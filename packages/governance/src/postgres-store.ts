import { GovernanceError, type AuditEvent, type ChangeSet, type GovernanceStore } from './types';

/**
 * Governance on PostgreSQL.
 *
 * Takes a `Queryable` rather than a `Pool`, like the other stores: the caller
 * owns the connection lifecycle.
 */
export interface Queryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

/** A unique violation, which is how PostgreSQL says an id is taken. */
const isUniqueViolation = (e: unknown) => (e as { code?: string }).code === '23505';

export class PostgresGovernanceStore implements GovernanceStore {
  constructor(private readonly db: Queryable) {}

  async listTenants(): Promise<string[]> {
    const { rows } = await this.db.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM governance_change_sets
       UNION SELECT tenant_id FROM governance_audit_events
       ORDER BY tenant_id`
    );
    return rows.map((r) => r.tenant_id);
  }

  async getChangeSet(tenantId: string, id: string): Promise<ChangeSet | undefined> {
    const { rows } = await this.db.query<{ body: ChangeSet }>(
      'SELECT body FROM governance_change_sets WHERE tenant_id = $1 AND id = $2',
      [tenantId, id]
    );
    return rows[0]?.body;
  }

  async listChangeSets(tenantId: string): Promise<ChangeSet[]> {
    const { rows } = await this.db.query<{ body: ChangeSet }>(
      `SELECT body FROM governance_change_sets WHERE tenant_id = $1
       ORDER BY requested_at DESC, id DESC`,
      [tenantId]
    );
    return rows.map((r) => r.body);
  }

  async insertChangeSet(tenantId: string, changeSet: ChangeSet): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO governance_change_sets (tenant_id, id, status, requested_at, body)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, changeSet.id, changeSet.status, changeSet.requestedAt, JSON.stringify(changeSet)]
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new GovernanceError('DUPLICATE_CHANGE_SET', `Change set ${changeSet.id} already exists.`);
      }
      throw e;
    }
  }

  async decideChangeSet(tenantId: string, decided: ChangeSet): Promise<boolean> {
    // One statement: the pending check and the write are the same moment, so
    // the loser of two concurrent decisions updates no row rather than
    // overwriting the winner. The trigger refuses the rest.
    const { rowCount } = await this.db.query(
      `UPDATE governance_change_sets SET status = $3, body = $4
        WHERE tenant_id = $1 AND id = $2 AND status = 'pending'`,
      [tenantId, decided.id, decided.status, JSON.stringify(decided)]
    );
    return rowCount === 1;
  }

  async appendAuditEvent(tenantId: string, event: AuditEvent): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO governance_audit_events (tenant_id, id, occurred_at, body)
         VALUES ($1, $2, $3, $4)`,
        [tenantId, event.id, event.timestamp, JSON.stringify(event)]
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new GovernanceError('DUPLICATE_EVENT', `Audit event ${event.id} already exists.`);
      }
      throw e;
    }
  }

  async listAuditEvents(tenantId: string, options?: { limit?: number }): Promise<AuditEvent[]> {
    const { rows } = await this.db.query<{ body: AuditEvent }>(
      `SELECT body FROM governance_audit_events WHERE tenant_id = $1
       ORDER BY seq DESC
       LIMIT $2`,
      [tenantId, options?.limit ?? null]
    );
    return rows.map((r) => r.body);
  }

  async countAuditEvents(tenantId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: string }>(
      'SELECT count(*) AS n FROM governance_audit_events WHERE tenant_id = $1',
      [tenantId]
    );
    return Number(rows[0].n);
  }
}
