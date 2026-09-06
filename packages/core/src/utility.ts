/**
 * Ranking functions, typed and versioned.
 *
 * The engine used to hard-code `pow(propensity,wP) * pow(value,wV) *
 * pow(boost,wB) * pow(context,wC)`. §6 of the platform specification names that
 * directly: *do not hard-code the multiplicative formula; make utility
 * functions typed, versioned and testable.* A tenant that ranks on expected
 * value minus cost is not an exotic case, and it should not require an engine
 * change.
 *
 * Three constraints shape what this is:
 *
 *   - **No `eval`, and no expression parser.** The AST below is the whole
 *     language. A string expression would either need a parser in both engines
 *     — two chances to disagree on precedence — or `eval`, which is neither
 *     deterministic across runtimes nor inspectable by a compiler.
 *   - **A closed operation set.** Every operation is one a second
 *     implementation can reproduce exactly, and `pow` carries the fdlibm
 *     semantics ADR-003 §4a already pins down.
 *   - **Versioned, and recorded in the decision.** A decision has to identify
 *     every version that produced it. Changing a function's arithmetic means a
 *     new version, never an edit — the old one still has decisions pointing at
 *     it.
 */

/** The terms the engine knows how to produce for a candidate. */
export const KNOWN_TERMS = ['propensity', 'value', 'boost', 'context', 'cost'] as const;
export type TermName = (typeof KNOWN_TERMS)[number];

export type UtilityExpr =
  | { op: 'const'; value: number }
  /** A per-candidate score term. */
  | { op: 'term'; name: string }
  /** A tenant-level weight from the arbitration config. */
  | { op: 'weight'; name: string }
  | { op: 'pow'; base: UtilityExpr; exponent: UtilityExpr }
  | { op: 'mul'; operands: UtilityExpr[] }
  | { op: 'add'; operands: UtilityExpr[] }
  | { op: 'sub'; left: UtilityExpr; right: UtilityExpr }
  | { op: 'max'; operands: UtilityExpr[] }
  | { op: 'min'; operands: UtilityExpr[] };

export interface UtilityFunction {
  id: string;
  /** Semver. Arithmetic changes are a new version, never an edit. */
  version: string;
  /** One line for the trace and the UI. Display only — never parsed. */
  expression: string;
  /** Score terms this reads. The compiler checks the engine can produce them. */
  terms: TermName[];
  /** Weights this reads, from `ArbitrationConfig.weights`. */
  weights: string[];
  ast: UtilityExpr;
}

/**
 * A term the function asked for that was not supplied.
 *
 * Thrown rather than defaulted. The engine decides what a missing *score*
 * means — a candidate with no model score ranks on the other terms, and the
 * neutral value for that is 1.0 under exponentiation and 0 under addition, so
 * only the engine knows which. A function asking for a term nobody produces is
 * a different thing, and it is a bug.
 */
export class UtilityTermMissing extends Error {
  constructor(readonly term: string, readonly kind: 'term' | 'weight') {
    super(`Utility function referenced ${kind} "${term}", which was not supplied.`);
    this.name = 'UtilityTermMissing';
  }
}

export function evaluateUtility(
  fn: UtilityFunction,
  terms: Record<string, number>,
  weights: Record<string, number>
): number {
  const walk = (e: UtilityExpr): number => {
    switch (e.op) {
      case 'const':
        return e.value;
      case 'term': {
        const v = terms[e.name];
        if (v === undefined) throw new UtilityTermMissing(e.name, 'term');
        return v;
      }
      case 'weight': {
        const v = weights[e.name];
        if (v === undefined) throw new UtilityTermMissing(e.name, 'weight');
        return v;
      }
      // Math.pow, not `**`, and deliberately: ADR-003 §4a pins the fdlibm
      // semantics both engines are held to, and the corpus is what proves the
      // Kotlin side agrees.
      case 'pow':
        return Math.pow(walk(e.base), walk(e.exponent));
      case 'mul':
        return e.operands.reduce((a, o) => a * walk(o), 1);
      case 'add':
        return e.operands.reduce((a, o) => a + walk(o), 0);
      case 'sub':
        return walk(e.left) - walk(e.right);
      case 'max':
        return e.operands.map(walk).reduce((a, b) => (b > a ? b : a));
      case 'min':
        return e.operands.map(walk).reduce((a, b) => (b < a ? b : a));
    }
  };
  return walk(fn.ast);
}

const term = (name: TermName): UtilityExpr => ({ op: 'term', name });
const weight = (name: string): UtilityExpr => ({ op: 'weight', name });

/**
 * The formula the engine used to hard-code, bit for bit.
 *
 * Kept as a built-in rather than deleted: every decision made before this
 * change was ranked by it, and a replay has to reproduce them. The test that
 * matters is that it yields the same chain hashes as the hard-coded version
 * did — a refactor that changes an answer is not a refactor.
 */
export const MULTIPLICATIVE: UtilityFunction = {
  id: 'multiplicative',
  version: '1.0.0',
  expression: 'P^wP × V^wV × B^wB × C^wC',
  terms: ['propensity', 'value', 'boost', 'context'],
  weights: ['propensity', 'value', 'boost', 'context'],
  ast: {
    op: 'mul',
    operands: [
      { op: 'pow', base: term('propensity'), exponent: weight('propensity') },
      { op: 'pow', base: term('value'), exponent: weight('value') },
      { op: 'pow', base: term('boost'), exponent: weight('boost') },
      { op: 'pow', base: term('context'), exponent: weight('context') },
    ],
  },
};

/**
 * Expected value, less what it costs to deliver.
 *
 * `propensity × value − cost`, then the business boost applied as a multiplier
 * on the result rather than as an exponent — which is what a boost means when
 * the quantity is money rather than a unitless product.
 *
 * The specification's example is "expected value minus cost and risk
 * penalties". There is no risk term in the model, so there is none here: a
 * `riskPenalty` that always evaluated to zero would look like a considered
 * feature and be a placeholder. Registered as a gap instead.
 */
export const EXPECTED_VALUE: UtilityFunction = {
  id: 'expected-value',
  version: '1.0.0',
  expression: '(P × V − Cost) × B',
  terms: ['propensity', 'value', 'cost', 'boost'],
  weights: [],
  ast: {
    op: 'mul',
    operands: [
      {
        op: 'sub',
        left: { op: 'mul', operands: [term('propensity'), term('value')] },
        right: term('cost'),
      },
      term('boost'),
    ],
  },
};

export const BUILT_IN_UTILITY_FUNCTIONS: readonly UtilityFunction[] = [
  MULTIPLICATIVE,
  EXPECTED_VALUE,
];

export function utilityKey(ref: { id: string; version: string }): string {
  return `${ref.id}@${ref.version}`;
}

export function resolveUtility(ref: {
  id: string;
  version: string;
}): UtilityFunction | undefined {
  return BUILT_IN_UTILITY_FUNCTIONS.find(
    (f) => f.id === ref.id && f.version === ref.version
  );
}
