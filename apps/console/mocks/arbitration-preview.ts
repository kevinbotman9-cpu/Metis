/**
 * Which arbitration weights move no offer, read from the engine's own scores.
 *
 * The ranking function multiplies each term raised to its weight. A term every
 * offer shares scales every priority by the same factor whatever its weight, so
 * that weight can reorder nothing. Found from the scores a decision recorded,
 * never listed: in this tenant the answer is propensity and context, and a list
 * saying so would stay true in a test and become false the day a flow gains a
 * scoring node.
 */

import type { DecisionRecord } from '@metis/runtime/deterministic/types';

export const WEIGHT_TERMS = ['propensity', 'value', 'boost', 'context'] as const;
export type WeightTerm = (typeof WEIGHT_TERMS)[number];

export interface InertWeight {
  weight: WeightTerm;
  /** The value every offer that reached arbitration carries for the term. */
  value: number;
  reason: string;
}

type Scored = Pick<DecisionRecord['decision'], 'scores' | 'arbitration'>;

export function inertWeights(decision: Scored): InertWeight[] {
  const keys = Object.keys(decision.scores);
  if (keys.length === 0) return [];

  // Propensity and context stand in for model outputs; when no scoring node ran
  // for any offer, every offer carries the flow's declared default for both.
  const applied = decision.arbitration.missingScore.applied;
  const noScoringNode = keys.every((k) => applied.includes(k));

  return WEIGHT_TERMS.flatMap((term) => {
    const values = keys.map((k) => decision.scores[k][term]);
    if (values.some((v) => v !== values[0])) return [];
    const declaredDefault = noScoringNode && (term === 'propensity' || term === 'context');
    return [
      {
        weight: term,
        value: values[0],
        reason: declaredDefault
          ? `No effect here: this flow has no scoring node, so every offer carries the declared default ${term} of ${values[0]}, and a weight on a term every offer shares moves no offer. It takes effect when a flow scores ${term}.`
          : `No effect here: every offer in this scenario has the same ${term} (${values[0]}), so its weight moves no offer.`,
      },
    ];
  });
}
