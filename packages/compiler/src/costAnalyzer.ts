/**
 * Cost Analyzer - Predict worst-case latency and cost
 */

import type { DecisionIR, CostEstimate, Tenant } from '@metis/types';
import { createNode } from '@metis/nodes-core';

export interface CostAnalysisResult {
  valid: boolean;
  estimate: CostEstimate;
  violations: string[];
}

/**
 * Analyze the cost of a compiled artifact
 */
export function analyzeCost(
  dir: DecisionIR,
  tenantConfig: Tenant,
  _nodeRegistry?: Record<string, any>
): CostAnalysisResult {
  const violations: string[] = [];
  let totalLatencyMs = 0;
  let totalComputeNodes = 0;
  const modelInvocations: Set<string> = new Set();
  let externalCalls = 0;

  // Walk through nodes and estimate costs
  for (const node of dir.nodes) {
    try {
      const nodeInstance = createNode(node.id, node.type, node.config);
      const nodeCost = nodeInstance.getCostAnnotation();

      totalLatencyMs += nodeCost.estimatedMs;
      totalComputeNodes += 1;
      externalCalls += nodeCost.externalCalls;

      if (node.type === 'score-model' && node.config.modelId) {
        modelInvocations.add(node.config.modelId as string);
      }
    } catch (e) {
      // Node type not found - continue with defaults
      totalLatencyMs += 5;
      totalComputeNodes += 1;
    }
  }

  // Check against tenant budgets
  if (totalLatencyMs > tenantConfig.latencyBudgetMs) {
    violations.push(
      `Strategy latency ${totalLatencyMs}ms exceeds tenant budget ${tenantConfig.latencyBudgetMs}ms`
    );
  }

  // Build estimate
  const estimate: CostEstimate = {
    computeNodes: totalComputeNodes,
    modelInvocations: Array.from(modelInvocations),
    externalCalls,
    estimatedP95LatencyMs: Math.ceil(totalLatencyMs * 1.2), // p95 = p50 * 1.2 as approximation
    estimatedCostPerThousand: externalCalls * 0.01, // $0.01 per external call
  };

  return {
    valid: violations.length === 0,
    estimate,
    violations,
  };
}

/**
 * Estimate p95 latency given a p50 estimate and load profile
 */
export function estimateP95Latency(p50Ms: number, concurrency: number): number {
  // Rough model: p95 increases with contention
  // p95 ≈ p50 * (1 + sqrt(concurrency) / 10)
  const contention = 1 + Math.sqrt(concurrency) / 10;
  return Math.ceil(p50Ms * contention);
}

/**
 * Check if artifact fits within tenant latency budget
 */
export function checkLatencyBudget(
  estimate: CostEstimate,
  tenantBudget: number
): { fits: boolean; message: string } {
  if (estimate.estimatedP95LatencyMs <= tenantBudget) {
    return {
      fits: true,
      message: `Latency ${estimate.estimatedP95LatencyMs}ms is within budget ${tenantBudget}ms`,
    };
  }

  return {
    fits: false,
    message: `Latency ${estimate.estimatedP95LatencyMs}ms exceeds budget ${tenantBudget}ms. Consider removing a model call or extending the budget.`,
  };
}

/**
 * Generate human-readable cost report
 */
export function generateCostReport(estimate: CostEstimate): string {
  return `
=== Cost Analysis ===
Compute Nodes: ${estimate.computeNodes}
Model Invocations: ${estimate.modelInvocations.join(', ') || 'none'}
External Calls: ${estimate.externalCalls}
Estimated P95 Latency: ${estimate.estimatedP95LatencyMs}ms
Estimated Cost per 1000 Decisions: $${estimate.estimatedCostPerThousand.toFixed(2)}
`;
}
