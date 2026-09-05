/**
 * METIS Compiler
 *
 * `compileDecisionFlow` validates the graph the runtime actually executes, pins
 * versions and models, and produces a content-hashed artifact. Nothing reaches
 * the runtime without passing it.
 */

export {
  compileDecisionFlow,
  resolveRange,
  formatReport,
  type DecisionFlowSource,
  type FlowNode,
  type FlowEdge,
  type FlowNodeType,
  type CompileContext,
  type CompileResult,
  type CompiledDecisionFlow,
  type CostManifest,
} from './decision-flow/compile';

export {
  suggest,
  didYouMean,
  sortDiagnostics,
  type Diagnostic,
  type Severity,
} from './decision-flow/diagnostics';

