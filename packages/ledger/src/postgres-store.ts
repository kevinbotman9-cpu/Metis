import type { IdempotencyRecord, IdempotencyStore } from '@metis/runtime';
import type { DecisionQuery, LedgerStore } from './ledger';
import type { LedgerEntry, OutcomeEvent, OutcomeType } from './types';

/**
 * Durable ledger storage.
 *
 * Typed against a minimal `Queryable` rather than against `pg`, so a pool, a
 * pooled client inside a transaction, or a test harness that rolls each case
 * back all satisfy it — the same reasoning as the registry's store.
 *
 * What the schema does that this class does not: reject UPDATE and DELETE on
 * `decision_records` and `outcome_events`, and refuse an idempotency key or an
 * outcome pointing at a decision that does not exist. Enforced only here, both
 * would be conventions.
 */

export interface QueryResult<R> {
  rows: R[];
}

export interface Queryable {
  query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

interface EntryRow {
  tenant_id: string;
  decision_id: string;
  subject_hash: string;
  occurred_at: Date | string;
  flow_id: string;
  flow_version: string;
  chain_hash: string;
  record: unknown;
}

interface OutcomeRow {
  tenant_id: string;
  decision_id: string;
  type: string;
  occurred_at: Date | string;
  value_minor: string | number | null;
  detail: unknown;
}

/**
 * `pg` returns timestamps as `Date`; some pools return strings.
 *
 * The domain carries ISO strings because that is what the engine and the
 * canonical hasher work in, and a `Date` would reintroduce a timezone-shaped
 * ambiguity into something that has to compare exactly.
 */
function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: Queryable) {}

  async get(tenantId: string, key: string): Promise<IdempotencyRecord | undefined> {
    const { rows } = await this.db.query<{
      tenant_id: string;
      key: string;
      request_hash: string;
      decision_id: string;
      stored_at: Date | string;
    }>(
      `SELECT tenant_id, key, request_hash, decision_id, stored_at
         FROM idempotency_keys WHERE tenant_id = $1 AND key = $2`,
      [tenantId, key]
    );
    const r = rows[0];
    return r
      ? {
          tenantId: r.tenant_id,
          key: r.key,
          requestHash: r.request_hash,
          decisionId: r.decision_id,
          storedAt: iso(r.stored_at),
        }
      : undefined;
  }

  async put(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    // ON CONFLICT DO NOTHING plus a read-back, so the first writer wins and the
    // loser learns which decision id actually stands. Two concurrent retries
    // must not walk away with two different ids for one key.
    await this.db.query(
      `INSERT INTO idempotency_keys (tenant_id, key, request_hash, decision_id, stored_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, key) DO NOTHING`,
      [record.tenantId, record.key, record.requestHash, record.decisionId, record.storedAt]
    );
    return (await this.get(record.tenantId, record.key)) ?? record;
  }
}

export class PostgresLedgerStore implements LedgerStore {
  readonly idempotency: IdempotencyStore;

  constructor(private readonly db: Queryable) {
    this.idempotency = new PostgresIdempotencyStore(db);
  }

  async get(tenantId: string, decisionId: string): Promise<LedgerEntry | undefined> {
    const { rows } = await this.db.query<EntryRow>(
      `SELECT tenant_id, decision_id, subject_hash, occurred_at, flow_id, flow_version,
              chain_hash, record
         FROM decision_records WHERE tenant_id = $1 AND decision_id = $2`,
      [tenantId, decisionId]
    );
    return rows[0] ? this.toEntry(rows[0]) : undefined;
  }

  async put(entry: LedgerEntry): Promise<void> {
    // No ON CONFLICT. The ledger checks first, and a race that got past it
    // should fail loudly rather than silently keep one of two records — which
    // the UPDATE trigger would refuse anyway, but a unique violation is the
    // clearer error.
    await this.db.query(
      `INSERT INTO decision_records
         (tenant_id, decision_id, subject_hash, occurred_at, flow_id, flow_version, chain_hash, record)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        entry.tenantId,
        entry.decisionId,
        entry.subjectHash,
        entry.occurredAt,
        entry.flowId,
        entry.flowVersion,
        entry.chainHash,
        JSON.stringify(entry.record),
      ]
    );
  }

  async query(q: DecisionQuery): Promise<LedgerEntry[]> {
    const values: unknown[] = [q.tenantId];
    const where = ['tenant_id = $1'];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      where.push(clause.replace('$?', `$${values.length}`));
    };
    if (q.subjectHash) add('subject_hash = $?', q.subjectHash);
    if (q.flowId) add('flow_id = $?', q.flowId);
    if (q.from) add('occurred_at >= $?', q.from);
    if (q.to) add('occurred_at <= $?', q.to);

    let sql =
      `SELECT tenant_id, decision_id, subject_hash, occurred_at, flow_id, flow_version,
              chain_hash, record
         FROM decision_records
        WHERE ${where.join(' AND ')}
        ORDER BY occurred_at DESC, decision_id ASC`;

    if (q.limit !== undefined) {
      values.push(q.limit);
      sql += ` LIMIT $${values.length}`;
    }

    const { rows } = await this.db.query<EntryRow>(sql, values);
    return rows.map((r) => this.toEntry(r));
  }

  private toEntry(r: EntryRow): LedgerEntry {
    return {
      tenantId: r.tenant_id,
      decisionId: r.decision_id,
      subjectHash: r.subject_hash,
      occurredAt: iso(r.occurred_at),
      flowId: r.flow_id,
      flowVersion: r.flow_version,
      chainHash: r.chain_hash,
      record: r.record as LedgerEntry['record'],
    };
  }

  async appendOutcome(event: OutcomeEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO outcome_events (tenant_id, decision_id, type, occurred_at, value_minor, detail)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        event.tenantId,
        event.decisionId,
        event.type,
        event.occurredAt,
        event.valueMinor,
        event.detail ? JSON.stringify(event.detail) : null,
      ]
    );
  }

  async outcomesFor(tenantId: string, decisionId: string): Promise<OutcomeEvent[]> {
    const { rows } = await this.db.query<OutcomeRow>(
      `SELECT tenant_id, decision_id, type, occurred_at, value_minor, detail
         FROM outcome_events
        WHERE tenant_id = $1 AND decision_id = $2
        ORDER BY seq ASC`,
      [tenantId, decisionId]
    );
    return rows.map((r) => ({
      tenantId: r.tenant_id,
      decisionId: r.decision_id,
      type: r.type as OutcomeType,
      occurredAt: iso(r.occurred_at),
      // bigint arrives as a string from `pg`, because it does not fit a JS
      // number in general. These are minor units and do fit, but the parse has
      // to be explicit rather than accidental.
      valueMinor: r.value_minor === null ? null : Number(r.value_minor),
      ...(r.detail ? { detail: r.detail as Record<string, unknown> } : {}),
    }));
  }
}
