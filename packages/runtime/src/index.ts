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
  CandidateScore,
  ReplayResult,
} from './deterministic/types';
