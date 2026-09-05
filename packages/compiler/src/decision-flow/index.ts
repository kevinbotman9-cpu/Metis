/**
 * The flow compiler's public surface.
 *
 * Added because consumers were reaching into `@metis/compiler/decision-flow/compile`
 * directly, which makes every internal file part of the API by accident.
 */
export {
  compileDecisionFlow,
  resolveRange,
  formatReport,
  type FlowNode,
  type FlowNodeType,
  type FlowEdge,
  type DecisionFlowSource,
  type CompileContext,
  type CompileResult,
  type CompiledDecisionFlow,
  type CostManifest,
} from './compile';

export {
  sortDiagnostics,
  suggest,
  didYouMean,
  type Diagnostic,
  type Severity,
} from './diagnostics';
