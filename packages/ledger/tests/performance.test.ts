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

// `channel` is not a `LedgerEntry` field — it lives inside the recorded
// decision, and these tests set it often enough to be worth naming here rather
// than casting at every call site.
const entry = (
  over: Partial<LedgerEntry> & { winner: string | null; id: string; channel?: string }
): LedgerEntry =>
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
        channel: over.channel ?? 'web',
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

/**
 * The loop, and the property the Cascade pattern rests on.
 *
 * `METIS_CONSOLE_SPEC.md` §4.7: every stage is a subset of the one above it. A
 * figure below one that exceeds it means the two are counting different
 * populations, and the screen is lying. That is not hypothetical — `/performance`
 * showed 887 seen against 738 deliverable for a day, and the inversion is how
 * G-046 was found.
 */
describe('the loop', () => {
  const corpus = () => {
    const entries = [
      entry({ id: 'd1', winner: 'a', channel: 'web' }),
      entry({ id: 'd2', winner: 'a', channel: 'web' }),
      entry({ id: 'd3', winner: 'b', channel: 'email' }),
      entry({ id: 'd4', winner: null, channel: 'email' }),
      entry({ id: 'd5', winner: 'b', channel: 'sms' }),
    ];
    const events = map([
      outcome('d1', 'impression'),
      outcome('d1', 'click'),
      outcome('d2', 'impression'),
    ]);
    return { entries, events };
  };

  it('counts the five stages, each a subset of the one before', () => {
    const { entries, events } = corpus();
    const r = buildPerformance(entries, events, ['web']);

    expect(r.decisions).toBe(5);
    expect(r.offered).toBe(4);
    expect(r.deliverable).toBe(2);
    expect(r.measured).toBe(2);
    expect(r.acted).toBe(1);

    // Stated as the invariant rather than as five separate numbers, because it
    // is the invariant a reader of the rail is relying on.
    expect(r.offered).toBeLessThanOrEqual(r.decisions);
    expect(r.deliverable!).toBeLessThanOrEqual(r.offered);
    expect(r.measured).toBeLessThanOrEqual(r.deliverable!);
    expect(r.acted).toBeLessThanOrEqual(r.measured);
  });

  it('says nothing about deliverability when nobody said which channels deliver', () => {
    // Null, not zero. "Nothing is deliverable" and "nobody told us" are
    // different answers, and a rail that renders the second as the first would
    // report a total break that is really a missing argument.
    const { entries, events } = corpus();
    expect(buildPerformance(entries, events).deliverable).toBeNull();
  });

  it('breaks the loop down per channel, so a rate can name its population', () => {
    const { entries, events } = corpus();
    const r = buildPerformance(entries, events, ['web']);
    const byChannel = new Map(r.channels.map((c) => [c.channel, c]));

    expect(byChannel.get('web')).toMatchObject({
      delivers: true,
      decisions: 2,
      offered: 2,
      deliverable: 2,
      seen: 2,
      acted: 1,
    });
    // Decided on, and carried by nothing. The stage that makes the break real.
    expect(byChannel.get('email')).toMatchObject({
      delivers: false,
      decisions: 2,
      offered: 1,
      deliverable: 0,
    });
    expect(byChannel.get('sms')?.delivers).toBe(false);
  });

  it('holds the nesting on every channel, not only in the total', () => {
    // A total can nest while a channel does not, and the per-channel rate is
    // what the screen puts next to a number.
    const { entries, events } = corpus();
    const r = buildPerformance(entries, events, ['web']);
    for (const c of r.channels) {
      expect(c.offered, `${c.channel}: offered exceeds decisions`).toBeLessThanOrEqual(c.decisions);
      expect(c.deliverable, `${c.channel}: deliverable exceeds offered`).toBeLessThanOrEqual(
        c.offered
      );
      expect(c.acted, `${c.channel}: acted exceeds seen`).toBeLessThanOrEqual(c.seen);
    }
  });

  it('gives the rail a daily series, oldest first', () => {
    const r = buildPerformance(
      [
        entry({ id: 'a', winner: 'x', channel: 'web', occurredAt: '2026-06-02T09:00:00.000Z' }),
        entry({ id: 'b', winner: 'x', channel: 'web', occurredAt: '2026-06-01T09:00:00.000Z' }),
        entry({ id: 'c', winner: null, channel: 'web', occurredAt: '2026-06-01T18:00:00.000Z' }),
      ],
      map([outcome('b', 'impression')]),
      ['web']
    );
    expect(r.series.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-02']);
    expect(r.series[0]).toMatchObject({ decisions: 2, offered: 1, deliverable: 1, seen: 1 });
    expect(r.series[1]).toMatchObject({ decisions: 1, offered: 1, deliverable: 1, seen: 0 });
  });
});
