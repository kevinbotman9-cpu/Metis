import { InMemoryIdempotencyStore, type IdempotencyStore } from '@metis/runtime';
import type { DecisionQuery, LedgerStore } from './ledger';
import type { LedgerEntry, OutcomeEvent } from './types';

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

  async query(q: DecisionQuery): Promise<LedgerEntry[]> {
    let rows = [...this.entries.values()].filter((e) => e.tenantId === q.tenantId);
    if (q.subjectHash) rows = rows.filter((e) => e.subjectHash === q.subjectHash);
    if (q.flowId) rows = rows.filter((e) => e.flowId === q.flowId);
    if (q.from) rows = rows.filter((e) => e.occurredAt >= q.from!);
    if (q.to) rows = rows.filter((e) => e.occurredAt <= q.to!);
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

  async outcomesFor(tenantId: string, decisionId: string): Promise<OutcomeEvent[]> {
    return this.outcomes.filter((o) => o.tenantId === tenantId && o.decisionId === decisionId);
  }

  /** For tests and the development reset endpoint. */
  clear(): void {
    this.entries.clear();
    this.outcomes.length = 0;
    (this.idempotency as InMemoryIdempotencyStore).clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
