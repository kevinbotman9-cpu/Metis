/**
 * METIS Compiler
 *
 * `compileStrategy` validates the graph the runtime actually executes, pins
 * versions and models, and produces a content-hashed artifact. Nothing reaches
 * the runtime without passing it.
 */

export {
  compileStrategy,
  resolveRange,
  formatReport,
  type StrategySource,
  type StrategyNode,
  type StrategyEdge,
  type StrategyNodeType,
  type CompileContext,
  type CompileResult,
  type CompiledStrategy,
  type CostManifest,
} from './strategy/compile';

export {
  suggest,
  didYouMean,
  sortDiagnostics,
  type Diagnostic,
  type Severity,
} from './strategy/diagnostics';

