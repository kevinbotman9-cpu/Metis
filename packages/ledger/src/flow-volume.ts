import type { LedgerEntry } from './types';

/**
 * Candidates through one flow, node by node — what the canvas draws as edge
 * thickness.
 *
 * The policy funnel stages removals by reason code because flows share no
 * spine. This is the other question, asked of one flow: at each node of its
 * graph, how many candidates arrived, how many that node removed, and how many
 * went on. It is counted from the eliminations each decision recorded, never
 * inferred from the graph.
 *
 * **An edge carries what survived the node it leaves.** The engine takes one
 * candidate set through the nodes in topological order; a node with two
 * outgoing edges does not split it. So every edge out of a node carries that
 * node's survivors, and the caller supplies the order the engine visits.
 *
 * **Consent applied by the platform is not a node** (G-015). Its step carries
 * an id no graph holds, and the caller names the node it runs before, so those
 * removals are counted where they happen rather than lost or misattributed.
 * Anything recorded at a step neither the graph nor the caller knows is counted
 * in `unplaced`: zero on records that match their graph, and not zero means the
 * figures are not a decomposition.
 */

/** One decision, reduced to what the volume counts. */
export interface FlowVolumeDecision {
  decisionId: string;
  occurredAt: string;
  /** Candidates the flow was allowed to consider. */
  candidates: number;
  winner: string | null;
  /** Candidates removed, by the id of the step that removed them. */
  removedAt: Readonly<Record<string, number>>;
}

/** The graph, with its nodes in the order the engine visits them. */
export interface FlowVolumeGraph {
  nodes: readonly { id: string; type: string; label: string }[];
  edges: readonly { from: string; to: string }[];
  /**
   * Steps that are not nodes, and the node each runs immediately before —
   * consent applied by the platform runs before the arbitrate node.
   */
  stepsBefore?: Readonly<Record<string, string>>;
}

export interface FlowVolumeNode {
  nodeId: string;
  type: string;
  label: string;
  /** Candidates that reached the node, summed over decisions. */
  entered: number;
  removed: number;
  survived: number;
}

export interface FlowVolumeEdge {
  from: string;
  to: string;
  /** Candidates that crossed the edge: the survivors of `from`. */
  volume: number;
}

export interface FlowVolumeReport {
  decisions: number;
  entered: number;
  offered: number;
  /** Removed by steps that are not nodes, counted before the node they precede. */
  platformRemoved: number;
  /** Removals at a step neither the graph nor `stepsBefore` holds. */
  unplaced: number;
  nodes: FlowVolumeNode[];
  edges: FlowVolumeEdge[];
  from: string | null;
  to: string | null;
}

/** A ledger entry as the volume reads it. */
export function flowVolumeDecisionOf(entry: LedgerEntry): FlowVolumeDecision {
  const d = entry.record.decision;
  const removedAt: Record<string, number> = {};
  for (const step of d.eliminations) {
    if (step.denials.length > 0) removedAt[step.nodeId] = (removedAt[step.nodeId] ?? 0) + step.denials.length;
  }
  return {
    decisionId: entry.decisionId,
    occurredAt: entry.occurredAt,
    candidates: d.candidateKeys.length,
    winner: d.winner,
    removedAt,
  };
}

export function buildFlowVolume(
  decisions: readonly FlowVolumeDecision[],
  graph: FlowVolumeGraph
): FlowVolumeReport {
  const nodes: FlowVolumeNode[] = graph.nodes.map((n) => ({
    nodeId: n.id,
    type: n.type,
    label: n.label,
    entered: 0,
    removed: 0,
    survived: 0,
  }));
  const known = new Set(graph.nodes.map((n) => n.id));
  const before = new Map<string, string[]>();
  for (const [step, node] of Object.entries(graph.stepsBefore ?? {})) {
    before.set(node, [...(before.get(node) ?? []), step]);
  }

  let entered = 0;
  let offered = 0;
  let platformRemoved = 0;
  let unplaced = 0;
  let from: string | null = null;
  let to: string | null = null;

  for (const decision of decisions) {
    if (from === null || decision.occurredAt < from) from = decision.occurredAt;
    if (to === null || decision.occurredAt > to) to = decision.occurredAt;
    entered += decision.candidates;
    if (decision.winner) offered += 1;

    for (const [step, count] of Object.entries(decision.removedAt)) {
      if (!known.has(step) && !(graph.stepsBefore && step in graph.stepsBefore)) unplaced += count;
    }

    let running = decision.candidates;
    nodes.forEach((node) => {
      for (const step of before.get(node.nodeId) ?? []) {
        const removed = decision.removedAt[step] ?? 0;
        platformRemoved += removed;
        running -= removed;
      }
      node.entered += running;
      const removed = decision.removedAt[node.nodeId] ?? 0;
      node.removed += removed;
      running -= removed;
      node.survived += running;
    });
  }

  const survivedBy = new Map(nodes.map((n) => [n.nodeId, n.survived]));
  const edges = graph.edges.map((e) => ({ from: e.from, to: e.to, volume: survivedBy.get(e.from) ?? 0 }));

  return { decisions: decisions.length, entered, offered, platformRemoved, unplaced, nodes, edges, from, to };
}
