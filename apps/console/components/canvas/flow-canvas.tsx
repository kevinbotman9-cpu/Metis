'use client';

import { useMemo, useCallback } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FlowNode, type FlowNodeData } from './flow-node';
import type { FlowNode as FlowNodeModel, FlowEdge } from '@/mocks/fixtures/artifacts';

const nodeTypes = { dir: FlowNode };

interface FlowCanvasProps {
  nodes: FlowNodeModel[];
  edges: FlowEdge[];
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
  /**
   * Editing handlers. All three or none.
   *
   * Absent means the canvas is read-only, which is what a person without
   * `edit:flows` gets — a graph they can inspect and pan, with nothing that
   * looks draggable and refuses.
   */
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onConnect?: (edge: { source: string; target: string }) => void;
  onDisconnect?: (edgeId: string) => void;
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

function Canvas({
  nodes,
  edges,
  selectedId,
  onSelect,
  onMove,
  onConnect,
  onDisconnect,
}: FlowCanvasProps) {
  const editable = Boolean(onMove && onConnect && onDisconnect);

  const flowNodes = useMemo<Node<FlowNodeData>[]>(
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
        draggable: editable,
        connectable: editable,
      })),
    [nodes, selectedId, editable]
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

  /**
   * Positions are reported on drag *end*, not on every frame.
   *
   * A save per animation frame would be a save per pixel. The layout is
   * authored data — it is in the artifact, not computed — so it has to persist,
   * but only once the hand has stopped moving.
   */
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!onMove) return;
      for (const change of changes) {
        if (change.type === 'position' && change.dragging === false && change.position) {
          onMove(change.id, change.position);
        }
      }
    },
    [onMove]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!onConnect || !connection.source || !connection.target) return;
      // A node cannot feed itself. React Flow allows it and the compiler would
      // reject the cycle, but refusing at the gesture is a better answer than a
      // diagnostic about a graph nobody meant to draw.
      if (connection.source === connection.target) return;
      onConnect({ source: connection.source, target: connection.target });
    },
    [onConnect]
  );

  const handleEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!onDisconnect) return;
      for (const edge of deleted) onDisconnect(edge.id);
    },
    [onDisconnect]
  );

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={() => onSelect(null)}
      onNodesChange={editable ? handleNodesChange : undefined}
      onConnect={editable ? handleConnect : undefined}
      onEdgesDelete={editable ? handleEdgesDelete : undefined}
      deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
      defaultViewport={DEFAULT_VIEWPORT}
      minZoom={0.2}
      maxZoom={1.6}
      nodesDraggable={editable}
      nodesConnectable={editable}
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

/**
 * The DIR graph. Positions are authored in the artifact, never computed.
 *
 * Editable when the handlers are supplied and read-only otherwise, so a person
 * who cannot publish a flow is not offered a canvas that appears to let them
 * rearrange one.
 */
export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
