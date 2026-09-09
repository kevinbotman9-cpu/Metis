import { describe, it, expect } from 'vitest';
import { decisions } from '../../mocks/fixtures/decisions';
import { seededOutcomesFor, POOR_PERFORMER } from '../../mocks/fixtures/outcomes';
import { decisionIndexOf, inChurnCohort } from '../../mocks/fixtures/engine';
import { offers } from '../../mocks/fixtures/catalogue';
import type { OutcomeEvent } from '@metis/ledger';

/**
 * The seeded outcomes, held to the shape ADR-008 §6 asks for.
 *
 * These assertions run over all 10,400 rather than a sample, because the
 * generator is pure arithmetic and the whole corpus costs under a second — and
 * because the properties that matter here are the ones a sample would miss. A
 * funnel that inverts on nineteen decisions out of ten thousand is still a
 * corpus that can teach somebody the wrong thing.
 */

const ALL = decisions.map((d) => ({ d, events: seededOutcomesFor(d) }));
const WITH = ALL.filter((x) => x.events.length > 0);
const has = (events: OutcomeEvent[], type: string) => events.some((e) => e.type === type);
const count = (type: string) => WITH.filter((x) => has(x.events, type)).length;

describe('the seeded outcomes have a shape a marketer can read', () => {
  it('covers the corpus, not a corner of it', () => {
    expect(decisions.length).toBeGreaterThan(10_000);
    expect(WITH.length, 'a corpus with no outcomes is the state this replaced').toBeGreaterThan(
      1_500
    );
  });

  it('never reports an outcome against a decision that offered nothing', () => {
    // A suppressed decision has no impression. Folding one in would make the
    // frequency policy look like an offer that failed.
    const suppressed = ALL.filter((x) => !x.d.winner);
    expect(suppressed.length).toBeGreaterThan(1_000);
    expect(suppressed.filter((x) => x.events.length > 0)).toEqual([]);
  });

  it('nests the funnel, on every single decision', () => {
    const inverted = WITH.filter(({ events }) => {
      const i = has(events, 'impression');
      const c = has(events, 'click');
      const a = has(events, 'acceptance');
      const v = has(events, 'conversion');
      return (c && !i) || (a && !c) || (v && !a);
    }).map((x) => x.d.id);
    expect(inverted, 'conversion ⊆ acceptance ⊆ click ⊆ impression').toEqual([]);
  });

  it('leaves most offers unmeasured, so the report keeps two denominators', () => {
    // If coverage were 100% then `measured` and `offered` would be the same
    // number on screen and the distinction would look redundant to the next
    // person who reads the report.
    const offered = ALL.filter((x) => x.d.winner).length;
    const coverage = WITH.length / offered;
    expect(coverage).toBeGreaterThan(0.45);
    expect(coverage).toBeLessThan(0.8);
  });

  it('reports web most and an outbound call least', () => {
    const rate = (channel: string) => {
      const rows = ALL.filter((x) => x.d.winner && x.d.channel === channel);
      return rows.filter((x) => x.events.length > 0).length / rows.length;
    };
    expect(rate('web')).toBeGreaterThan(rate('email'));
    expect(rate('email')).toBeGreaterThan(rate('outbound_call'));
  });

  it('puts a value on conversions and on nothing else', () => {
    const valued = WITH.flatMap((x) => x.events).filter((e) => e.valueMinor !== null);
    expect(valued.length).toBeGreaterThan(0);
    expect(valued.every((e) => e.type === 'conversion')).toBe(true);
    // A conversion is not a click worth something, and a click is not a
    // conversion worth nothing.
    const conversions = WITH.flatMap((x) => x.events).filter((e) => e.type === 'conversion');
    expect(conversions.every((e) => (e.valueMinor ?? 0) > 0)).toBe(true);
  });

  it('realises a value that differs from the one expected', () => {
    // If realised equalled expected the demo would teach that a forecast is a
    // fact, which is the opposite of what this product is for.
    const margin = new Map(offers.map((o) => [o.key, o.financials.expectedMargin.amount]));
    const pairs = WITH.flatMap((x) =>
      x.events
        .filter((e) => e.type === 'conversion')
        .map((e) => [e.valueMinor ?? 0, margin.get(x.d.winner!) ?? 0] as const)
    );
    expect(pairs.length).toBeGreaterThan(20);
    expect(pairs.filter(([got, want]) => got !== want).length / pairs.length).toBeGreaterThan(0.9);
  });

  it('makes the churn cohort convert worse than everybody else', () => {
    const rate = (churning: boolean) => {
      const rows = WITH.filter((x) => {
        const i = decisionIndexOf(x.d.customerId);
        return i !== null && inChurnCohort(i) === churning;
      });
      return rows.filter((x) => has(x.events, 'conversion')).length / rows.length;
    };
    const churn = rate(true);
    const rest = rate(false);
    expect(rest, 'the cohort exists in the decisions and must exist in the outcomes').toBeGreaterThan(
      churn * 1.5
    );
  });

  it('has one offer that is shown often and taken almost never', () => {
    // The thing a marketer is meant to find. Without it the demo has nothing
    // in it to discover.
    const rows = WITH.filter((x) => x.d.winner === POOR_PERFORMER);
    expect(rows.length, `${POOR_PERFORMER} is not in the corpus`).toBeGreaterThan(20);
    const accepted = rows.filter((x) => has(x.events, 'acceptance')).length;
    expect(accepted / rows.length).toBeLessThan(0.05);

    const others = WITH.filter((x) => x.d.winner !== POOR_PERFORMER);
    const otherRate = others.filter((x) => has(x.events, 'acceptance')).length / others.length;
    expect(otherRate).toBeGreaterThan(accepted / rows.length);
  });

  it('records rejections, so "nobody said" and "they said no" stay different', () => {
    expect(count('rejection')).toBeGreaterThan(50);
  });

  it('lags every outcome behind its decision, from the decision’s own clock', () => {
    // Never `Date.now()`: an outcome dated after the corpus was generated would
    // move every time the page loaded, and the report would not reproduce.
    const early = WITH.filter(({ d, events }) =>
      events.some((e) => new Date(e.occurredAt) <= new Date(d.timestamp))
    );
    expect(early).toEqual([]);
  });

  it('orders the funnel in time as well as in logic', () => {
    const outOfOrder = WITH.filter(({ events }) => {
      const t = (type: string) => events.find((e) => e.type === type)?.occurredAt;
      const seq = ['impression', 'click', 'acceptance', 'conversion'].map(t).filter(Boolean);
      return seq.some((v, i) => i > 0 && v! < seq[i - 1]!);
    });
    expect(outOfOrder).toEqual([]);
  });

  it('is reproducible', () => {
    // The whole point. Two calls, same bytes, no clock and no Math.random.
    const sample = decisions.slice(0, 400);
    expect(sample.map(seededOutcomesFor)).toEqual(sample.map(seededOutcomesFor));
  });
});
