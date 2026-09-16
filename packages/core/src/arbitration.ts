/**
 * Rank candidates under a set of weights, the way the engine does.
 *
 * The engine scores each candidate that reaches an `arbitrate` node — its
 * propensity, value, boost, context and cost — and only then combines those
 * terms under the tenant's weights. Everything weight-dependent in a ranking is
 * therefore this: the ranking function, the rounding, and the tie-break. So a
 * screen holding one scenario's terms can show the ranking under any weights
 * without making a decision, and it will be the ranking a decision would make.
 *
 * "Would make" is a claim, and it is checked rather than asserted:
 * `apps/console/tests/unit/arbitration-agreement.test.ts` runs the engine over
 * a grid of weights and requires every priority, and the winner, to match.
 *
 * ## Ties
 *
 * Two candidates share a priority when their priorities are equal *after* the
 * engine's rounding — the engine compares rounded numbers, so that is the only
 * equality that changes an order. When they do, the engine orders them by key
 * (`engine.ts`, `a.key.localeCompare(b.key)`): the order is alphabetical, not
 * decided. A tie is reported from the numbers, never from a list of keys
 * somebody expected to collide.
 */

import { evaluateUtility, resolveUtility, utilityKey } from './utility';

export type RankingTerms = {
  propensity: number;
  value: number;
  boost: number;
  context: number;
  cost: number;
};

export interface CandidateTerms {
  key: string;
  name: string;
  terms: RankingTerms;
}

export interface RankedCandidate extends CandidateTerms {
  /** 1 is the winner. */
  rank: number;
  /** Rounded as the engine records it. */
  priority: number;
  /** The keys sharing this candidate's priority, if any. */
  tiedWith: string[];
}

export interface Ranking {
  rows: RankedCandidate[];
  /** Each group of two or more keys sharing a priority, in rank order. */
  ties: string[][];
}

/**
 * The decimal places a priority is recorded to, and ADR-003's rounding.
 *
 * Both repeat `@metis/runtime/deterministic` — the engine rounds a priority with
 * `round(…, 8)` from `canonical.ts` — because the runtime depends on this
 * package and not the other way round. The agreement test is what keeps the
 * copy honest.
 */
export const PRIORITY_DECIMAL_PLACES = 8;

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function rankCandidates(
  candidates: readonly CandidateTerms[],
  weights: Record<string, number>,
  utility: { id: string; version: string }
): Ranking {
  const fn = resolveUtility(utility);
  if (!fn) {
    throw new Error(
      `No ranking function ${utilityKey(utility)}. A tenant's configuration names one the engine knows, or no decision can be ranked.`
    );
  }

  const scored = candidates.map((c) => ({
    ...c,
    priority: round(evaluateUtility(fn, c.terms, weights), PRIORITY_DECIMAL_PLACES),
  }));

  // The engine's order: priority, and then the order the candidates arrived
  // in, which is the order the flow declared them (ADR-019 §8). It was
  // priority then key until then, and the engine's tie-break moved because a
  // rename should not be able to move a winner — a preview that still broke
  // ties by name would disagree with the decision it is previewing the moment
  // two candidates scored the same.
  //
  // `Array.prototype.sort` is stable, so equal priorities keep their input
  // order and there is nothing further to compare. **Callers pass candidates in
  // the artifact's declared order**: the console builds them from the decision's
  // own `scores`, which the engine fills candidate by candidate in that order.
  scored.sort((a, b) => b.priority - a.priority);

  const byPriority = new Map<number, string[]>();
  for (const s of scored) {
    const group = byPriority.get(s.priority);
    if (group) group.push(s.key);
    else byPriority.set(s.priority, [s.key]);
  }

  return {
    rows: scored.map((s, i) => ({
      ...s,
      rank: i + 1,
      tiedWith: byPriority.get(s.priority)!.filter((k) => k !== s.key),
    })),
    ties: [...byPriority.values()].filter((g) => g.length > 1),
  };
}

/**
 * How far each candidate moved between two rankings of the same candidates.
 *
 * Positive is up. A candidate absent from `before` has not moved: there is no
 * earlier place to have moved from.
 */
export function movement(before: Ranking, after: Ranking): Record<string, number> {
  const was = new Map(before.rows.map((r) => [r.key, r.rank]));
  return Object.fromEntries(after.rows.map((r) => [r.key, (was.get(r.key) ?? r.rank) - r.rank]));
}
