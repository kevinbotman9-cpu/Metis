import { describe, it, expect } from 'vitest';
import { executeAt, DECISION_COUNT } from '@/mocks/fixtures/engine';
import { rowOf } from '@/mocks/seed-ledger';
import { outcomesFor } from '@/mocks/fixtures/synthetic-customers';

/**
 * The seeded outcome model is keyed on the seed index, not the decision id —
 * ADR-019 §7, amended 2026-09-18.
 *
 * A decision id is content-addressed, so keyed on it every change to what a
 * decision records re-rolled the whole outcome history. The reseed moves every
 * id four times over; keyed on the seed index, an outcome moves only when its
 * decision does. These hold that: a seeded decision's events do not depend on
 * its id, and a decision the seed did not make still has its own draws.
 */

const withOutcomes = (() => {
  const found = [];
  for (let i = 0; i < DECISION_COUNT && found.length < 40; i++) {
    const row = rowOf(executeAt(i).trace, 'telco-us');
    if (outcomesFor(row, { dispatched: true }).length > 0) found.push(row);
  }
  return found;
})();

const strip = (events: { decisionId: string }[]) => events.map(({ decisionId: _, ...rest }) => rest);

describe('what a seeded decision’s outcomes are keyed on', () => {
  it('gives a seeded decision the same events whatever its id', () => {
    expect(withOutcomes.length).toBeGreaterThan(20);
    for (const row of withOutcomes) {
      const moved = { ...row, id: 'dec_0123456789abcdef' };
      expect(strip(outcomesFor(moved, { dispatched: true }))).toEqual(strip(outcomesFor(row, { dispatched: true })));
    }
  });

  it('keys a decision the seed did not make on its own id', () => {
    // No seed index: `cust_` and something `decisionIndexOf` does not decode.
    // Forty such decisions under two sets of ids draw differently at least
    // once — the id is what they are keyed on.
    const byHand = withOutcomes.map((row) => ({ ...row, customerId: 'cust_madebyhand' }));
    const a = byHand.map((row, i) => strip(outcomesFor({ ...row, id: `dec_a${i}` }, { dispatched: true })));
    const b = byHand.map((row, i) => strip(outcomesFor({ ...row, id: `dec_b${i}` }, { dispatched: true })));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});
