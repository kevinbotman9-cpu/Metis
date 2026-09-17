import type { IdempotencyRecord, IdempotencyStore } from '@metis/runtime';
import type { DecisionQuery, LedgerStore } from './ledger';
import {
  CONTACT_STATES,
  CONTACT_WINDOW_MS,
  type ContactCounts,
  type ContactQuery,
  type DeliveryAttempt,
  type DeliveryState,
  type LedgerEntry,
  type OutcomeEvent,
  type OutcomeType,
} from './types';

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

interface DeliveryRow {
  tenant_id: string;
  decision_id: string;
  placement_key: string;
  channel: string;
  state: DeliveryState;
  at: Date | string;
  reason: string | null;
  permanent: boolean | null;
  provider_ref: string | null;
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

  /**
   * The filters, built once for `query` and `count`.
   *
   * Channel and winner are read out of the stored record rather than copied
   * into columns: the record is the decision, and a column beside it would be a
   * second copy to keep true. `002_decision_search.sql` indexes the same two
   * expressions, so these reads use an index rather than every row.
   */
  private filters(q: DecisionQuery): { where: string[]; values: unknown[] } {
    const values: unknown[] = [q.tenantId];
    const where = ['tenant_id = $1'];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      where.push(clause.replace('$?', `$${values.length}`));
    };
    if (q.subjectHash) add('subject_hash = $?', q.subjectHash);
    if (q.flowId) add('flow_id = $?', q.flowId);
    if (q.channel) add("(record->'decision'->>'channel') = $?", q.channel);
    if (q.action) add("(record->'decision'->>'winner') = $?", q.action);
    if (q.outcome === 'offered') where.push("(record->'decision'->>'winner') IS NOT NULL");
    if (q.outcome === 'suppressed') where.push("(record->'decision'->>'winner') IS NULL");
    if (q.from) add('occurred_at >= $?', q.from);
    if (q.to) add('occurred_at <= $?', q.to);
    return { where, values };
  }

  async count(q: DecisionQuery): Promise<number> {
    const { where, values } = this.filters(q);
    const { rows } = await this.db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM decision_records WHERE ${where.join(' AND ')}`,
      values
    );
    return Number(rows[0]?.n ?? 0);
  }

  async query(q: DecisionQuery): Promise<LedgerEntry[]> {
    const { where, values } = this.filters(q);

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

  async appendDelivery(attempt: DeliveryAttempt, subjectHash: string): Promise<void> {
    await this.db.query(
      `INSERT INTO delivery_attempts
         (tenant_id, decision_id, placement_key, channel, state, at, reason, permanent, provider_ref, subject_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        attempt.tenantId,
        attempt.decisionId,
        attempt.placementKey,
        attempt.channel,
        attempt.state,
        attempt.at,
        attempt.reason,
        attempt.permanent,
        attempt.providerRef,
        subjectHash,
      ]
    );
  }

  /**
   * One statement, over `delivery_attempts_by_subject`
   * (`003_delivery_subject.sql`).
   *
   * An attempt written before that migration carries no subject and is not
   * counted: the append-only trigger refuses the UPDATE a backfill would need,
   * and every ledger that holds such rows is synthetic and reset rather than
   * migrated (ADR-019 §7, ADR-021 §1).
   */
  async countContacts(q: ContactQuery): Promise<ContactCounts> {
    const until = Date.parse(q.until);
    const since = (period: keyof ContactCounts) => new Date(until - CONTACT_WINDOW_MS[period]).toISOString();
    const { rows } = await this.db.query<{ day: string; week: string; month: string }>(
      `SELECT count(*) FILTER (WHERE first_at > $5)::text AS day,
              count(*) FILTER (WHERE first_at > $6)::text AS week,
              count(*) FILTER (WHERE first_at > $7)::text AS month
         FROM (
           SELECT a.decision_id, min(a.at) AS first_at
             FROM delivery_attempts a
             JOIN decision_records r
               ON r.tenant_id = a.tenant_id AND r.decision_id = a.decision_id
            WHERE a.tenant_id = $1
              AND a.subject_hash = $2
              AND a.channel = $3
              AND a.state = ANY($8::text[])
              AND a.at <= $4
              AND (r.record->'decision'->>'winner') IS NOT NULL
              AND ($9::text[] IS NULL OR (r.record->'decision'->>'winnerOfferId') = ANY($9::text[]))
            GROUP BY a.decision_id
         ) contacts`,
      [
        q.tenantId,
        q.subjectHash,
        q.channel,
        q.until,
        since('day'),
        since('week'),
        since('month'),
        [...CONTACT_STATES],
        q.offerIds ? [...q.offerIds] : null,
      ]
    );
    const r = rows[0];
    return { day: Number(r?.day ?? 0), week: Number(r?.week ?? 0), month: Number(r?.month ?? 0) };
  }

  async deliveriesFor(tenantId: string, decisionId: string): Promise<DeliveryAttempt[]> {
    const { rows } = await this.db.query<DeliveryRow>(
      `SELECT tenant_id, decision_id, placement_key, channel, state, at, reason, permanent, provider_ref
         FROM delivery_attempts
        WHERE tenant_id = $1 AND decision_id = $2
        ORDER BY seq ASC`,
      [tenantId, decisionId]
    );
    return rows.map((r) => ({
      tenantId: r.tenant_id,
      decisionId: r.decision_id,
      placementKey: r.placement_key,
      channel: r.channel,
      state: r.state,
      at: typeof r.at === 'string' ? r.at : new Date(r.at).toISOString(),
      reason: r.reason,
      permanent: r.permanent,
      providerRef: r.provider_ref,
    }));
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
