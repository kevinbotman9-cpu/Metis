'use client';

import { useMemo, useCallback } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { DirNode, type DirNodeData } from './dir-node';
import type { DirNode as DirNodeModel, DirEdge } from '@/mocks/fixtures/artifacts';

const nodeTypes = { dir: DirNode };

interface DirCanvasProps {
  nodes: DirNodeModel[];
  edges: DirEdge[];
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
}

/**
 * Initial viewport.
 *
 * Not fitView: for custom nodes its internal measurements were not populated
 * when we need them, and it clamped the zoom to minZoom regardless of the
 * actual bounds. The authored layouts are all a left-to-right flow about
 * 1200px wide, so a fixed starting zoom is predictable, renders the whole
 * graph in a standard pane, and keeps visual tests stable. The Controls
 * overlay still offers fit-to-view, zoom and pan.
 */
const DEFAULT_VIEWPORT = { x: 24, y: 24, zoom: 0.55 };

function Canvas({ nodes, edges, selectedId, onSelect }: DirCanvasProps) {
  const flowNodes = useMemo<Node<DirNodeData>[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: 'dir',
        position: n.position,
        data: {
          label: n.label,
          nodeType: n.type,
          estimatedMs: n.estimatedMs,
          policyCount: n.policyIds?.length ?? 0,
          hasModel: Boolean(n.model),
          selected: n.id === selectedId,
        },
        // Read-only: nodes can be inspected and panned past, not rearranged.
        draggable: false,
        connectable: false,
      })),
    [nodes, selectedId]
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        type: 'smoothstep',
        style: { stroke: 'rgb(var(--border-strong))', strokeWidth: 1.5 },
        labelStyle: { fill: 'rgb(var(--text-muted))', fontSize: 11 },
        labelBgStyle: { fill: 'rgb(var(--surface))' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: 'rgb(var(--border-strong))',
        },
      })),
    [edges]
  );

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => onSelect(node.id),
    [onSelect]
  );

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={() => onSelect(null)}
      defaultViewport={DEFAULT_VIEWPORT}
      minZoom={0.2}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      aria-label="Decision graph"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={16}
        size={1}
        color="rgb(var(--border))"
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

/** Read-only DIR graph. Positions are authored in the artifact, not computed. */
export function DirCanvas(props: DirCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
