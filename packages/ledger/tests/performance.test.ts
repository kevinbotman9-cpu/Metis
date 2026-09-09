import { describe, it, expect } from 'vitest';
import { buildPerformance } from '../src/performance';
import type { LedgerEntry, OutcomeEvent } from '../src/types';

/**
 * The outcome read model.
 *
 * Outcomes had been captured since the ledger existed and nothing read them, so
 * the platform could say what it decided and never whether it worked. These
 * cover the join, and specifically the three ways a naive one lies: counting
 * events instead of decisions, reporting a rate over an empty denominator, and
 * folding suppressed decisions into the offers that failed.
 */

const entry = (over: Partial<LedgerEntry> & { winner: string | null; id: string }): LedgerEntry =>
  ({
    tenantId: 't',
    decisionId: over.id,
    subjectHash: 'h',
    occurredAt: over.occurredAt ?? '2026-06-01T12:00:00.000Z',
    flowId: over.flowId ?? 'inbound-web-offers',
    flowVersion: '1.0.0',
    chainHash: 'c',
    record: {
      decision: {
        winner: over.winner,
        channel: (over as { channel?: string }).channel ?? 'web',
      },
    },
  }) as unknown as LedgerEntry;

const outcome = (
  decisionId: string,
  type: OutcomeEvent['type'],
  valueMinor: number | null = null
): OutcomeEvent => ({
  tenantId: 't',
  decisionId,
  type,
  occurredAt: '2026-06-01T13:00:00.000Z',
  valueMinor,
});

const map = (events: OutcomeEvent[]) => {
  const m = new Map<string, OutcomeEvent[]>();
  for (const e of events) m.set(e.decisionId, [...(m.get(e.decisionId) ?? []), e]);
  return m;
};

describe('counting', () => {
  it('groups by action, channel and flow', () => {
    const report = buildPerformance(
      [
        entry({ id: 'd1', winner: 'acq_fibre_900' }),
        entry({ id: 'd2', winner: 'acq_fibre_900' }),
        entry({ id: 'd3', winner: 'acq_sim_30' }),
      ],
      map([])
    );

    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]).toMatchObject({ action: 'acq_fibre_900', offered: 2 });
    expect(report.rows[1]).toMatchObject({ action: 'acq_sim_30', offered: 1 });
  });

  it('counts distinct decisions, not events', () => {
    // A channel that fires the same impression twice must not report two, and
    // a rate computed over event counts can exceed 1 — which is the tell that
    // it measured the wrong thing.
    const report = buildPerformance(
      [entry({ id: 'd1', winner: 'acq_fibre_900' })],
      map([
        outcome('d1', 'impression'),
        outcome('d1', 'impression'),
        outcome('d1', 'acceptance'),
        outcome('d1', 'acceptance'),
      ])
    );

    expect(report.rows[0].impressions).toBe(1);
    expect(report.rows[0].acceptances).toBe(1);
    expect(report.rows[0].acceptanceRate).toBe(1);
    expect(report.rows[0].measured).toBe(1);
  });

  it('never reports a rate above one', () => {
    // Only d1 was measured, and it accepted, so the rate over observations is
    // 1 — not 3, which counting events would give.
    const report = buildPerformance(
      [entry({ id: 'd1', winner: 'a' }), entry({ id: 'd2', winner: 'a' })],
      map([outcome('d1', 'acceptance'), outcome('d1', 'acceptance'), outcome('d1', 'acceptance')])
    );
    expect(report.rows[0].acceptanceRate).toBe(1);
    expect(report.rows[0].measured).toBe(1);
    expect(report.rows[0].offered).toBe(2);
  });

  it('takes the rate over what was observed, not over what was offered', () => {
    // The distinction the whole surface turns on. Two offers, one reported
    // back and refused. Dividing by 2 gives 0% and reads as "nobody took it";
    // the truth is that one person refused and nobody said anything about the
    // other.
    const report = buildPerformance(
      [entry({ id: 'd1', winner: 'a' }), entry({ id: 'd2', winner: 'a' })],
      map([outcome('d1', 'rejection')])
    );
    expect(report.rows[0].acceptanceRate).toBe(0);
    expect(report.rows[0].measured).toBe(1);
  });

  it('has no rate at all when nothing was reported back', () => {
    // Offered 146 times, no telemetry. 0.0% would say it was seen and refused.
    const report = buildPerformance(
      Array.from({ length: 146 }, (_, i) => entry({ id: `d${i}`, winner: 'a' })),
      map([])
    );
    expect(report.rows[0].offered).toBe(146);
    expect(report.rows[0].measured).toBe(0);
    expect(report.rows[0].acceptanceRate).toBeNull();
    expect(report.rows[0].clickRate).toBeNull();
  });

  it('sorts most-offered first, and stably when two tie', () => {
    // A table that reorders between refreshes is one nobody trusts.
    const report = buildPerformance(
      [entry({ id: 'd1', winner: 'zeta' }), entry({ id: 'd2', winner: 'alpha' })],
      map([])
    );
    expect(report.rows.map((r) => r.action)).toEqual(['alpha', 'zeta']);
  });
});

