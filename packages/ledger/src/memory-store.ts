import { InMemoryIdempotencyStore, type IdempotencyStore } from '@metis/runtime';
import type { DecisionQuery, LedgerStore } from './ledger';
import {
  CONTACT_STATES,
  CONTACT_WINDOW_MS,
  type ContactCounts,
  type ContactQuery,
  type DeliveryAttempt,
  type LedgerEntry,
  type OutcomeEvent,
} from './types';

/**
 * In-memory ledger.
 *
 * Loses everything on restart, which is fine for a developer running the
 * console for five minutes and is the reason `createLedgerStore` says so out
 * loud when it picks this one.
 *
 * It still enforces append-only, because the behaviour suite runs against both
 * stores: if this one allowed an overwrite that PostgreSQL's triggers refuse,
 * the suite would pass here and fail there, which is exactly the drift running
 * one suite against two stores exists to catch.
 */
export class InMemoryLedgerStore implements LedgerStore {
  private readonly entries = new Map<string, LedgerEntry>();
  private readonly outcomes: OutcomeEvent[] = [];
  private readonly deliveries: { attempt: DeliveryAttempt; subjectHash: string }[] = [];
  private readonly bySubject = new Map<string, { attempt: DeliveryAttempt; subjectHash: string }[]>();
  readonly idempotency: IdempotencyStore = new InMemoryIdempotencyStore();

  // Length-prefixed, like the idempotency store: a tenant id containing the
  // separator must not be able to address another tenant's rows.
  private id(tenantId: string, decisionId: string) {
    return `${tenantId.length}:${tenantId}:${decisionId}`;
  }

  async get(tenantId: string, decisionId: string): Promise<LedgerEntry | undefined> {
    return this.entries.get(this.id(tenantId, decisionId));
  }

  async put(entry: LedgerEntry): Promise<void> {
    const key = this.id(entry.tenantId, entry.decisionId);
    if (this.entries.has(key)) {
      // The ledger checks this before calling, so reaching here is a race.
      // Refusing rather than overwriting matches what the triggers do.
      throw new Error(`Decision ${entry.decisionId} is already recorded (append-only).`);
    }
    this.entries.set(key, entry);
  }

  /** Every filter in one place, so `query` and `count` cannot answer differently. */
  private matching(q: DecisionQuery): LedgerEntry[] {
    let rows = [...this.entries.values()].filter((e) => e.tenantId === q.tenantId);
    if (q.subjectHash) rows = rows.filter((e) => e.subjectHash === q.subjectHash);
    if (q.flowId) rows = rows.filter((e) => e.flowId === q.flowId);
    if (q.channel) rows = rows.filter((e) => e.record.decision.channel === q.channel);
    if (q.action) rows = rows.filter((e) => e.record.decision.winner === q.action);
    if (q.outcome === 'offered') rows = rows.filter((e) => e.record.decision.winner !== null);
    if (q.outcome === 'suppressed') rows = rows.filter((e) => e.record.decision.winner === null);
    if (q.from) rows = rows.filter((e) => e.occurredAt >= q.from!);
    if (q.to) rows = rows.filter((e) => e.occurredAt <= q.to!);
    return rows;
  }

  async count(q: DecisionQuery): Promise<number> {
    return this.matching(q).length;
  }

  async query(q: DecisionQuery): Promise<LedgerEntry[]> {
    const rows = this.matching(q);
    // Newest first, then by id so equal timestamps never reorder between calls.
    rows.sort((a, b) =>
      a.occurredAt === b.occurredAt
        ? a.decisionId.localeCompare(b.decisionId)
        : b.occurredAt.localeCompare(a.occurredAt)
    );
    return q.limit === undefined ? rows : rows.slice(0, q.limit);
  }

  async appendOutcome(event: OutcomeEvent): Promise<void> {
    this.outcomes.push(event);
  }

  async appendDelivery(attempt: DeliveryAttempt, subjectHash: string): Promise<void> {
    const row = { attempt, subjectHash };
    this.deliveries.push(row);
    // The in-memory counterpart of `delivery_attempts_by_subject`: a cap reads
    // one customer's attempts on one channel, and a scan of every attempt was
    // most of the read's 5ms budget over a corpus-sized history.
    const key = this.subjectKey(attempt.tenantId, subjectHash, attempt.channel);
    const bucket = this.bySubject.get(key);
    if (bucket) bucket.push(row);
    else this.bySubject.set(key, [row]);
  }

  private subjectKey(tenantId: string, subjectHash: string, channel: string) {
    return `${tenantId.length}:${tenantId}:${subjectHash}:${channel}`;
  }

  async deliveriesFor(tenantId: string, decisionId: string): Promise<DeliveryAttempt[]> {
    return this.deliveries
      .filter(({ attempt: d }) => d.tenantId === tenantId && d.decisionId === decisionId)
      .map(({ attempt }) => attempt);
  }

  async countContacts(q: ContactQuery): Promise<ContactCounts> {
    // The same rule as the SQL in `postgres-store.ts`, written the same way, so
    // the suite that runs against both can tell if they part company.
    const until = Date.parse(q.until);
    const firstContact = new Map<string, number>();
    for (const { attempt: a } of this.bySubject.get(this.subjectKey(q.tenantId, q.subjectHash, q.channel)) ?? []) {
      if (!CONTACT_STATES.includes(a.state)) continue;
      const at = Date.parse(a.at);
      if (at > until) continue;
      const decision = this.entries.get(this.id(a.tenantId, a.decisionId));
      if (!decision || decision.record.decision.winner === null) continue;
      const seen = firstContact.get(a.decisionId);
      if (seen === undefined || at < seen) firstContact.set(a.decisionId, at);
    }
    const within = (period: keyof ContactCounts) =>
      [...firstContact.values()].filter((at) => at > until - CONTACT_WINDOW_MS[period]).length;
    return { day: within('day'), week: within('week'), month: within('month') };
  }

  async outcomesFor(tenantId: string, decisionId: string): Promise<OutcomeEvent[]> {
    return this.outcomes.filter((o) => o.tenantId === tenantId && o.decisionId === decisionId);
  }

  /** For tests and the development reset endpoint. */
  clear(): void {
    this.entries.clear();
    this.outcomes.length = 0;
    this.deliveries.length = 0;
    this.bySubject.clear();
    (this.idempotency as InMemoryIdempotencyStore).clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
