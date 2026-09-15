import {
  DecisionLedger,
  InMemoryLedgerStore,
  type DeliveryAttempt,
  type LedgerEntry,
  type OutcomeEvent,
} from '@metis/ledger';
import { DECISION_COUNT, executeAt } from './fixtures/engine';
import { placements } from './fixtures/catalogue';
import type { DecisionRecord } from './fixtures/decisions';
import { outcomesFor } from './fixtures/synthetic-customers';
import { deliveryFor } from './delivery-state';

/**
 * The seeded history, written through the ledger's own operations — ADR-018.
 *
 * The generator's decisions used to reach screens as a committed index and a
 * projection of outcomes computed at read time. This builds the same history
 * as ledger rows: every decision executed by the engine exactly as `executeAt`
 * executes it, the delivery its placement records, and the outcomes the
 * synthetic-customer model gives a decision that was dispatched.
 *
 * Built once per process and kept (§3): the e2e suite resets the store between
 * specs, and a reset writes this back rather than executing 10,400 decisions
 * again.
 */

export interface SeededHistory {
  tenantId: string;
  entries: LedgerEntry[];
  deliveries: DeliveryAttempt[];
  outcomes: OutcomeEvent[];
}

export interface LedgerSeedReport {
  decisions: number;
  deliveries: number;
  outcomes: number;
  /** Milliseconds for this seed, executing and writing, or restoring. */
  ms: number;
  /** False when a reset restored the history built earlier in this process. */
  executed: boolean;
}

const TENANT = 'telco-us';

/** The flat row the synthetic-customer model reads, taken from the engine's own record. */
export function rowOf(trace: ReturnType<typeof executeAt>['trace'], tenantId = TENANT): DecisionRecord {
  const d = trace.decision;
  return {
    id: trace.id,
    artifactId: d.artifactId,
    artifactVersion: d.artifactVersion,
    tenantId,
    customerId: d.customerRef,
    timestamp: d.occurredAt,
    channel: d.channel,
    placement: d.placement,
    winner: d.winner,
    winnerOfferId: d.winnerOfferId,
    candidateCount: d.candidateKeys.length,
  };
}

const placementByKey = new Map(placements.map((p) => [p.key, p]));

/** Execute and shape the history. Pure apart from the engine's memo in `executeAt`. */
export function buildSeededHistory(count: number = DECISION_COUNT, tenantId: string = TENANT): SeededHistory {
  // `entryFor` is the ledger's own shaping, subject hash included; the store
  // behind this instance is never written.
  const shaper = new DecisionLedger(new InMemoryLedgerStore());
  const entries: LedgerEntry[] = [];
  const deliveries: DeliveryAttempt[] = [];
  const outcomes: OutcomeEvent[] = [];

  for (let i = 0; i < count; i++) {
    const { trace } = executeAt(i);
    entries.push(shaper.entryFor(trace, tenantId));

    const placement = placementByKey.get(trace.decision.placement);
    const delivery = deliveryFor(placement);
    deliveries.push({
      tenantId,
      decisionId: trace.id,
      placementKey: trace.decision.placement,
      channel: trace.decision.channel as DeliveryAttempt['channel'],
      state: delivery.state,
      // The decision's own time, never the clock: a seed has to be the same
      // history on every run (ADR-018 §2).
      at: trace.decision.occurredAt,
      reason: delivery.reason,
      permanent: null,
      providerRef: null,
    });

    outcomes.push(...outcomesFor(rowOf(trace, tenantId), { dispatched: delivery.state === 'dispatched' }));
  }

  return { tenantId, entries, deliveries, outcomes };
}

let built: SeededHistory | null = null;

/** The history for this process, built on first use and kept for every reset after. */
export function seededHistory(): { history: SeededHistory; executed: boolean } {
  if (built) return { history: built, executed: false };
  built = buildSeededHistory();
  return { history: built, executed: true };
}

/** Write a history through the ledger's operations, in the order their invariants need. */
export async function writeSeededHistory(ledger: DecisionLedger, history: SeededHistory): Promise<void> {
  for (const entry of history.entries) await ledger.record(entry);
  for (const attempt of history.deliveries) await ledger.recordDelivery(attempt);
  for (const event of history.outcomes) await ledger.recordOutcome(event);
}

/** Seed a ledger for this process: build once, then write. Timed, for the e2e threshold (ADR-018). */
export async function seedLedger(ledger: DecisionLedger): Promise<LedgerSeedReport> {
  const started = performance.now();
  const { history, executed } = seededHistory();
  await writeSeededHistory(ledger, history);
  return {
    decisions: history.entries.length,
    deliveries: history.deliveries.length,
    outcomes: history.outcomes.length,
    ms: Math.round(performance.now() - started),
    executed,
  };
}
