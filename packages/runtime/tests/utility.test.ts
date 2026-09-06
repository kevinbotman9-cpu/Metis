import { describe, it, expect } from 'vitest';
import {
  evaluateUtility,
  resolveUtility,
  utilityKey,
  MULTIPLICATIVE,
  EXPECTED_VALUE,
  BUILT_IN_UTILITY_FUNCTIONS,
  KNOWN_TERMS,
  UtilityTermMissing,
  type UtilityFunction,
} from '@metis/core/utility';

const WEIGHTS = { propensity: 1, value: 1, boost: 1, context: 0.5 };

describe('multiplicative@1.0.0 reproduces the formula it replaced', () => {
  /**
   * The arithmetic the engine used to hard-code, kept here verbatim.
   *
   * This is the whole point of the test: a refactor that changes an answer is
   * not a refactor. Chain hashes did move in this change, but for a reason
   * that is written down — `cost` joined the score and the ranking function's
   * version joined the record — and not because the maths drifted.
   */
  const hardCoded = (
    s: { propensity: number; value: number; boost: number; context: number },
    w: typeof WEIGHTS
  ) =>
    Math.pow(s.propensity, w.propensity) *
    Math.pow(s.value, w.value) *
    Math.pow(s.boost, w.boost) *
    Math.pow(s.context, w.context);

  it('agrees bit for bit across the range the engine produces', () => {
    // The engine's own bounds: propensity 0.05–0.95, value floored at 0.01,
    // boost from the catalogue, context 0.4–1.0.
    const propensities = [0.05, 0.113456, 0.5, 0.712, 0.95];
    const values = [0.01, 0.038333, 0.552, 1, 4.31];
    const boosts = [0.5, 0.9, 1, 1.25, 1.6, 2];
    const contexts = [0.4, 0.63, 0.84, 1];

    let compared = 0;
    for (const propensity of propensities)
      for (const value of values)
        for (const boost of boosts)
          for (const context of contexts) {
            const s = { propensity, value, boost, context };
            const viaFunction = evaluateUtility(MULTIPLICATIVE, s, WEIGHTS);
            // Object.is, not toBe: it separates +0 from -0 and treats NaN as
            // equal to itself, which is what "bit for bit" has to mean for a
            // number that ends up inside a hash.
            expect(
              Object.is(viaFunction, hardCoded(s, WEIGHTS)),
              `disagreed at P=${propensity} V=${value} B=${boost} C=${context}`
            ).toBe(true);
            compared++;
          }

    expect(compared).toBe(5 * 5 * 6 * 4);
  });

  it('agrees under non-unit weights, which is where pow actually bites', () => {
    const w = { propensity: 1.5, value: 0.8, boost: 1, context: 0.25 };
    const s = { propensity: 0.37, value: 2.4, boost: 1.25, context: 0.6 };
    expect(Object.is(evaluateUtility(MULTIPLICATIVE, s, w), hardCoded(s, w))).toBe(true);
  });
});

describe('the evaluator', () => {
  const fn = (ast: UtilityFunction['ast']): UtilityFunction => ({
    id: 'test',
    version: '0.0.0',
    expression: 'test',
    terms: [],
    weights: [],
    ast,
  });

  it('folds each operation the way the arithmetic says', () => {
    expect(evaluateUtility(fn({ op: 'const', value: 3 }), {}, {})).toBe(3);
    expect(
      evaluateUtility(fn({ op: 'add', operands: [{ op: 'const', value: 2 }, { op: 'const', value: 5 }] }), {}, {})
    ).toBe(7);
    expect(
      evaluateUtility(
        fn({ op: 'sub', left: { op: 'const', value: 2 }, right: { op: 'const', value: 5 } }),
        {},
        {}
      )
    ).toBe(-3);
    expect(
      evaluateUtility(fn({ op: 'max', operands: [{ op: 'const', value: 2 }, { op: 'const', value: 5 }] }), {}, {})
    ).toBe(5);
    expect(
      evaluateUtility(fn({ op: 'min', operands: [{ op: 'const', value: 2 }, { op: 'const', value: 5 }] }), {}, {})
    ).toBe(2);
  });

  it('identities hold for empty operand lists', () => {
    // mul of nothing is 1 and add of nothing is 0, so a function built by
    // filtering terms down to none degrades predictably rather than to NaN.
    expect(evaluateUtility(fn({ op: 'mul', operands: [] }), {}, {})).toBe(1);
    expect(evaluateUtility(fn({ op: 'add', operands: [] }), {}, {})).toBe(0);
  });

  it('throws on a term nobody supplied rather than treating it as zero', () => {
    // Silently defaulting is how a ranking function starts quietly ignoring a
    // term it was configured to use. The engine decides what a missing score
    // means; the evaluator does not get to guess.
    expect(() => evaluateUtility(fn({ op: 'term', name: 'churn' }), {}, {})).toThrow(
      UtilityTermMissing
    );
    expect(() => evaluateUtility(fn({ op: 'weight', name: 'churn' }), {}, {})).toThrow(
      /weight "churn"/
    );
  });

  it('reads a supplied zero as zero, not as missing', () => {
    expect(evaluateUtility(fn({ op: 'term', name: 'cost' }), { cost: 0 }, {})).toBe(0);
  });
});

