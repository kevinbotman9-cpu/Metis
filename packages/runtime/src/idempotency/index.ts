import { hash } from '../deterministic/canonical';
import type { DecisionRequest } from '../deterministic/types';

/**
 * Idempotency for decision execution.
 *
 * §6: *validate tenant, caller, purpose, schema and idempotency key*, and on a
 * duplicate *return the original result for the same tenant, key and canonical
 * request hash*.
 *
 * Two things are deliberately separate here, and conflating them is the bug
 * this is designed around:
 *
 *   - The **key** is a token the caller chose. It says "this is the same
 *     attempt", usually because a retry crossed a timeout.
 *   - The **request hash** is what the decision was actually computed from. It
 *     says "this is the same question".
 *
 * A key with a matching hash is a retry, and the honest answer is the original
 * decision. A key with a *different* hash is a caller bug — the same token
 * reused for a different question — and returning the stored answer would give
 * them a decision about someone else's customer while looking entirely
 * successful. That case is a conflict, loudly.
 */

/**
 * What identifies a request, for idempotency.
 *
 * Everything the decision depends on, and nothing else. `idempotencyKey` is
 * excluded because it is the token being looked up, not part of the question;
 * `correlationId` is excluded because it is tracing metadata that differs on
 * every call, and including it would make every retry look like a new request —
 * which is exactly the failure idempotency exists to prevent.
 *
 * Hashed through the ADR-003 canonicaliser, so two engines agree on what
 * "the same request" means. They have to: a retry that reaches a different
 * instance must resolve the same way.
 */
export function requestHash(request: DecisionRequest): string {
  return hash({
    tenantId: request.tenantId,
    customerId: request.customerId,
    channel: request.channel,
    placement: request.placement,
    occurredAt: request.occurredAt,
    input: request.input,
    // Normalised to null rather than left undefined, so a request that omits
    // the field and one that sends null hash identically. Otherwise a caller
    // switching between the two forms would see spurious conflicts.
    contactHistory: request.contactHistory ?? null,
    consent: request.consent ?? null,
  });
}

export interface IdempotencyRecord {
  /** Scoped per tenant: two tenants may choose the same key. */
  tenantId: string;
  key: string;
  requestHash: string;
  decisionId: string;
  storedAt: string;
}

export type IdempotencyOutcome =
  /** Nothing stored under this key. Execute, then record. */
  | { kind: 'fresh' }
  /** Same key, same question. Return the decision already made. */
  | { kind: 'replay'; record: IdempotencyRecord }
  /** Same key, different question. The caller has a bug. */
  | { kind: 'conflict'; record: IdempotencyRecord; attemptedHash: string };

/**
 * Pure, so the rule can be tested without a store and shared by every store.
 */
export function classify(
  existing: IdempotencyRecord | undefined,
  attemptedHash: string
): IdempotencyOutcome {
  if (!existing) return { kind: 'fresh' };
  if (existing.requestHash === attemptedHash) return { kind: 'replay', record: existing };
  return { kind: 'conflict', record: existing, attemptedHash };
}

export interface IdempotencyStore {
  get(tenantId: string, key: string): Promise<IdempotencyRecord | undefined>;
  /**
   * Record a key for the first time.
   *
   * Returns the record that ended up stored, which is not always the one
   * passed in: under a race, two requests with the same key can both classify
   * as `fresh`, and the store decides which wins. The caller must use what
   * comes back rather than assume its own write landed — otherwise two
   * concurrent retries return two different decision ids for one key, which is
   * the exact thing idempotency promises cannot happen.
   */
  put(record: IdempotencyRecord): Promise<IdempotencyRecord>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  private id(tenantId: string, key: string) {
    // Length-prefixed rather than joined on a separator: a tenant id
    // containing the separator could otherwise collide with another tenant's
    // key, and tenant isolation is not a thing to leave to a delimiter.
    return `${tenantId.length}:${tenantId}:${key}`;
  }

  async get(tenantId: string, key: string): Promise<IdempotencyRecord | undefined> {
    return this.records.get(this.id(tenantId, key));
  }

  async put(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    const id = this.id(record.tenantId, record.key);
    const existing = this.records.get(id);
    // First write wins. Whoever got there first already returned that decision
    // id to a caller, so it is the one that has to stand.
    if (existing) return existing;
    this.records.set(id, record);
    return record;
  }

  /** For tests and `POST /api/_test/reset`. */
  clear(): void {
    this.records.clear();
  }

  get size(): number {
    return this.records.size;
  }
}

export class IdempotencyConflict extends Error {
  readonly status = 409;
  constructor(
    readonly key: string,
    readonly storedHash: string,
    readonly attemptedHash: string
  ) {
    super(
      `Idempotency key "${key}" was already used for a different request. ` +
        `Stored request hash ${storedHash.slice(0, 16)}, this request hashes to ` +
        `${attemptedHash.slice(0, 16)}. Use a new key, or resend the original request.`
    );
    this.name = 'IdempotencyConflict';
  }
}
