import { describe, it, expect } from 'vitest';
import { compareShadow, buildShadowReport, type ShadowComparison } from '../src/shadow';
import type { DecisionRecord } from '../src/deterministic/types';

const V = { activeVersion: '1.0.0', shadowVersion: '2.0.0' };

function record(over: {
  id?: string;
  winner?: string | null;
  scores?: Record<string, number>;
  denials?: { key: string; code: string }[];
} = {}): DecisionRecord {
  const scores = over.scores ?? { offer_a: 0.9, offer_b: 0.4 };
  return {
    id: over.id ?? 'dec_1',
    chainHash: 'h'.repeat(64),
    decision: {
      winner: over.winner === undefined ? 'offer_a' : over.winner,
      scores: Object.fromEntries(
        Object.entries(scores).map(([k, priority]) => [
          k,
          { propensity: 1, value: 1, boost: 1, context: 1, cost: 0, priority },
        ])
      ),
      eliminations: [
        {
          nodeId: 'n1',
          nodeType: 'filter',
          reason: 'x',
          denials: (over.denials ?? []).map((d) => ({ ...d, ruleId: null })),
          survived: [],
        },
      ],
    },
    measured: { timingsByNode: {}, totalMs: 1, executedAt: '2026-06-01T12:00:00.000Z' },
  } as unknown as DecisionRecord;
}

describe('comparing a shadow against what was returned', () => {
  it('agrees when the winner, the order and the reasons all match', () => {
    const c = compareShadow(record(), record({ id: 'dec_2' }), V, 3);
    expect(c.agrees).toBe(true);
    expect(c.divergences).toEqual([]);
    expect(c.shadowMs).toBe(3);
  });

  it('names a different winner', () => {
    const c = compareShadow(
      record(),
      record({ id: 'dec_2', winner: 'offer_b', scores: { offer_a: 0.4, offer_b: 0.9 } }),
      V,
      1
    );
    expect(c.divergences.map((d) => d.kind)).toContain('winner');
    expect(c.divergences.find((d) => d.kind === 'winner')?.summary).toBe('offer_a → offer_b');
  });

  it('treats no offer as a winner worth reporting', () => {
    // Suppressing where the active version offered is the divergence a
    // migration most needs to see, and `null` must not read as "same".
    const c = compareShadow(record(), record({ id: 'dec_2', winner: null }), V, 1);
    expect(c.divergences.find((d) => d.kind === 'winner')?.summary).toBe('offer_a → no offer');
  });

  it('catches a reordering even when the winner is unchanged', () => {
    // A shadow that wins by a hair today wins by nothing tomorrow. Agreement
    // on the winner alone would call this a clean migration.
    const c = compareShadow(
      record({ scores: { a: 0.9, b: 0.5, c: 0.1 } }),
      record({ id: 'dec_2', scores: { a: 0.9, b: 0.1, c: 0.5 } }),
      V,
      1
    );
    expect(c.agrees).toBe(false);
    expect(c.divergences.map((d) => d.kind)).toEqual(['ranking']);
  });

  it('does not read a tie as a divergence', () => {
    // Equal priorities break by key in the engine, so both sides order them
    // the same way and this must not be reported as a change.
    const c = compareShadow(
      record({ scores: { b: 0.5, a: 0.5 } }),
      record({ id: 'dec_2', scores: { a: 0.5, b: 0.5 } }),
      V,
      1
    );
    expect(c.agrees).toBe(true);
  });

  it('catches a reason that changed while the outcome did not', () => {
    // The case a boolean hides: the same action, denied to the same candidate,
    // for a different coded reason. A regulator asks about exactly this.
    const c = compareShadow(
      record({ denials: [{ key: 'offer_b', code: 'ELIGIBILITY_FAILED' }] }),
      record({ id: 'dec_2', denials: [{ key: 'offer_b', code: 'SUITABILITY_FAILED' }] }),
      V,
      1
    );
    expect(c.agrees).toBe(false);
    expect(c.divergences.map((d) => d.kind)).toEqual(['reasons']);
    const summary = c.divergences[0].summary;
    // Both directions: a reason that disappeared matters as much as one that
    // appeared — an offer silently no longer being denied is how a rule stops
    // applying without anyone noticing.
    expect(summary).toContain('no longer: offer_b:ELIGIBILITY_FAILED');
    expect(summary).toContain('now: offer_b:SUITABILITY_FAILED');
  });

  it('reports all three when all three differ', () => {
    const c = compareShadow(
      record({ scores: { a: 0.9, b: 0.1 }, denials: [{ key: 'b', code: 'ELIGIBILITY_FAILED' }] }),
      record({
        id: 'dec_2',
        winner: 'b',
        scores: { a: 0.1, b: 0.9 },
        denials: [{ key: 'a', code: 'SUITABILITY_FAILED' }],
      }),
      V,
      1
    );
    expect(c.divergences.map((d) => d.kind).sort()).toEqual(['ranking', 'reasons', 'winner']);
  });
});

describe('the shadow report', () => {
  const cmp = (over: Partial<ShadowComparison>): ShadowComparison => ({
    decisionId: 'd', shadowDecisionId: 's',
    activeVersion: '1.0.0', shadowVersion: '2.0.0',
    agrees: true, divergences: [], shadowMs: 1,
    ...over,
  });

  it('reports an agreement rate and the most common divergences first', () => {
    const r = buildShadowReport('f', V, [
      cmp({}),
      cmp({ agrees: false, divergences: [{ kind: 'winner', summary: 'a → b' }] }),
      cmp({ agrees: false, divergences: [{ kind: 'winner', summary: 'a → b' }] }),
      cmp({ agrees: false, divergences: [{ kind: 'ranking', summary: 'a > b → b > a' }] }),
    ]);
    expect(r.compared).toBe(4);
    expect(r.agreed).toBe(1);
    expect(r.agreementRate).toBe(0.25);
    expect(r.topDivergences[0]).toEqual({ kind: 'winner', summary: 'a → b', count: 2 });
  });

  it('opens at zero, not at a hundred', () => {
    // "100% agreement, 0 compared" is the number somebody in a hurry reads as
    // a reason to cut over.
    const r = buildShadowReport('f', V, []);
    expect(r.agreementRate).toBe(0);
    expect(r.compared).toBe(0);
  });

  it('publishes what the shadow cost rather than leaving it to be assumed', () => {
    const r = buildShadowReport(
      'f',
      V,
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 100].map((shadowMs) => cmp({ shadowMs }))
    );
    expect(r.shadowMsP50).toBe(5);
    // The tail is the number that matters: a shadow whose p95 is 100ms is not
    // free, whatever its median says.
    expect(r.shadowMsP95).toBe(100);
  });

  it('breaks ties between equally common divergences deterministically', () => {
    const r = buildShadowReport('f', V, [
      cmp({ agrees: false, divergences: [{ kind: 'winner', summary: 'z → y' }] }),
      cmp({ agrees: false, divergences: [{ kind: 'winner', summary: 'a → b' }] }),
    ]);
    expect(r.topDivergences.map((d) => d.summary)).toEqual(['a → b', 'z → y']);
  });
});
