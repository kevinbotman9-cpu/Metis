/**
 * The strategy compiler's public surface.
 *
 * Added because consumers were reaching into `@metis/compiler/strategy/compile`
 * directly, which makes every internal file part of the API by accident.
 */
export {
  compileStrategy,
  resolveRange,
  formatReport,
  type StrategyNode,
  type StrategyNodeType,
  type StrategyEdge,
  type StrategySource,
  type CompileContext,
  type CompileResult,
  type CompiledStrategy,
  type CostManifest,
} from './compile';

export {
  sortDiagnostics,
  suggest,
  didYouMean,
  type Diagnostic,
  type Severity,
} from './diagnostics';
