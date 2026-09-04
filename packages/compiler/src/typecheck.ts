/**
 * Type Checker - Validates DIR against node schema and data model
 */

import type { DecisionIR, Tenant } from '@metis/types';
import { CORE_NODE_TYPES } from '@metis/nodes-core';

export interface TypeCheckError {
  nodeId?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface TypeCheckResult {
  valid: boolean;
  errors: TypeCheckError[];
}

/**
 * Type check a DIR artifact
 */
export function typeCheck(
  dir: DecisionIR,
  tenantConfig: Tenant,
  _dataModel: Record<string, any>
): TypeCheckResult {
  const errors: TypeCheckError[] = [];

  // Check node IDs are unique
  const nodeIds = new Set<string>();
  for (const node of dir.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push({
        nodeId: node.id,
        message: `Duplicate node ID: ${node.id}`,
        severity: 'error',
      });
    }
    nodeIds.add(node.id);
  }

  // Check node count doesn't exceed limit
  if (dir.nodes.length > tenantConfig.maxNodesPerArtifact) {
    errors.push({
      message: `Strategy has ${dir.nodes.length} nodes, exceeds tenant limit of ${tenantConfig.maxNodesPerArtifact}`,
      severity: 'error',
    });
  }

  // Check entry and exit nodes exist
  const entry = dir.nodes.find((n) => n.id === dir.entryNode);
  if (!entry) {
    errors.push({
      message: `Entry node ${dir.entryNode} not found`,
      severity: 'error',
    });
  }

  for (const exitId of dir.exitNodes) {
    const exit = dir.nodes.find((n) => n.id === exitId);
    if (!exit) {
      errors.push({
        message: `Exit node ${exitId} not found`,
        severity: 'error',
      });
    }
  }

  // Check edges reference existing nodes
  for (const edge of dir.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push({
        message: `Edge from non-existent node: ${edge.from}`,
        severity: 'error',
      });
    }
    if (!nodeIds.has(edge.to)) {
      errors.push({
        message: `Edge to non-existent node: ${edge.to}`,
        severity: 'error',
      });
    }
  }

  // Check node types are valid
  const coreNodeTypes = Object.values(CORE_NODE_TYPES);
  for (const node of dir.nodes) {
    if (!coreNodeTypes.includes(node.type as any)) {
      errors.push({
        nodeId: node.id,
        message: `Unknown node type: ${node.type}. Valid types: ${coreNodeTypes.join(', ')}`,
        severity: 'error',
      });
    }
  }

  // Check package dependencies are specified
  for (const node of dir.nodes) {
    if (node.packageId && !dir.packageDependencies[node.packageId]) {
      errors.push({
        nodeId: node.id,
        message: `Node references package ${node.packageId} which is not in packageDependencies`,
        severity: 'warning',
      });
    }
  }

  return {
    valid: errors.filter((e) => e.severity === 'error').length === 0,
    errors,
  };
}

/**
 * Suggest corrections for common errors (typo detection)
 */
export function suggestCorrection(
  original: string,
  candidates: string[]
): string | undefined {
  // Simple Levenshtein distance-based suggestion
  const distance = (a: string, b: string): number => {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[b.length][a.length];
  };

  let bestMatch: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const d = distance(original, candidate);
    if (d < bestDistance && d <= 2) {
      bestDistance = d;
      bestMatch = candidate;
    }
  }
  return bestMatch;
}