describe('expected-value@1.0.0', () => {
  it('is expected value less cost, then boosted', () => {
    // (0.5 × 4 − 1) × 1.25 = 1.25
    expect(
      evaluateUtility(
        EXPECTED_VALUE,
        { propensity: 0.5, value: 4, cost: 1, boost: 1.25 },
        {}
      )
    ).toBe(1.25);
  });

  it('goes negative when delivery costs more than the offer is worth', () => {
    // The ranking function has to be able to say an offer is not worth making.
    // Clamping at zero here would make every loss-making offer look equally
    // marginal, and the sort would then be arbitrary between them.
    expect(
      evaluateUtility(EXPECTED_VALUE, { propensity: 0.2, value: 1, cost: 3, boost: 1 }, {})
    ).toBeLessThan(0);
  });

  it('reads no weights, so the weight editor does not silently do nothing', () => {
    expect(EXPECTED_VALUE.weights).toEqual([]);
  });
});

describe('the built-in registry', () => {
  it('resolves by id and version together', () => {
    expect(resolveUtility({ id: 'multiplicative', version: '1.0.0' })).toBe(MULTIPLICATIVE);
    // A version that does not exist is not silently the nearest one.
    expect(resolveUtility({ id: 'multiplicative', version: '2.0.0' })).toBeUndefined();
    expect(resolveUtility({ id: 'nope', version: '1.0.0' })).toBeUndefined();
  });

  it('every built-in reads only terms the engine produces', () => {
    // The same invariant the compiler enforces on a config. Asserted here too,
    // because a built-in that broke it would be shipped rather than authored,
    // and would never pass through the compiler's check.
    for (const f of BUILT_IN_UTILITY_FUNCTIONS) {
      const unknown = f.terms.filter((t) => !KNOWN_TERMS.includes(t));
      expect(unknown, `${utilityKey(f)} reads unknown terms`).toEqual([]);
    }
  });

  it('declares every term and weight its AST actually reads', () => {
    // A function that reads a term it does not declare would pass the
    // compiler's availability check and then throw at execution time.
    const walk = (e: UtilityFunction['ast'], terms: Set<string>, weights: Set<string>) => {
      switch (e.op) {
        case 'term':
          terms.add(e.name);
          break;
        case 'weight':
          weights.add(e.name);
          break;
        case 'pow':
          walk(e.base, terms, weights);
          walk(e.exponent, terms, weights);
          break;
        case 'sub':
          walk(e.left, terms, weights);
          walk(e.right, terms, weights);
          break;
        case 'mul':
        case 'add':
        case 'max':
        case 'min':
          e.operands.forEach((o) => walk(o, terms, weights));
          break;
        case 'const':
          break;
      }
    };

    for (const f of BUILT_IN_UTILITY_FUNCTIONS) {
      const terms = new Set<string>();
      const weights = new Set<string>();
      walk(f.ast, terms, weights);
      expect([...terms].sort(), `${utilityKey(f)} terms`).toEqual([...f.terms].sort());
      expect([...weights].sort(), `${utilityKey(f)} weights`).toEqual([...f.weights].sort());
    }
  });

  it('no two built-ins share an id and version', () => {
    const keys = BUILT_IN_UTILITY_FUNCTIONS.map(utilityKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
