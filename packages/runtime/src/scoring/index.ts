import { seededUnitInterval, round } from '../deterministic/canonical';
import type { ExecArtifact, ExecNode, DecisionRequest } from '../deterministic/types';

/**
 * Scoring, resolved before the decision runs — ADR-009 phase one.
 *
 * Until 2026-09-09 a `score-model` node computed its own propensity inside
 * `execute`, from `seededUnitInterval`. That was fine while the scorer was a
 * hash and impossible the moment it becomes a model, because a model call is
 * I/O and `packages/runtime/tests/no-egress.test.ts` asserts the decision path
 * opens no socket — for `execute` **and** for `replay`.
 *
 * So scoring moves to where connector resolution already is: a phase that runs
 * *before* the deterministic core, can be concurrent, can be latency-budgeted
 * at compile time, and whose output is hashed into the input snapshot. The core
 * then reads a score the way a source node reads a field somebody already
 * fetched.
 *
 * **This phase changes no arithmetic.** The same expression, the same rounding,
 * the same seed arguments, in a different file. Every chain hash in
 * `docs/conformance/decision-corpus.json` is byte-identical afterwards, which
 * is the only way to know the move was faithful — and if one moves, that is the
 * bug, not the corpus.
 *
 * ## The guard that makes the transitional shape safe
 *
 * `execute` still resolves scores for itself when a caller does not supply
 * them, because 70-odd call sites otherwise change in one commit and each is a
 * chance to move a hash. That convenience is exactly the hole ADR-009 warns
 * about: when a real model arrives, an un-updated caller would silently get a
 * seeded score instead of a model score, and nothing would say so.
 *
 * The guard is `pure`. A scorer that needs no I/O may run inside the core; one
 * that does not is refused there, loudly, with the caller named. So the seam is
 * real today rather than real once somebody remembers.
 */

/** What a scorer needs to produce one propensity. */
export interface ScoringContext {
  tenantId: string;
  customerId: string;
  /** The offer's decidable key. */
  offerKey: string;
  /** `id@version` of the pinned model, or the node id where none is named. */
  modelKey: string;
}

export interface PropensityScorer {
  id: string;
  /**
   * May this run inside the deterministic core?
   *
   * True only for a scorer that reaches nothing: no socket, no file, no clock.
   * A model-backed scorer is false, and `execute` will refuse to call it rather
   * than quietly opening a connection the no-egress test forbids.
   */
  pure: boolean;
  score(ctx: ScoringContext): number;
}

/**
 * The scorer this platform has always had.
 *
 * A pinned deterministic function, not a trained model. The expression is moved
 * verbatim from `engine.ts` — `0.05 + seededUnitInterval(...) * 0.9`, rounded
 * to six decimal places by ADR-003's rule — because any change to it moves
 * every hash in every corpus.
 *
 * The floor of 0.05 and the span of 0.9 are not arbitrary and are worth keeping
 * together with a note: a propensity of exactly zero would zero a multiplicative
 * ranking function and make the other terms unreadable, and one of exactly one
 * would look like certainty.
 */
export const SEEDED_PROPENSITY: PropensityScorer = {
  id: 'seeded',
  pure: true,
  score: ({ customerId, offerKey, modelKey }) =>
    round(0.05 + seededUnitInterval(customerId, offerKey, modelKey) * 0.9, 6),
};

/**
 * Which scorer answers for a node.
 *
 * Every score node resolves to `seeded` today. The indirection is the seam the
 * model gateway (W-029) registers against: when a model registry exists, this
 * reads the pinned model's declared runtime and the `pure` guard starts biting
 * on real traffic rather than only in a test.
 */
let resolveScorer: (node: ExecNode) => PropensityScorer = () => SEEDED_PROPENSITY;

export function scorerFor(node: ExecNode): PropensityScorer {
  return resolveScorer(node);
}

/**
 * Replace the resolver.
 *
 * Exported for the gateway that does not exist yet, and used by
 * `tests/scoring.test.ts` to prove the `pure` guard refuses an impure scorer
 * inside the core. Returns the previous resolver so a caller can restore it,
 * because a global left swapped is a test that breaks the next one.
 */
export function setScorerResolver(
  next: (node: ExecNode) => PropensityScorer
): (node: ExecNode) => PropensityScorer {
  const previous = resolveScorer;
  resolveScorer = next;
  return previous;
}

/** `id@version` of the pinned model, or the node id where none is named. */
export function modelKeyOf(node: ExecNode): string {
  return node.model ? `${node.model.id}@${node.model.version}` : node.id;
}

/** Propensities, keyed by model then by offer key. */
export type ResolvedScores = Map<string, Map<string, number>>;

/** The score nodes in an artifact, in artifact order so resolution is stable. */
export function scoreNodes(artifact: ExecArtifact): ExecNode[] {
  return artifact.nodes.filter((n) => n.type === 'score-model' || n.type === 'score-adaptive');
}

/**
 * Resolve every propensity this artifact will need, before the core runs.
 *
 * Resolves for the artifact's whole candidate set rather than for the
 * survivors, because the survivors are not known until the core has run and
 * this has to finish first. With a pure scorer that costs nothing; with a model
 * it is real waste, and it is the reason a model gateway will want batching
 * rather than one call per candidate. Worth stating now rather than
 * rediscovering: over-resolution is the price of running before the filters.
 *
 * Synchronous today because the only scorer is arithmetic. The signature is the
 * one thing here that will change when a model arrives, and it changes to
 * `Promise<ResolvedScores>` — which is why `execute` takes the result rather
 * than the resolver.
 */
export function resolveScores(
  artifact: ExecArtifact,
  request: Pick<DecisionRequest, 'tenantId' | 'customerId'>,
  offerKeys: readonly string[]
): ResolvedScores {
  const resolved: ResolvedScores = new Map();
  for (const node of scoreNodes(artifact)) {
    const scorer = scorerFor(node);
    const modelKey = modelKeyOf(node);
    const byOffer = resolved.get(modelKey) ?? new Map<string, number>();
    for (const offerKey of offerKeys) {
      if (byOffer.has(offerKey)) continue;
      byOffer.set(
        offerKey,
        scorer.score({
          tenantId: request.tenantId,
          customerId: request.customerId,
          offerKey,
          modelKey,
        })
      );
    }
    resolved.set(modelKey, byOffer);
  }
  return resolved;
}

/**
 * Thrown when the core is asked to score with something it must not run.
 *
 * The failure this prevents: a caller that has not been updated to resolve
 * first, running against a model-backed scorer, silently getting a seeded
 * number and a decision that looks reproducible and is not.
 */
export class ScoresNotResolved extends Error {
  constructor(readonly nodeId: string, readonly scorerId: string) {
    super(
      `Node '${nodeId}' scores with '${scorerId}', which cannot run inside the deterministic ` +
        'core. Call resolveScores() before execute() and pass the result. See ADR-009 §2.'
    );
    this.name = 'ScoresNotResolved';
  }
}
