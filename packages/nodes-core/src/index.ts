/**
 * METIS Core Node Types
 * Implementations of the 14+ core decision nodes
 */

import type { IRNode } from '@metis/types';

/**
 * Abstract base class for all node types
 */
export abstract class BaseNode {
  id: string;
  label: string;
  type: string;
  config: Record<string, unknown>;

  constructor(id: string, type: string, label: string, config: Record<string, unknown>) {
    this.id = id;
    this.type = type;
    this.label = label;
    this.config = config;
  }

  /**
   * Get input schema for this node
   */
  abstract getInputSchema(): Record<string, { name: string; type: string; required: boolean }>;

  /**
   * Get output schema for this node
   */
  abstract getOutputSchema(): Record<string, { name: string; type: string }>;

  /**
   * Get cost annotation for this node
   */
  abstract getCostAnnotation(): { estimatedMs: number; externalCalls: number };

  /**
   * Execute this node given input values
   */
  abstract execute(inputs: Record<string, unknown>): Promise<Record<string, unknown>>;

  /**
   * Generate trace contribution for this node
   */
  abstract getTraceContribution(): Record<string, unknown>;
}

/**
 * SOURCE: Fetch data from feature store or external API
 */
export class SourceNode extends BaseNode {
  constructor(id: string, config: any) {
    super(id, 'source', config.label || 'Source', config);
  }

  getInputSchema() {
    return {
      customerId: { name: 'customerId', type: 'string', required: true },
    };
  }

  getOutputSchema() {
    return {
      data: { name: 'data', type: 'object' },
    };
  }

  getCostAnnotation() {
    return {
      estimatedMs: this.config.estimatedMs as number || 5,
      externalCalls: 1,
    };
  }

  async execute(inputs: Record<string, unknown>) {
    // In Phase 0, this is a stub. Phase 1 connects to feature store.
    return {
      data: {},
    };
  }

  getTraceContribution() {
    return { source: this.config.sourceId };
  }
}

/**
 * FILTER: Boolean eligibility rule
 */
export class FilterNode extends BaseNode {
  constructor(id: string, config: any) {
    super(id, 'filter', config.label || 'Filter', config);
  }

  getInputSchema() {
    return {
      value: { name: 'value', type: 'unknown', required: true },
    };
  }

  getOutputSchema() {
    return {
      pass: { name: 'pass', type: 'boolean' },
      reason: { name: 'reason', type: 'string' },
    };
  }

  getCostAnnotation() {
    return { estimatedMs: 1, externalCalls: 0 };
  }

  async execute(inputs: Record<string, unknown>) {
    const rule = this.config.rule as string;
    // In real implementation, would evaluate rule against inputs
    return {
      pass: true,
      reason: 'passed',
    };
  }

  getTraceContribution() {
    return { rule: this.config.rule, passed: true };
  }
}

/**
 * SET-PROPERTY: Mutate working state
 */
export class SetPropertyNode extends BaseNode {
  constructor(id: string, config: any) {
    super(id, 'set-property', config.label || 'Set Property', config);
  }

  getInputSchema() {
    return {
      object: { name: 'object', type: 'object', required: true },
    };
  }

  getOutputSchema() {
    return {
      object: { name: 'object', type: 'object' },
    };
  }

  getCostAnnotation() {
    return { estimatedMs: 1, externalCalls: 0 };
  }

  async execute(inputs: Record<string, unknown>) {
    const obj = { ...(inputs.object as object) };
    const key = this.config.key as string;
    const value = this.config.value;
    (obj as any)[key] = value;
    return { object: obj };
  }

  getTraceContribution() {
    return { key: this.config.key, value: this.config.value };
  }
}

/**
 * SCORE-MODEL: Invoke a model (with version pin)
 */
export class ScoreModelNode extends BaseNode {
  constructor(id: string, config: any) {
    super(id, 'score-model', config.label || 'Score Model', config);
  }

  getInputSchema() {
    return {
      features: { name: 'features', type: 'object', required: true },
    };
  }

  getOutputSchema() {
    return {
      score: { name: 'score', type: 'number' },
      confidence: { name: 'confidence', type: 'number' },
      topFeatures: { name: 'topFeatures', type: 'array' },
    };
  }

  getCostAnnotation() {
    return {
      estimatedMs: this.config.estimatedMs as number || 10,
      externalCalls: 1,
    };
  }

  async execute(inputs: Record<string, unknown>) {
    // Stub: would call model provider
    return {
      score: 0.5,
      confidence: 0.95,
      topFeatures: [],
    };
  }

