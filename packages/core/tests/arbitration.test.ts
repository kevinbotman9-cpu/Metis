import { describe, it, expect } from 'vitest';
import { rankCandidates, movement, type CandidateTerms } from '../src/arbitration';

/**
 * Ranking under weights, and the tie that makes an order alphabetical.
 *
 * The candidates are built so each case says what it needs, not borrowed from
 * a tenant: that the tie is a property of the numbers, and appears and
 * disappears with them.
 */

const MULTIPLICATIVE = { id: 'multiplicative', version: '1.0.0' };
const NEUTRAL = { propensity: 1, value: 1, boost: 1, context: 1 };

const candidate = (key: string, over: Partial<CandidateTerms['terms']> = {}): CandidateTerms => ({
  key,
  name: key,
  terms: { propensity: 1, value: 0.1667, boost: 1, context: 1, cost: 0, ...over },
});

describe('ranking candidates under weights', () => {
  it('ranks by priority, highest first', () => {
    const { rows } = rankCandidates(
      [candidate('b_low', { value: 0.1 }), candidate('a_high', { value: 0.3 }), candidate('c_mid', { value: 0.2 })],
      NEUTRAL,
      MULTIPLICATIVE
    );
    expect(rows.map((r) => [r.rank, r.key])).toEqual([
      [1, 'a_high'],
      [2, 'c_mid'],
      [3, 'b_low'],
    ]);
    expect(rows[0].priority).toBe(0.3);
  });

  it('reports a tie only where the weights make one, and orders it by key', () => {
    // Same value, different boosts: the boost separates them — until its
    // weight is zero, and then nothing does.
    const offers = [candidate('zeta', { boost: 1.1 }), candidate('alpha', { boost: 1.05 }), candidate('mu', { boost: 1 })];

    const weighted = rankCandidates(offers, NEUTRAL, MULTIPLICATIVE);
    expect(weighted.ties).toEqual([]);
    expect(weighted.rows.map((r) => r.key)).toEqual(['zeta', 'alpha', 'mu']);

    const unweighted = rankCandidates(offers, { ...NEUTRAL, boost: 0 }, MULTIPLICATIVE);
    expect(unweighted.ties).toEqual([['alpha', 'mu', 'zeta']]);
    // Alphabetical, which is exactly the problem: nobody decided zeta is last.
    expect(unweighted.rows.map((r) => r.key)).toEqual(['alpha', 'mu', 'zeta']);
    expect(unweighted.rows.find((r) => r.key === 'mu')!.tiedWith).toEqual(['alpha', 'zeta']);
  });

  it('compares priorities as the engine records them, rounded to eight places', () => {
    // 0.2 and 0.2 + 1e-10 are different numbers and the same recorded
    // priority, so the engine orders them by key. A difference at the eighth
    // place is a real difference and decides the order.
    const rounded = rankCandidates(
      [candidate('b', { value: 0.2 + 1e-10 }), candidate('a', { value: 0.2 })],
      NEUTRAL,
      MULTIPLICATIVE
    );
    expect(rounded.ties).toEqual([['a', 'b']]);

    const distinct = rankCandidates(
      [candidate('a', { value: 0.2 }), candidate('b', { value: 0.20000001 })],
      NEUTRAL,
      MULTIPLICATIVE
    );
    expect(distinct.ties).toEqual([]);
    expect(distinct.rows.map((r) => r.key)).toEqual(['b', 'a']);
  });

  it('reports every separate tie, not only one', () => {
    const { ties } = rankCandidates(
      [
        candidate('d', { value: 0.1 }),
        candidate('c', { value: 0.1 }),
        candidate('b', { value: 0.3 }),
        candidate('a', { value: 0.3 }),
        candidate('e', { value: 0.2 }),
      ],
      NEUTRAL,
      MULTIPLICATIVE
    );
    expect(ties).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('says how far each candidate moved, up as positive', () => {
    const offers = [candidate('fios', { boost: 1.1 }), candidate('gaming', { value: 0.18 })];
    const live = rankCandidates(offers, NEUTRAL, MULTIPLICATIVE);
    const proposed = rankCandidates(offers, { ...NEUTRAL, boost: 0 }, MULTIPLICATIVE);
    expect(live.rows.map((r) => r.key)).toEqual(['fios', 'gaming']);
    expect(proposed.rows.map((r) => r.key)).toEqual(['gaming', 'fios']);
    expect(movement(live, proposed)).toEqual({ gaming: 1, fios: -1 });
    expect(movement(live, live)).toEqual({ fios: 0, gaming: 0 });
  });

  it('refuses a ranking function the engine does not know', () => {
    expect(() => rankCandidates([candidate('a')], NEUTRAL, { id: 'made-up', version: '1.0.0' })).toThrow(
      /No ranking function made-up@1.0.0/
    );
  });
});
