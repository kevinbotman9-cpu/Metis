/**
 * Where candidates fall out of decisions, summed over decisions.
 *
 * `/performance` answers what happened after a decision. This answers what
 * happened inside one, across all of them: of every candidate a flow was allowed
 * to consider, how many each kind of rule removed, and which rule removed most.
 * The trace reader shows that for one decision; a decisioning architect's first
 * question is where it happens across ten thousand.
 *
 * ## Why stages are reason codes, not nodes or tiers
 *
 * A flow's nodes are not a common spine. `next-best-action` runs eligibility,
 * relevance and a contact constraint; another flow could run one filter and
 * nothing else, or the same tiers in another order. Summing by node would add
 * unlike things.
 *
 * A node's compiled tier is not the answer either. The engine applies consent
 * and frequency at *every* constraint node, so a node tiered `suitability` can
 * record `CONSENT_WITHHELD` (`packages/compiler/src/decision-flow/compile.ts`).
 * And a flow with no constraint node before ranking has consent applied by the
 * platform, as a `__consent` step that is no node at all (G-015).
 *
 * Every removal carries exactly one reason code from a closed set that is never
 * renamed. So the stages here are those codes, in the order a decision meets
 * them, and the unit is a candidate within a decision.
 *
 * ## Why the stages nest
 *
 * Within one decision a candidate is removed once or it wins. So across
 * decisions, "not removed by any of the first k stages" is a genuine subset of
 * "not removed by any of the first k−1", whatever order a particular flow ran its
 * nodes in — which is the property the Cascade pattern rests on
 * (`METIS_CONSOLE_SPEC.md` §4.7). A decision whose removals and winner do not
 * add up to its candidates breaks that, and is counted rather than hidden.
 */

import { REASON_CODES } from '@metis/runtime';
import type { LedgerEntry } from './types';

type ReasonCode = (typeof REASON_CODES)[number];

/**
 * The stages, in the order a decision meets them. Every reason code belongs to
 * exactly one — `tests/policy-funnel.test.ts` fails if a code is added to the
 * closed set and not given a stage.
 */
export const FUNNEL_STAGES = [
  { id: 'not_live', codes: ['NOT_ACTIVE', 'OUT_OF_VALIDITY_WINDOW'] },
  { id: 'eligibility', codes: ['ELIGIBILITY_FAILED'] },
  { id: 'relevance', codes: ['RELEVANCE_FAILED'] },
  { id: 'suitability', codes: ['SUITABILITY_FAILED'] },
  { id: 'consent', codes: ['CONSENT_WITHHELD'] },
  // An unreadable contact history suppresses by the cap that covers the
  // candidate, so it is the cap's stage (ADR-021 §4).
  { id: 'frequency', codes: ['CONTACT_HISTORY_UNAVAILABLE', 'FREQUENCY_CAP_BREACHED', 'COOLDOWN_ACTIVE'] },
  { id: 'not_ranked', codes: ['NOT_RANKED'] },
] as const satisfies readonly { id: string; codes: readonly ReasonCode[] }[];

export type FunnelStageId = (typeof FUNNEL_STAGES)[number]['id'];

/** One candidate's removal: why, and by which rule where one is identifiable. */
export interface FunnelRemoval {
  code: string;
  ruleId: string | null;
}

/** One decision, reduced to what the funnel counts. */
export interface FunnelDecision {
  decisionId: string;
  occurredAt: string;
  /** Candidates the flow was allowed to consider. */
  candidates: number;
  winner: string | null;
  removals: readonly FunnelRemoval[];
}

/** The removals one rule made within one stage. */
export interface FunnelRule {
  /** Null for codes that are properties of the candidate rather than of a rule. */
  ruleId: string | null;
  code: string;
  /** Candidates removed. */
  removed: number;
  /** Distinct decisions it removed at least one candidate from. */
  decisions: number;
  /** The first decision in input order it removed a candidate from, so the number links to a trace. */
  sampleDecisionId: string;
}

export interface FunnelStage {
  id: FunnelStageId;
  codes: string[];
  /**
   * Whether any flow in range asks this question.
   *
   * Null when the caller did not say — which is different from false, and a
   * screen must not render "nobody told us" as "not asked". True whenever the
   * stage removed something, whatever the caller said: a stage that removed a
   * candidate asked.
   */
  asked: boolean | null;
  removed: number;
  /** Candidates left after this stage and every stage before it. */
  survived: number;
  /** Largest first. */
  rules: FunnelRule[];
}

