import { createHash } from 'node:crypto';
import type { DecisionRecord } from '@metis/runtime';
import {
  type IdempotencyRecord,
  type IdempotencyStore,
  classify,
  requestHash,
} from '@metis/runtime';
import type { DecisionRequest } from '@metis/runtime';
import {
  LedgerError,
  type ContactCounts,
  type ContactQuery,
  type DeliveryAttempt,
  type LedgerEntry,
  type OutcomeEvent,
} from './types';

/**
 * The decision ledger.
 *
 * Same shape as the artifact registry, deliberately: the rules live here, the
 * store only persists, and one behaviour suite runs against both stores. That
 * is what makes "durable storage changes nothing" a checked claim rather than
 * an assurance.
 *
 * Append-only, in the strong sense. A decision record is a statement about
 * something that happened; correcting it means recording a new decision, never
 * editing the old one. The PostgreSQL schema enforces that with triggers as
 * well, because immutability that lives only in application code survives
 * exactly until somebody writes a migration script.
 */

export interface DecisionQuery {
  tenantId: string;
  /** Hash, not the raw reference — the caller hashes with `subjectHash`. */
  subjectHash?: string;
  flowId?: string;
  /** The channel the decision was made for. */
  channel?: string;
  /** The winning action's key. A decision that offered nothing matches nothing. */
  action?: string;
  /**
   * Whether an offer was made.
   *
   * `offered` is a winner, `suppressed` is none. Kept apart from `action`
   * because "anything won" and "this won" are different questions, and a screen
   * asks the first far more often.
   */
  outcome?: 'offered' | 'suppressed';
  /** Inclusive. */
  from?: string;
  /** Inclusive. */
  to?: string;
  limit?: number;
}

export interface LedgerStore {
  get(tenantId: string, decisionId: string): Promise<LedgerEntry | undefined>;
  put(entry: LedgerEntry): Promise<void>;
  query(q: DecisionQuery): Promise<LedgerEntry[]>;
  /** How many decisions match, ignoring `limit`: a page needs its total. */
  count(q: DecisionQuery): Promise<number>;
  appendOutcome(event: OutcomeEvent): Promise<void>;
  outcomesFor(tenantId: string, decisionId: string): Promise<OutcomeEvent[]>;
  /**
   * `subjectHash` is the decision's, passed by the ledger, which has just read
   * it: an attempt carries the subject so a cap can count one customer's
   * contacts without reading every decision they were part of (ADR-021 §1).
   */
  appendDelivery(attempt: DeliveryAttempt, subjectHash: string): Promise<void>;
  deliveriesFor(tenantId: string, decisionId: string): Promise<DeliveryAttempt[]>;
  /**
   * The one query frequency caps read (ADR-021 §1): distinct decisions that
   * offered something and were handed over on this channel to this subject,
   * per rolling window ending at `until`. A decision counts at its first
   * contact attempt.
   */
  countContacts(q: ContactQuery): Promise<ContactCounts>;
  idempotency: IdempotencyStore;
}

/**
 * One-way, and salted per tenant.
 *
 * Without the tenant in the digest, the same customer reference hashes
 * identically everywhere, and two tenants could confirm they share a customer
 * by comparing ledgers. Cheap to prevent, awkward to explain afterwards.
 */
export function subjectHash(tenantId: string, customerRef: string): string {
  return createHash('sha256').update(`${tenantId.length}:${tenantId}:${customerRef}`).digest('hex');
}

export class DecisionLedger {
  constructor(private readonly store: LedgerStore) {}

  /**
   * Record a decision.
   *
   * Refuses to overwrite. Two decisions cannot share an id — the id is a
   * content hash — so an existing entry means either the same decision arriving
   * twice, which is a no-op, or a genuine collision, which is a bug worth
   * hearing about rather than resolving by silently keeping one.
   */
  async record(entry: LedgerEntry): Promise<LedgerEntry> {
    const existing = await this.store.get(entry.tenantId, entry.decisionId);
    if (existing) {
      if (existing.chainHash === entry.chainHash) return existing;
      throw new LedgerError(
        'DECISION_EXISTS',
        `Decision ${entry.decisionId} is already recorded with a different chain hash. ` +
          `Stored ${existing.chainHash.slice(0, 16)}, offered ${entry.chainHash.slice(0, 16)}. ` +
          'A decision id is a content hash, so this is a collision, not a retry.'
      );
    }
    await this.store.put(entry);
    return entry;
  }

  /** Build an entry from what the engine produced. */
  entryFor(record: DecisionRecord, tenantId: string): LedgerEntry {
    return {
      tenantId,
      decisionId: record.id,
      subjectHash: subjectHash(tenantId, record.decision.customerRef),
      occurredAt: record.decision.occurredAt,
      flowId: record.decision.artifactId,
      flowVersion: record.decision.artifactVersion,
      chainHash: record.chainHash,
      record,
    };
  }

