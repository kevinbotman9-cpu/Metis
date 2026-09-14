import { randomUUID } from 'node:crypto';
import {
  GovernanceError,
  type AuditEvent,
  type AuditEventInput,
  type ChangeSet,
  type ChangeSetDecision,
  type ChangeSetStatus,
  type GovernanceStore,
} from './types';

/**
 * The rules over change sets and the audit log.
 *
 * Three of them, each the reason this is a package rather than two arrays:
 *
 * 1. **A change set opens pending.** One that arrives already decided has no
 *    decision anybody made. A restore writes decided change sets through the
 *    store, which is a restore rather than an approval.
 * 2. **A change set is decided once.** A second approval of an approved change
 *    set is refused, and so is the loser of two approvals racing — which is
 *    what stops an approval from applying its diff twice.
 * 3. **An audit event's id is assigned here.** The console numbered them from a
 *    counter that started again at every boot, which over a durable log would
 *    have issued ids already cited by events that survived the restart.
 */
export class Governance {
  constructor(private readonly store: GovernanceStore) {}

  async changeSets(tenantId: string, status?: ChangeSetStatus): Promise<ChangeSet[]> {
    const all = await this.store.listChangeSets(tenantId);
    return status ? all.filter((c) => c.status === status) : all;
  }

  async changeSet(tenantId: string, id: string): Promise<ChangeSet | undefined> {
    return this.store.getChangeSet(tenantId, id);
  }

  async open(tenantId: string, changeSet: ChangeSet): Promise<ChangeSet> {
    if (changeSet.status !== 'pending' || changeSet.decidedBy || changeSet.decidedAt) {
      throw new GovernanceError(
        'NOT_PENDING',
        `Change set ${changeSet.id} is ${changeSet.status}. A change set opens pending and is decided afterwards.`
      );
    }
    await this.store.insertChangeSet(tenantId, changeSet);
    return changeSet;
  }

  /**
   * Decide a pending change set.
   *
   * The pending check here gives the useful error; the store's conditional
   * write is what makes it true when two decisions arrive together.
   */
  async decide(
    tenantId: string,
    id: string,
    decision: { status: ChangeSetDecision; decidedBy: string; decidedAt: string; reason: string }
  ): Promise<ChangeSet> {
    const current = await this.store.getChangeSet(tenantId, id);
    if (!current) throw new GovernanceError('UNKNOWN_CHANGE_SET', `No change set ${id}.`);
    if (current.status !== 'pending') {
      throw new GovernanceError('ALREADY_DECIDED', `Change set ${id} was already ${current.status}.`);
    }

    const decided: ChangeSet = {
      ...current,
      status: decision.status,
      decidedBy: decision.decidedBy,
      decidedAt: decision.decidedAt,
      decisionReason: decision.reason,
    };
    if (!(await this.store.decideChangeSet(tenantId, decided))) {
      const now = await this.store.getChangeSet(tenantId, id);
      throw new GovernanceError(
        'ALREADY_DECIDED',
        `Change set ${id} was ${now?.status ?? 'decided'} by someone else while this decision was being made.`
      );
    }
    return decided;
  }

  /** Append one event, with an id nobody else has been given. */
  async record(tenantId: string, input: AuditEventInput): Promise<AuditEvent> {
    const event: AuditEvent = { ...input, id: `evt_${randomUUID().replace(/-/g, '').slice(0, 16)}` };
    await this.store.appendAuditEvent(tenantId, event);
    return event;
  }

  /** Newest first. */
  async events(tenantId: string, options?: { limit?: number }): Promise<AuditEvent[]> {
    return this.store.listAuditEvents(tenantId, options);
  }

  async countEvents(tenantId: string): Promise<number> {
    return this.store.countAuditEvents(tenantId);
  }
}
