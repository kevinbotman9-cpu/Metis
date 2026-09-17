import { describe, it, expect, beforeAll } from 'vitest';
import { DecisionLedger } from '../src/ledger';
import { InMemoryLedgerStore } from '../src/memory-store';
import { decisionRecord } from './suite';

/**
 * The contact read is on every decision a cap applies to, so it has a budget.
 * ADR-021 §6: 5ms at p95 in memory, over a history the size of the seeded
 * corpus. PostgreSQL is measured and recorded in the ADR rather than gated here,
 * because a gate on a shared database's latency would measure the runner.
 *
 * The history is built here rather than from the console's generator, which
 * this package cannot import: 10,400 decisions over 1,000 customers and three
 * channels, spread over 60 days, each with the delivery the console records.
 */

const DECISIONS = 10_400;
const CUSTOMERS = 1_000;
const CHANNELS = ['web', 'email', 'sms'] as const;
const T = 'telco-us';
const END = Date.parse('2026-06-30T12:00:00.000Z');
const SPAN_MS = 60 * 24 * 60 * 60 * 1000;

const ledger = new DecisionLedger(new InMemoryLedgerStore());

beforeAll(async () => {
  for (let i = 0; i < DECISIONS; i++) {
    // Deterministic spread: no Math.random, so a slow run is the code and not a reroll.
    const at = new Date(END - ((i * 7919) % SPAN_MS)).toISOString();
    const channel = CHANNELS[i % CHANNELS.length];
    const id = `dec_budget_${i}`;
    await ledger.record(
      ledger.entryFor(
        decisionRecord({ id, customerRef: `cust_${i % CUSTOMERS}`, channel, occurredAt: at, winner: i % 5 === 0 ? null : 'offer_a' }),
        T
      )
    );
    await ledger.recordDelivery({
      tenantId: T,
      decisionId: id,
      placementKey: 'homepage_hero',
      channel,
      state: channel === 'web' ? 'dispatched' : 'suppressed',
      at,
      reason: null,
      permanent: null,
      providerRef: null,
    });
  }
}, 120_000);

describe('the contact read’s budget', () => {
  it('answers at p95 inside 5ms in memory, over a corpus-sized history', async () => {
    const samples: number[] = [];
    for (let i = 0; i < 2_000; i++) {
      const started = performance.now();
      await ledger.contactsFor({ tenantId: T, customerRef: `cust_${(i * 37) % CUSTOMERS}`, channel: 'web', until: new Date(END).toISOString() });
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    expect(p95, `p95 ${p95.toFixed(3)}ms, p50 ${samples[Math.floor(samples.length / 2)].toFixed(3)}ms`).toBeLessThan(5);
  });

  it('is measuring counts, not an empty answer', async () => {
    // A read that found nothing would be fast and prove nothing.
    const counts = await ledger.contactsFor({ tenantId: T, customerRef: 'cust_3', channel: 'web', until: new Date(END).toISOString() });
    expect(counts.month).toBeGreaterThan(0);
  });
});