export interface PolicyFunnelReport {
  decisions: number;
  /** Candidates the flows were allowed to consider, summed over decisions. */
  entered: number;
  /** Decisions with a winner. Equal to the last stage's survivors when every decision is accounted for. */
  offered: number;
  /** All seven, always, in `FUNNEL_STAGES` order. */
  stages: FunnelStage[];
  /**
   * Decisions whose removals and winner do not add up to their candidates, or
   * that carry a code outside the closed set. Zero on a correct engine; not zero
   * means the stages below are not a decomposition, and the screen says so.
   */
  unaccounted: number;
  from: string | null;
  to: string | null;
}

/** A ledger entry as the funnel reads it. */
export function funnelDecisionOf(entry: LedgerEntry): FunnelDecision {
  const d = entry.record.decision;
  return {
    decisionId: entry.decisionId,
    occurredAt: entry.occurredAt,
    candidates: d.candidateKeys.length,
    winner: d.winner,
    removals: d.eliminations.flatMap((step) =>
      step.denials.map((denial) => ({ code: denial.code, ruleId: denial.ruleId ?? null }))
    ),
  };
}

const STAGE_OF_CODE = new Map<string, number>(
  FUNNEL_STAGES.flatMap((stage, i) => stage.codes.map((code) => [code, i] as const))
);

/**
 * Sum decisions into stages.
 *
 * `asked` is the set of stages some flow in range asks, from the compiled
 * artifacts. Omitted, every stage's `asked` is null. The ledger has no opinion
 * about artifacts, so the fact is passed in by whoever has them — the same
 * reason `buildPerformance` takes its deliverable channels.
 */
export function buildPolicyFunnel(
  decisions: readonly FunnelDecision[],
  asked?: ReadonlySet<FunnelStageId>
): PolicyFunnelReport {
  type Bucket = FunnelRule & { lastDecisionId: string };

  const removed = FUNNEL_STAGES.map(() => 0);
  const buckets = FUNNEL_STAGES.map(() => new Map<string, Bucket>());
  let entered = 0;
  let offered = 0;
  let unaccounted = 0;
  let from: string | null = null;
  let to: string | null = null;

  for (const decision of decisions) {
    if (from === null || decision.occurredAt < from) from = decision.occurredAt;
    if (to === null || decision.occurredAt > to) to = decision.occurredAt;
    entered += decision.candidates;
    if (decision.winner) offered += 1;

    let counted = 0;
    let unknown = false;
    for (const removal of decision.removals) {
      const stage = STAGE_OF_CODE.get(removal.code);
      if (stage === undefined) {
        unknown = true;
        continue;
      }
      counted += 1;
      removed[stage] += 1;

      // JSON rather than a delimiter, for the reason `buildPerformance` gives:
      // injective for strings, so no rule id can collide with another pair.
      const key = JSON.stringify([removal.ruleId, removal.code]);
      let bucket = buckets[stage].get(key);
      if (!bucket) {
        bucket = {
          ruleId: removal.ruleId,
          code: removal.code,
          removed: 0,
          decisions: 0,
          sampleDecisionId: decision.decisionId,
          lastDecisionId: '',
        };
        buckets[stage].set(key, bucket);
      }
      bucket.removed += 1;
      // Decisions are summed one at a time, so a rule seen again in the same
      // decision is the same decision.
      if (bucket.lastDecisionId !== decision.decisionId) {
        bucket.lastDecisionId = decision.decisionId;
        bucket.decisions += 1;
      }
    }

    if (unknown || counted + (decision.winner ? 1 : 0) !== decision.candidates) unaccounted += 1;
  }

  let survivors = entered;
  const stages: FunnelStage[] = FUNNEL_STAGES.map((stage, i) => {
    survivors -= removed[i];
    return {
      id: stage.id,
      codes: [...stage.codes],
      asked: asked ? asked.has(stage.id) || removed[i] > 0 : null,
      removed: removed[i],
      survived: survivors,
      rules: [...buckets[i].values()]
        .map(({ lastDecisionId: _, ...rule }) => rule)
        // Largest first: the rule that removed the most is the one worth reading.
        // Then by name, so a tie does not reorder between refreshes.
        .sort(
          (a, b) =>
            b.removed - a.removed || (a.ruleId ?? a.code).localeCompare(b.ruleId ?? b.code)
        ),
    };
  });

  return { decisions: decisions.length, entered, offered, stages, unaccounted, from, to };
}