  getTraceContribution() {
    return {
      modelId: this.config.modelId,
      modelVersion: this.config.modelVersion,
      score: 0.5,
    };
  }
}

/**
 * ARBITRATE: Ranking formula over candidates
 */
export class ArbitrateNode extends BaseNode {
  constructor(id: string, config: any) {
    super(id, 'arbitrate', config.label || 'Arbitrate', config);
  }

  getInputSchema() {
    return {
      candidates: { name: 'candidates', type: 'array', required: true },
    };
  }

  getOutputSchema() {
    return {
      ranked: { name: 'ranked', type: 'array' },
      winner: { name: 'winner', type: 'string' },
    };
  }

  getCostAnnotation() {
    return { estimatedMs: 2, externalCalls: 0 };
  }

  async execute(inputs: Record<string, unknown>) {
    const candidates = (inputs.candidates as any[]) || [];
    // Sort by score descending
    const ranked = candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
    return {
      ranked,
      winner: ranked[0]?.id,
    };
  }

  getTraceContribution() {
    return { formula: this.config.formula };
  }
}

/**
 * CONSTRAINT: Hard rules (suppress if violated)
 */
export class ConstraintNode extends BaseNode {
  constructor(id: string, config: any) {
    super(id, 'constraint', config.label || 'Constraint', config);
  }

  getInputSchema() {
    return {
      candidates: { name: 'candidates', type: 'array', required: true },
    };
  }

  getOutputSchema() {
    return {
      candidates: { name: 'candidates', type: 'array' },
    };
  }

  getCostAnnotation() {
    return { estimatedMs: 1, externalCalls: 0 };
  }

  async execute(inputs: Record<string, unknown>) {
    const candidates = (inputs.candidates as any[]) || [];
    // In real implementation, would filter candidates based on constraints
    return { candidates };
  }

  getTraceContribution() {
    return { constraintId: this.config.constraintId };
  }
}

/**
 * EXPLAIN-ANNOTATE: Emit reasoning
 */
export class ExplainAnnotateNode extends BaseNode {
  constructor(id: string, config: any) {
    super(id, 'explain-annotate', config.label || 'Explain', config);
  }

  getInputSchema() {
    return {
      value: { name: 'value', type: 'unknown', required: true },
    };
  }

  getOutputSchema() {
    return {
      value: { name: 'value', type: 'unknown' },
      explanation: { name: 'explanation', type: 'string' },
    };
  }

  getCostAnnotation() {
    return { estimatedMs: 1, externalCalls: 0 };
  }

  async execute(inputs: Record<string, unknown>) {
    return {
      value: inputs.value,
      explanation: this.config.explanation || '',
    };
  }

  getTraceContribution() {
    return { explanation: this.config.explanation };
  }
}

/**
 * SWITCH: Branching logic
 */
export class SwitchNode extends BaseNode {
  constructor(id: string, config: any) {
    super(id, 'switch', config.label || 'Switch', config);
  }

  getInputSchema() {
    return {
      value: { name: 'value', type: 'unknown', required: true },
    };
  }

  getOutputSchema() {
    return {
      branch: { name: 'branch', type: 'string' },
    };
  }

  getCostAnnotation() {
    return { estimatedMs: 1, externalCalls: 0 };
  }

  async execute(inputs: Record<string, unknown>) {
    const value = inputs.value;
    const cases = this.config.cases as any[];
    for (const c of cases) {
      if (c.condition === value) {
        return { branch: c.branch };
      }
    }
    return { branch: this.config.default || 'default' };
  }

  getTraceContribution() {
    return { branch: this.config.default };
  }
}

/**
 * Registry of all core node types
 */
const NODE_REGISTRY: Record<string, typeof BaseNode> = {
  source: SourceNode,
  filter: FilterNode,
  'set-property': SetPropertyNode,
  'score-model': ScoreModelNode,
  arbitrate: ArbitrateNode,
  constraint: ConstraintNode,
  'explain-annotate': ExplainAnnotateNode,
  switch: SwitchNode,
};

/**
 * Factory function to create a node by type
 */
export function createNode(id: string, type: string, config: any): BaseNode {
  const NodeClass = NODE_REGISTRY[type];
  if (!NodeClass) {
    throw new Error(`Unknown node type: ${type}`);
  }
  return new NodeClass(id, config);
}

/**
 * Get all registered node types
 */
export function getRegisteredNodeTypes(): string[] {
  return Object.keys(NODE_REGISTRY);
}

export { SourceNode, FilterNode, SetPropertyNode, ScoreModelNode, ArbitrateNode, ConstraintNode, ExplainAnnotateNode, SwitchNode };
