/**
 * METIS Canvas
 * Graph editor for Decision Intermediate Representation (DIR)
 * Built on React Flow (xyflow)
 */

import type { DecisionIR } from '@metis/types';

export interface NodeRendererProps {
  node: any;
  selected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
}

export interface CanvasEditorProps {
  strategy: DecisionIR;
  onStrategyChange: (strategy: DecisionIR) => void;
  onNodeSelect?: (nodeId: string) => void;
  readOnly?: boolean;
}

// Node renderer registry
// Extensible: additional node types load their renderers from packages
export type NodeRendererRegistry = Record<string, (props: NodeRendererProps) => React.ReactNode>;

export const coreNodeRenderers: NodeRendererRegistry = {
  // TODO: source, filter, set-property, join, aggregate, group-by,
  // score-model, score-adaptive, prioritise, switch, sub-strategy,
  // champion-challenger, interaction-history, constraint, suppress, arbitrate, explain-annotate
};

export function CanvasEditor(props: CanvasEditorProps): React.ReactNode {
  return null; // TODO: Canvas editor component
}

export function registerNodeRenderer(nodeType: string, renderer: (props: NodeRendererProps) => React.ReactNode): void {
  coreNodeRenderers[nodeType] = renderer;
}
