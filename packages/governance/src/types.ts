/**
 * Change sets, their decisions, and the audit log.
 *
 * The shapes the console has served since before they were stored anywhere:
 * `ChangeSet` is the approval interface, like a pull request, and `AuditEvent`
 * is one line of who did what. They moved here from the console's fixtures on
 * 2026-09-14 so a store could own them.
 */

export type ChangeSetStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/** The three outcomes a pending change set can be given. */
export type ChangeSetDecision = Exclude<ChangeSetStatus, 'pending'>;

export interface ChangeSet {
  id: string;
  title: string;
  description: string;
  status: ChangeSetStatus;
  /** 1 = manual, 2 = bounded, 3 = autonomous. */
  autonomyTier: 1 | 2 | 3;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  targetScope: { level: string; targetId: string | null };
  changeType: string;
  diff: { field: string; before: string; after: string }[];
  simulation: {
    ran: boolean;
    passed: boolean;
    populationSize: number;
    projectedMarginDelta: string;
    biasRatio: number;
    notes: string;
  } | null;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  actorType: 'human' | 'agent' | 'system';
  eventType: string;
  scope: string;
  summary: string;
  changeSetId: string | null;
}

/** What recording an event supplies. The id is assigned, never chosen. */
export type AuditEventInput = Omit<AuditEvent, 'id'>;

/**
 * Where governance state lives.
 *
 * Deliberately narrow, like the registry's and the catalogue's. The rules —
 * a change set opens pending, is decided once, and the log only grows — are in
 * `Governance`, except the one rule a store must hold itself: `decideChangeSet`
 * writes only if the change set is still pending *at the moment of writing*,
 * because a check made one read earlier is the race it exists to close.
 *
 * Every read hands back a copy, in memory as in PostgreSQL.
 */
export interface GovernanceStore {
  /** Every tenant holding a change set or an audit event, sorted. */
  listTenants(): Promise<string[]>;

  getChangeSet(tenantId: string, id: string): Promise<ChangeSet | undefined>;
  /** Newest request first, then id descending, so two at one instant have an order. */
  listChangeSets(tenantId: string): Promise<ChangeSet[]>;
  /** Refuses an id the tenant already holds with `DUPLICATE_CHANGE_SET`. */
  insertChangeSet(tenantId: string, changeSet: ChangeSet): Promise<void>;
  /**
   * Replace a change set with its decided form, only if it is still pending.
   *
   * Resolves `false` and writes nothing when it is not — decided already, or
   * absent — so the caller learns it lost rather than overwriting a decision.
   */
  decideChangeSet(tenantId: string, decided: ChangeSet): Promise<boolean>;

  /** Refuses an id the tenant already holds with `DUPLICATE_EVENT`. */
  appendAuditEvent(tenantId: string, event: AuditEvent): Promise<void>;
  /** Newest first, in the order they were appended. */
  listAuditEvents(tenantId: string, options?: { limit?: number }): Promise<AuditEvent[]>;
  countAuditEvents(tenantId: string): Promise<number>;
}

export class GovernanceError extends Error {
  constructor(
    readonly code:
      | 'UNKNOWN_CHANGE_SET'
      | 'DUPLICATE_CHANGE_SET'
      | 'NOT_PENDING'
      | 'ALREADY_DECIDED'
      | 'DUPLICATE_EVENT',
    message: string
  ) {
    super(message);
    this.name = 'GovernanceError';
  }
}
