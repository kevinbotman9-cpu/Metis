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
  predatesReseed,
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
  /**
   * Run `fn` holding this subject's lock across every process that shares the
   * store (G-160). Optional: a store that runs in one process has nothing to
   * add to the in-process order `DecisionLedger.withSubject` already keeps.
   */
  withSubject?<T>(subjectHash: string, fn: () => Promise<T>): Promise<T>;
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

  /** The tail of each subject's queue in this process. */
  private readonly subjectQueues = new Map<string, Promise<unknown>>();

  /**
   * Run `fn` as the only decision for this customer in flight — G-160, ADR-021 §10.
   *
   * A frequency cap reads the customer's contacts before the engine runs, and
   * the contact is written after it. Two decisions for one customer made at once
   * both read the count before either writes, and both get the last slot: the
   * storefront, deciding its hero and grid together, went over a three-a-day cap
   * on 41 of 64 customer-days in two weeks of visits on 2026-09-18. Whatever
   * reads contacts and writes the contact it makes runs inside this, so the
   * second decision reads the first one's contact.
   *
   * In order within the process, always; and across processes where the store
   * can lock (PostgreSQL, an advisory lock per subject). Different customers
   * never wait for each other. A failure in `fn` is the caller's, and does not
   * stop the next decision for the same customer from running.
   */
  async withSubject<T>(tenantId: string, customerRef: string, fn: () => Promise<T>): Promise<T> {
    const key = subjectHash(tenantId, customerRef);
    const before = this.subjectQueues.get(key) ?? Promise.resolve();
    const run = before.then(
      () => (this.store.withSubject ? this.store.withSubject(key, fn) : fn()),
      () => (this.store.withSubject ? this.store.withSubject(key, fn) : fn())
    );
    const settled = run.then(
      () => undefined,
      () => undefined
    );
    this.subjectQueues.set(key, settled);
    try {
      return await run;
    } finally {
      // The last one out clears the entry, so a customer seen once holds nothing.
      if (this.subjectQueues.get(key) === settled) this.subjectQueues.delete(key);
    }
  }

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

  async get(tenantId: string, decisionId: string): Promise<LedgerEntry | undefined> {
    const entry = await this.store.get(tenantId, decisionId);
    return entry ? currentShape(entry) : undefined;
  }

  async query(q: DecisionQuery): Promise<LedgerEntry[]> {
    return (await this.store.query(q)).map(currentShape);
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
    const decision = await this.get(event.tenantId, event.decisionId);
    if (!decision) {
      throw new LedgerError(
        'OUTCOME_WITHOUT_DECISION',
        `No decision ${event.decisionId} for tenant ${event.tenantId}. ` +
          'An outcome that cannot be joined to a decision measures nothing.'
      );
    }
    // Which offer it was about, checked against what the decision recorded it
    // showed — never the catalogue, which may have moved on (ADR-020 §4). On a
    // decision that showed one offer, an outcome that names none means that
    // one; on one that showed several it must say which, or a click on the
    // second card is credited to the first.
    const slate = decision.record.decision.slate;
    if (event.action === undefined && slate.length > 1) {
      throw new LedgerError(
        'OUTCOME_ACTION_REQUIRED',
        `Decision ${event.decisionId} showed ${slate.length} offers (${slate.map((e) => e.action).join(', ')}). ` +
          'An outcome about it has to name the action it was about.'
      );
    }
    if (event.action !== undefined && !slate.some((e) => e.action === event.action)) {
      throw new LedgerError(
        'OUTCOME_ACTION_NOT_SHOWN',
        `Decision ${event.decisionId} did not show ${event.action}; it showed ${slate.map((e) => e.action).join(', ') || 'nothing'}. ` +
          'An outcome about something the decision did not show is not an outcome of that decision.'
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

/**
 * A ledger entry this code can read faithfully, or a refusal that says why.
 *
 * The reseed of ADR-019, ADR-020 and ADR-022 changed what a decision records:
 * a recorded slate and slot count, and `fieldOrigins` where there was
 * `sourceBindings`. A ledger written before it — a development database
 * somebody clicked into — holds records without them, and every reader here
 * would otherwise throw on a missing slate, or worse, read a missing slate as
 * "showed nothing". Refused instead, naming the record and the way out, which
 * is a reset: a record of the old shape cannot be migrated, because nothing
 * rewrites the append-only table (ADR-019 §7). Asked for by the product owner
 * on 2026-09-18, as the smallest version of the reseed's guard.
 */
export function currentShape(entry: LedgerEntry): LedgerEntry {
  const d = entry.record.decision as unknown as Record<string, unknown>;
  if (Array.isArray(d.slate) && typeof d.slotCount === 'number' && Array.isArray(d.fieldOrigins)) return entry;
  throw predatesReseed(entry.decisionId, entry.tenantId);
}
