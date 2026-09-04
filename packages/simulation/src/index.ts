/**
 * METIS Simulation Engine - Phase 1
 * What-if analysis, distribution testing, bias checking
 */

import type { CompiledArtifact } from '@metis/types';
import { execute } from '@metis/runtime';

export interface SimulationResult {
  artifactVersion: string;
  population: number;
  decisions: { action: string; count: number }[];
  segmentBreakdown: Record<string, Record<string, number>>;
  biasMetrics: BiasMetrics;
  executionTimeMs: number;
}

export interface BiasMetrics {
  protectedAttributeDisparity: Record<string, number>;
  allocationParity: boolean;
  disparityThreshold: number;
  passed: boolean;
}

/**
 * Run distribution simulation on a population sample
 */
export async function simulateDistribution(
  artifact: CompiledArtifact,
  population: Array<{ customerId: string; context: Record<string, any>; segment: string }>,
  disparityThreshold = 0.1
): Promise<SimulationResult> {
  const startTime = Date.now();
  const decisions: Record<string, number> = {};
  const segments: Record<string, Record<string, number>> = {};

  // Execute for each person in population
  for (const person of population) {
    const response = await execute(artifact, {
      tenantId: 'simulation',
      strategyName: artifact.id,
      customerId: person.customerId,
      context: person.context,
    });

    const action = response.decision.winner || 'none';
    decisions[action] = (decisions[action] || 0) + 1;

    if (!segments[person.segment]) segments[person.segment] = {};
    segments[person.segment][action] = (segments[person.segment][action] || 0) + 1;
  }

  // Check bias: do all segments get similar treatment?
  const biasMetrics = checkBias(segments, disparityThreshold);

  return {
    artifactVersion: artifact.version,
    population: population.length,
    decisions: Object.entries(decisions).map(([action, count]) => ({ action, count })),
    segmentBreakdown: segments,
    biasMetrics,
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * Compare two artifact versions on the same population (what-if)
 */
export async function compareVersions(
  artifactV1: CompiledArtifact,
  artifactV2: CompiledArtifact,
  population: Array<{ customerId: string; context: Record<string, any> }>
): Promise<{ winners: string; losers: string; unchanged: string; improvementRate: number }> {
  const decisions1 = await runSimulationQuiet(artifactV1, population);
  const decisions2 = await runSimulationQuiet(artifactV2, population);

  let winners = 0,
    losers = 0,
    unchanged = 0;

  for (let i = 0; i < population.length; i++) {
    if (decisions1[i] === decisions2[i]) {
      unchanged++;
    } else if (isImprovement(decisions1[i], decisions2[i])) {
      winners++;
    } else {
      losers++;
    }
  }

  return {
    winners: `${winners} (${((winners / population.length) * 100).toFixed(1)}%)`,
    losers: `${losers} (${((losers / population.length) * 100).toFixed(1)}%)`,
    unchanged: `${unchanged} (${((unchanged / population.length) * 100).toFixed(1)}%)`,
    improvementRate: (winners - losers) / population.length,
  };
}

/**
 * Find under-served customers (no eligible actions)
 */
export async function findUnderServed(
  artifact: CompiledArtifact,
  population: Array<{ customerId: string; context: Record<string, any> }>
): Promise<{ underServed: number; percentage: number; customerIds: string[] }> {
  const underServedIds: string[] = [];

  for (const person of population) {
    const response = await execute(artifact, {
      tenantId: 'simulation',
      strategyName: artifact.id,
      customerId: person.customerId,
      context: person.context,
    });

    if (!response.decision.winner) {
      underServedIds.push(person.customerId);
    }
  }

  return {
    underServed: underServedIds.length,
    percentage: (underServedIds.length / population.length) * 100,
    customerIds: underServedIds.slice(0, 10), // Top 10
  };
}

/**
 * Check for bias in allocation across protected attributes
 */
function checkBias(
  segments: Record<string, Record<string, number>>,
  threshold: number
): BiasMetrics {
  const disparities: Record<string, number> = {};

  // Simple parity check: do all segments get similar action distributions?
  const actionRates: Record<string, number[]> = {};

  for (const [_segment, actions] of Object.entries(segments)) {
    const total = Object.values(actions).reduce((a, b) => a + b, 0);
    for (const [action, count] of Object.entries(actions)) {
      if (!actionRates[action]) actionRates[action] = [];
      actionRates[action].push(count / total);
    }
  }

  // Check disparity in each action allocation
  for (const [action, rates] of Object.entries(actionRates)) {
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const maxDisparity = Math.max(...rates.map((r) => Math.abs(r - mean)));
    disparities[action] = maxDisparity;
  }

  const maxDisparityOverall = Math.max(...Object.values(disparities));
  const passed = maxDisparityOverall <= threshold;

  return {
    protectedAttributeDisparity: disparities,
    allocationParity: passed,
    disparityThreshold: threshold,
    passed,
  };
}

/**
 * Run simulation without tracing (faster)
 */
async function runSimulationQuiet(
  artifact: CompiledArtifact,
  population: Array<{ customerId: string; context: Record<string, any> }>
): Promise<string[]> {
  const decisions: string[] = [];

  for (const person of population) {
    const response = await execute(artifact, {
      tenantId: 'simulation',
      strategyName: artifact.id,
      customerId: person.customerId,
      context: person.context,
    });
    decisions.push(response.decision.winner || 'none');
  }

  return decisions;
}

/**
 * Simple heuristic: is new decision better than old?
 */
function isImprovement(old: string, newer: string): boolean {
  // Stub: Phase 1 uses outcome data; Phase 3 learns from history
  return newer !== 'none' && old === 'none';
}