describe('what the numbers refuse to say', () => {
  it('has no row at all for an offer nobody was shown', () => {
    // A suppressed decision offered nothing, so there is no action to report.
    const report = buildPerformance([entry({ id: 'd1', winner: null })], map([]));
    expect(report.rows).toEqual([]);
    expect(report.offered).toBe(0);
  });

  it('counts suppression separately from failure', () => {
    // On a platform whose suitability tier exists to refuse profitable offers,
    // suppression is a result. Folding it into a denominator would make every
    // policy that works look like an offer that did not.
    const report = buildPerformance(
      [
        entry({ id: 'd1', winner: 'a' }),
        entry({ id: 'd2', winner: null }),
        entry({ id: 'd3', winner: null }),
      ],
      map([])
    );

    expect(report.decisions).toBe(3);
    expect(report.offered).toBe(1);
    expect(report.suppressed).toBe(2);
    expect(report.rows[0].offered).toBe(1);
  });

  it('reports no value rather than zero when nothing carried one', () => {
    // A click is not a conversion worth nothing, and averaging over zeros
    // would say it was.
    const report = buildPerformance(
      [entry({ id: 'd1', winner: 'a' })],
      map([outcome('d1', 'click')])
    );
    expect(report.rows[0].valueMinor).toBeNull();
  });

  it('sums the values that were reported', () => {
    const report = buildPerformance(
      [entry({ id: 'd1', winner: 'a' }), entry({ id: 'd2', winner: 'a' })],
      map([outcome('d1', 'conversion', 4500), outcome('d2', 'conversion', 500)])
    );
    expect(report.rows[0].valueMinor).toBe(5000);
  });

  it('distinguishes measured from offered', () => {
    // Two offers, one with any outcome at all. "How much of this do we
    // actually know about" is a different question from "how did it do".
    const report = buildPerformance(
      [entry({ id: 'd1', winner: 'a' }), entry({ id: 'd2', winner: 'a' })],
      map([outcome('d1', 'impression')])
    );
    expect(report.offered).toBe(2);
    expect(report.measured).toBe(1);
  });
});

describe('the window', () => {
  it('reports the range the decisions actually cover', () => {
    const report = buildPerformance(
      [
        entry({ id: 'd1', winner: 'a', occurredAt: '2026-06-03T00:00:00.000Z' }),
        entry({ id: 'd2', winner: 'a', occurredAt: '2026-06-01T00:00:00.000Z' }),
      ],
      map([])
    );
    expect(report.from).toBe('2026-06-01T00:00:00.000Z');
    expect(report.to).toBe('2026-06-03T00:00:00.000Z');
  });

  it('has no window when there is nothing in it', () => {
    const report = buildPerformance([], map([]));
    expect(report).toMatchObject({ decisions: 0, from: null, to: null, rows: [] });
  });
});
