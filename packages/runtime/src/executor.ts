/**
 * Runtime Executor - Executes compiled Decision Intermediate Representations
 */

import type {
  CompiledArtifact,
  DecisionRequest,
  DecisionResponse,
  DecisionTrace,
  DecisionIR,
} from '@metis/types';
import { createNode } from '@metis/nodes-core';
import { createTrace, hashTrace, addCandidate, recordElimination, recordScore } from '@metis/trace';
import * as crypto from 'crypto';

/**
 * Runtime execution context
 */
class ExecutionContext {
  private stepCount = 0;
  private maxSteps = 1000;
  private workingState: Record<string, any> = {};
  private timings: Record<string, number> = {};

  constructor(maxSteps = 1000) {
    this.maxSteps = maxSteps;
  }

  incrementSteps(): void {
    this.stepCount++;
    if (this.stepCount > this.maxSteps) {
      throw new Error(`Execution exceeded max steps (${this.maxSteps})`);
    }
  }

  setState(key: string, value: any): void {
    this.workingState[key] = value;
  }

  getState(key: string): any {
    return this.workingState[key];
  }

  recordTiming(nodeId: string, durationMs: number): void {
    this.timings[nodeId] = (this.timings[nodeId] || 0) + durationMs;
  }

  getTimings(): Record<string, number> {
    return this.timings;
  }
}

/**
 * Execute a compiled artifact against a decision request
 */
export async function execute(
  artifact: CompiledArtifact,
  request: DecisionRequest
): Promise<DecisionResponse> {
  const startTime = Date.now();
  const context = new ExecutionContext();
  const dir = artifact.dirSchema;

  // Create trace
  const inputSnapshotHash = hashInputs(request.context);
  const trace = createTrace({
    decisionId: crypto.randomUUID(),
    tenantId: request.tenantId,
    customerRef: request.customerId,
    artifactVersion: artifact.version,
    packageVersions: artifact.packageVersions,
    inputSnapshotHash,
  });

  // Initialize working state with request context
  context.setState('input', request.context);
  context.setState('customerId', request.customerId);

  // Execute nodes in topological order
  const visitedNodes = new Set<string>();
  const nodeOutputs: Record<string, { winner?: string; candidates?: any[] }> = {};

  try {
    // Start from entry node
    await executeNode(
      dir.entryNode,
      dir,
      context,
      artifact,
      visitedNodes,
      nodeOutputs,
      trace
    );
  } catch (error) {
    trace.complianceChecks.push({
      checkId: 'execution_error',
      passed: false,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Record final timing
  const totalMs = Date.now() - startTime;
  trace.totalMs = totalMs;
  trace.timingsByNode = context.getTimings();

  // Calculate chain hash for audit trail
  trace.chainHash = hashTrace(trace);

  // Determine decision winner
  const winner = context.getState('decision') || nodeOutputs[dir.exitNodes[0]]?.winner;

  return {
    decisionId: trace.decisionId,
    decision: {
      winner,
      candidates: trace.candidateSet.map((c) => ({
        actionId: c.actionId,
        score: c.score || 0,
        features: {},
      })),
    },
    trace,
    cost: {
      computeMs: totalMs,
      modelServingMs: 0,
      dataEgressBytes: 0,
      totalMs,
    },
  };
}

/**
 * Execute a single node in the graph
 */
async function executeNode(
  nodeId: string,
  dir: DecisionIR,
  context: ExecutionContext,
  artifact: CompiledArtifact,
  visitedNodes: Set<string>,
  nodeOutputs: Record<string, any>,
  trace: DecisionTrace
): Promise<any> {
  if (visitedNodes.has(nodeId)) {
    return nodeOutputs[nodeId]; // Already executed
  }

  context.incrementSteps();

  const nodeSpec = dir.nodes.find((n) => n.id === nodeId);
  if (!nodeSpec) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const startTime = Date.now();

  try {
    // Create and execute node
    const node = createNode(nodeId, nodeSpec.type, nodeSpec.config);

    // Prepare inputs for this node
    const inputs: Record<string, any> = {};
    for (const [key, input] of Object.entries(nodeSpec.inputs || {})) {
      // In Phase 1, this would resolve input bindings from previous nodes
      inputs[key] = context.getState(key) || nodeSpec.config[key];
    }

    // Execute
    const output = await node.execute(inputs);

    // Record timing
    const duration = Date.now() - startTime;
    context.recordTiming(nodeId, duration);

    // Store output
    nodeOutputs[nodeId] = output;

    // For SOURCE nodes, add candidates to trace
    if (nodeSpec.type === 'source') {
      const candidates = output.data?.candidates || [];
      for (const candidate of candidates) {
        addCandidate(trace, candidate.id, nodeId, candidate.score);
      }
    }

    // For FILTER nodes, record eliminations
    if (nodeSpec.type === 'filter') {
      if (!output.pass) {
        recordElimination(
          trace,
          'unknown',
          nodeId,
          nodeSpec.config.ruleId as string,
          'FILTER_FAILED',
          output.reason || 'Filter did not pass'
        );
      }
    }

    // Store in context for downstream nodes
    context.setState(nodeId, output);

    visitedNodes.add(nodeId);

    // Execute downstream nodes (follow edges)
    const outgoingEdges = dir.edges.filter((e) => e.from === nodeId);
    for (const edge of outgoingEdges) {
      await executeNode(edge.to, dir, context, artifact, visitedNodes, nodeOutputs, trace);
    }

    return output;
  } catch (error) {
    throw new Error(`Error executing node ${nodeId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Hash input context for audit trail
 */
function hashInputs(context: Record<string, any>): string {
  const content = JSON.stringify(context);
  return crypto.createHash('sha256').update(content).digest('hex');
}
