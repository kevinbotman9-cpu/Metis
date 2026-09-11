/**
 * METIS Runtime - deterministic execution engine.
 *
 * Given the same artifact, catalogue snapshot and request, `execute` produces a
 * byte-identical decision. `replay` re-runs a stored decision and compares the
 * reproducible half. tests/determinism.test.ts fails the build if either stops
 * holding.
 *
 * The Phase 0 executor that used to live beside this was removed: it stamped
 * crypto.randomUUID() and Date.now() into the trace it hashed, so replay could
 * never have worked, and nothing depended on it.
 */

export { execute, replay, diff, topologicalOrder } from './deterministic/engine';
export { canonicalise, hash, shortHash, seededUnitInterval } from './deterministic/canonical';
export {
  resolveInputs,
  requiredConnectors,
  IntegrationError,
} from './integration/resolve';
export type {
  IntegrationGateway,
  IntegrationCache,
  ResolutionContext,
  ResolvedInput,
} from './integration/resolve';
export { HttpIntegrationGateway, MemoryIntegrationCache } from './integration/http-gateway';
export type { HttpGatewayOptions } from './integration/http-gateway';
export type {
  ExecArtifact,
  ExecNode,
  ExecEdge,
  ExecNodeType,
  CatalogueSnapshot,
  DecisionRequest,
  DecisionRecord,
  DeterministicDecision,
  Measurements,
  EliminationStep,
  Denial,
  ReasonCode,
  CandidateScore,
  ReplayResult,
} from './deterministic/types';

/**
 * The closed set of reason codes, as a value.
 *
 * Exported so a consumer can assert it covers all of them rather than
 * hand-listing the ones it happens to know about — which is how the console's
 * label map stayed complete only by coincidence (G-086).
 */
export { REASON_CODES } from './deterministic/types';

export {
  requestHash,
  classify,
  InMemoryIdempotencyStore,
  IdempotencyConflict,
} from './idempotency';
export type {
  IdempotencyRecord,
  IdempotencyOutcome,
  IdempotencyStore,
} from './idempotency';

export {
  resolveScores,
  scorerFor,
  setScorerResolver,
  modelKeyOf,
  scoreNodes,
  ScoresNotResolved,
  SEEDED_PROPENSITY,
} from './scoring';
export type { PropensityScorer, ResolvedScores, ScoringContext } from './scoring';
export { compareShadow, buildShadowReport } from './shadow';
export type {
  ShadowComparison,
  ShadowReport,
  Divergence,
  DivergenceKind,
} from './shadow';

export { createFlowTestRunner } from './flow-tests';
export type {
  FlowTestCase,
  FlowTestResult,
  FlowTestRunner,
  FlowTestExpectation,
} from './flow-tests';

export { resolveAggregations, mergeAggregations } from './integration/aggregate';
export type { AggregationResult } from './integration/aggregate';

export { selectSlate } from './slate';
export type { Slate, SlateEntry } from './slate';
