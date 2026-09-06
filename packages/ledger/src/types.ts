import type { DecisionRecord } from '@metis/runtime';

/**
 * The durable record of what was decided.
 *
 * §6: *synchronously durably record the minimum decision envelope;
 * asynchronously enrich.* The envelope is what has to survive a crash between
 * deciding and answering — everything a regulator, a replay or a support agent
 * needs to find the decision again.
 *
 * The full engine trace is stored whole, as `jsonb`, for the same reason the
 * registry stores a compiled artifact whole: the chain hash is taken over that
 * exact shape, and decomposing it into columns would put a serialisation
 * between the record and its own hash.
 *
 * The columns beside it are not a second copy of the truth. They are the
 * handful of fields a query needs — you cannot index into `jsonb` and expect
 * §8's "index by tenant, subject and time" to hold.
 */
export interface LedgerEntry {
  tenantId: string;
  /** The engine's decision id. Content-addressed, so it is also the hash. */
  decisionId: string;
  /**
   * A one-way hash of the customer reference.
   *
   * The subject is queryable without the ledger holding the identifier in
   * clear: "every decision about this customer" is a right-of-access request,
   * and answering it should not require the audit store to be a second copy of
   * the customer database.
   */
  subjectHash: string;
  /** From the request, never the clock — the same rule the engine follows. */
  occurredAt: string;
  /** The flow and version that produced it. */
  flowId: string;
  flowVersion: string;
  chainHash: string;
  /** The engine record, whole. */
  record: DecisionRecord;
}

/**
 * Something that happened to a decision afterwards.
 *
 * Storage only. Learning from these is a later gate, and an outcome table that
 * quietly fed a model would be the opposite of the point.
 */
export type OutcomeType = 'impression' | 'click' | 'acceptance' | 'rejection' | 'conversion';

export interface OutcomeEvent {
  tenantId: string;
  decisionId: string;
  type: OutcomeType;
  occurredAt: string;
  /**
   * Realised value in minor units, where the outcome carries one.
   *
   * Null rather than zero when there is none: a click is not a conversion
   * worth nothing, and averaging over zeros would say it was.
   */
  valueMinor: number | null;
  /** Free-form, for whatever the channel reported. Never read by the engine. */
  detail?: Record<string, unknown>;
}

export class LedgerError extends Error {
  constructor(
    readonly code:
      | 'DECISION_NOT_FOUND'
      | 'DECISION_EXISTS'
      | 'OUTCOME_WITHOUT_DECISION',
    message: string
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}