  get(tenantId: string, decisionId: string): Promise<LedgerEntry | undefined> {
    return this.store.get(tenantId, decisionId);
  }

  query(q: DecisionQuery): Promise<LedgerEntry[]> {
    return this.store.query(q);
  }

  /**
   * How many decisions match, before `limit`.
   *
   * A screen that counted its page would report the page size as the total, and
   * a reader cannot tell the two apart — which `/decisions` did twice before
   * the search moved here.
   */
  count(q: DecisionQuery): Promise<number> {
    return this.store.count(q);
  }

  /**
   * Record an outcome against a decision.
   *
   * The decision must exist. An outcome for a decision nobody made is either a
   * mis-routed event or a mis-typed id, and storing it would put a row in the
   * ledger that can never be joined to anything — the kind of orphan that is
   * discovered years later when someone tries to measure uplift.
   */
  async recordOutcome(event: OutcomeEvent): Promise<void> {
    const decision = await this.store.get(event.tenantId, event.decisionId);
    if (!decision) {
      throw new LedgerError(
        'OUTCOME_WITHOUT_DECISION',
        `No decision ${event.decisionId} for tenant ${event.tenantId}. ` +
          'An outcome that cannot be joined to a decision measures nothing.'
      );
    }
    await this.store.appendOutcome(event);
  }

  outcomesFor(tenantId: string, decisionId: string): Promise<OutcomeEvent[]> {
    return this.store.outcomesFor(tenantId, decisionId);
  }

  /**
   * Record what the platform did about delivering a decision.
   *
   * Held to the same invariant as `recordOutcome` and for the same reason: an
   * attempt that cannot be joined to a decision describes nothing, and the
   * binding is the decision id alone (ADR-008 §2). A delivery reconstructed
   * from customer and time would be a guess presented as a record.
   */
  async recordDelivery(attempt: DeliveryAttempt): Promise<void> {
    const decision = await this.store.get(attempt.tenantId, attempt.decisionId);
    if (!decision) {
      throw new LedgerError(
        'DELIVERY_WITHOUT_DECISION',
        `No decision ${attempt.decisionId} for tenant ${attempt.tenantId}. ` +
          'A delivery attempt that cannot be joined to a decision records nothing.'
      );
    }
    await this.store.appendDelivery(attempt, decision.subjectHash);
  }

  deliveriesFor(tenantId: string, decisionId: string): Promise<DeliveryAttempt[]> {
    return this.store.deliveriesFor(tenantId, decisionId);
  }

  /**
   * How often this customer has been contacted on this channel, per period,
   * before a decision at `until`. Takes the customer reference and hashes it
   * here, so no caller has to know how the ledger keys a subject.
   */
  contactsFor(q: Omit<ContactQuery, 'subjectHash'> & { customerRef: string }): Promise<ContactCounts> {
    const { customerRef, ...rest } = q;
    return this.store.countContacts({ ...rest, subjectHash: subjectHash(q.tenantId, customerRef) });
  }

  // --- Idempotency ---------------------------------------------------------

  /**
   * Resolve an idempotency key before executing.
   *
   * The rule is `@metis/runtime`'s; what changes here is that the store is
   * durable, so a retry that arrives after a restart still finds its original
   * decision. That is the whole reason this moved out of process memory.
   */
  async resolve(request: DecisionRequest): Promise<
    | { kind: 'fresh'; hash: string }
    | { kind: 'replay'; entry: LedgerEntry }
    | { kind: 'conflict'; storedHash: string; attemptedHash: string }
  > {
    const key = request.idempotencyKey;
    const hash = requestHash(request);
    if (!key) return { kind: 'fresh', hash };

    const outcome = classify(await this.store.idempotency.get(request.tenantId, key), hash);
    if (outcome.kind === 'fresh') return { kind: 'fresh', hash };
    if (outcome.kind === 'conflict') {
      return {
        kind: 'conflict',
        storedHash: outcome.record.requestHash,
        attemptedHash: outcome.attemptedHash,
      };
    }

    const entry = await this.store.get(request.tenantId, outcome.record.decisionId);
    if (!entry) {
      // The key survived but the decision did not. Treating this as fresh
      // would hand out a second decision under a key that already promised
      // one; the ledger is append-only, so this means something deleted a row
      // the schema says cannot be deleted.
      throw new LedgerError(
        'DECISION_NOT_FOUND',
        `Idempotency key "${key}" points at decision ${outcome.record.decisionId}, ` +
          'which is not in the ledger. The ledger is append-only, so this is corruption.'
      );
    }
    return { kind: 'replay', entry };
  }

  /**
   * Claim a key for a decision just recorded.
   *
   * Returns the record that ended up stored, which under a race is not always
   * the one passed in. The caller must use what comes back.
   */
  claim(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    return this.store.idempotency.put(record);
  }
}
