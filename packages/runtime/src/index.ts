/**
 * METIS Runtime - Execution Engine
 *
 * Two executors live here for now:
 *
 *   ./deterministic - the current engine. Reproducible by construction, and
 *                     covered by tests/determinism.test.ts.
 *   ./executor      - the original Phase 0 executor. Retained because the
 *                     compiler integration test still drives it, but it is NOT
 *                     replay-safe: it stamps crypto.randomUUID() and Date.now()
 *                     into the trace it hashes, so two runs of the same
 *                     decision never match. Do not build on it.
 */

export { execute as executeLegacy } from './executor';
export type { DecisionRequest as LegacyDecisionRequest, DecisionResponse } from '@metis/types';

// The deterministic core.
export { execute, replay, diff, topologicalOrder } from './deterministic/engine';
export { canonicalise, hash, shortHash, seededUnitInterval } from './deterministic/canonical';
export type {
  ExecArtifact,
  ExecNode,
  ExecEdge,
  ExecNodeType,
  CatalogueSnapshot,
  DecisionRequest,
  DecisionTrace,
  DeterministicDecision,
  Measurements,
  EliminationStep,
  CandidateScore,
  ReplayResult,
} from './deterministic/types';
