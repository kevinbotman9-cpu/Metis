/**
 * Composing a slate from a decision.
 *
 * A decision names one winner. A placement has slots, and a page with six of
 * them cannot be filled by six decisions that each say the same thing. So a
 * container answers with a list.
 *
 * **The list is not a second decision.** It is a projection of one, and that is
 * the whole design: every candidate that reached ranking is already in the
 * record, with its priority, and the ones that did not win are already recorded
 * as `NOT_RANKED` at the arbitrate node. Composing a slate therefore reads the
 * decision rather than re-deciding, so it moves no chain hash, needs no change
 * in either engine, and cannot disagree with the winner it starts from.
 *
 * That is also the limit. Ordering by priority is the whole of the composition
 * rule here — W-052 is the contract, and *which* N is W-028: cardinality,
 * mutual exclusion, diversity, budget, inventory and fairness. When those land
 * they will need to be part of the hashed decision, because a slate composed by
 * a rule nobody recorded is not explainable. Ranking alone is explainable from
 * the record as it stands, which is why this half can ship first.
 */

import type { DeterministicDecision } from './deterministic/types';
import { orderCandidates } from './deterministic/engine';

export interface SlateEntry {
  /** 1-based, so a caller can render "slot 1 of 3" without arithmetic. */
  rank: number;
  /** The action key, as the decision named it. */
  action: string;
  /** The priority ranking gave it. Same number that chose the winner. */
  priority: number;
  /**
   * The offer the action instances, as the decision stored it — present on a
   * recorded slate (`recordedSlate`), never looked up in a catalogue that has
   * moved on since (ADR-020 §1).
   */
  offerId?: string;
}

export interface Slate {
  entries: SlateEntry[];
  /**
   * Slots the decision could not fill.
   *
   * Stated rather than padded. A placement asking for three where two
   * candidates survived gets two and a count, because the honest answer to "we
   * have nothing else to show you" is not a third-best offer that failed a
   * gate.
   */
  unfilled: number;
  /**
   * Every candidate that reached ranking, in order, before the slot count was
   * applied. Present so a caller can say "3 of 5 shown" and a trace view can
   * show what the slate left out.
   */
  ranked: SlateEntry[];
}

/**
 * The candidates that reached arbitration, in the order ranking put them.
 *
 * Recovered from the arbitrate step rather than from `scores`, which also holds
 * candidates that were scored and then removed by a later gate — a suitability
 * filter placed after a scoring node is an ordinary flow shape, and ranking a
 * candidate that a policy refused would be a serious defect rather than an
 * untidy one.
 */
function finalists(decision: DeterministicDecision): string[] {
  const step = [...decision.eliminations].reverse().find((s) => s.nodeType === 'arbitrate');
  if (!step) return [];

  // Survivors plus everyone beaten at that node. NOT_RANKED means "passed every
  // gate and lost", which is exactly the set a slate is drawn from; any other
  // code at this node would mean the candidate was refused, not out-ranked.
  const beaten = step.denials.filter((d) => d.code === 'NOT_RANKED').map((d) => d.key);
  return [...new Set([...step.survived, ...beaten])];
}

/**
 * Order candidates the way arbitration did: priority descending, then the order
 * the flow declared them in.
 *
 * The tie-break is not cosmetic. Two candidates on an identical priority would
 * otherwise swap between runs, and a slate that reorders on replay is a slate
 * that cannot be audited. So this does not copy the engine's comparator, it
 * calls it: `orderCandidates`, over the decision's own recorded `candidateKeys`.
 *
 * It copied it until ADR-020 §6. The engine moved to declared order at ADR-019
 * §8 and this went on breaking ties by key, under a comment saying it mirrored
 * the engine exactly — so a rename could change what a customer was shown in
 * slot 2 without changing any decision.
 */
/**
 * The slate the decision recorded — ADR-020 §1, §2.
 *
 * What a placement serves. `selectSlate` below is a projection of the
 * finalists at any slot count, for a comparison or a preview; this is what was
 * shown, at the slot count the decision was made with, with each entry's offer
 * as the decision stored it. A replayed request gets the slate the original
 * returned, whatever the placement says today.
 */
export function recordedSlate(decision: DeterministicDecision): Slate {
  return {
    entries: decision.slate.map((e) => ({ rank: e.rank, action: e.action, priority: e.priority, offerId: e.offerId })),
    unfilled: Math.max(0, decision.slotCount - decision.slate.length),
    ranked: selectSlate(decision, decision.slotCount).ranked,
  };
}

export function selectSlate(decision: DeterministicDecision, slotCount: number): Slate {
  if (!Number.isInteger(slotCount) || slotCount < 1) {
    throw new RangeError(`A placement must have at least one slot; got ${slotCount}`);
  }

  const ranked = orderCandidates(
    finalists(decision).map((key) => ({ key })),
    decision.scores,
    { id: decision.artifactId, version: decision.artifactVersion, candidateKeys: decision.candidateKeys }
  ).map(({ key }, i) => ({ rank: i + 1, action: key, priority: decision.scores[key].priority }));

  return {
    entries: ranked.slice(0, slotCount),
    unfilled: Math.max(0, slotCount - ranked.length),
    ranked,
  };
}
