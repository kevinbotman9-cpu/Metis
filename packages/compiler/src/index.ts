/**
 * METIS Compiler
 *
 * `compileStrategy` is the current compiler: it validates the graph the runtime
 * actually executes, pins versions and models, and produces a content-hashed
 * artifact. Nothing reaches the runtime without passing it.
 *
 * The Phase 0 compiler below it targets an older DIR shape that nothing
 * executes any more. It is kept only so the historical fixtures still parse.
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

// Legacy Phase 0 pipeline, retained for the original DIR fixtures only.
export { compile as compileDir, generateCompileReport } from './compile';
export { typeCheck } from './typecheck';
export { resolveVersions } from './resolver';
export { analyzeCost } from './costAnalyzer';
