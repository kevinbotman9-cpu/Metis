/**
 * METIS Trace System - DecisionTrace format, replay service, renderers
 */

import * as crypto from 'crypto';
import type {
  DecisionTrace,
  } from '@metis/types';

/**
 * Create a new DecisionTrace
 */
export function createTrace(options: {
  decisionId: string;
  tenantId: string;
  customerRef: string;
  artifactVersion: string;
  packageVersions: Record<string, string>;
  inputSnapshotHash: string;
}): DecisionTrace {
  return {
    decisionId: options.decisionId,
    tenantId: options.tenantId,
    customerRef: options.customerRef,
    artifactVersion: options.artifactVersion,
    packageVersions: options.packageVersions,
    inputSnapshotHash: options.inputSnapshotHash,
    candidateSet: [],
    eliminations: [],
    scores: [],
    arbitration: {
      formulaVersion: '1.0',
      ranked: [],
    },
    constraintsApplied: [],
    consentState: {},
    complianceChecks: [],
    timingsByNode: {},
    totalMs: 0,
    chainHash: '',
    prevHash: undefined,
  };
}

/**
 * Calculate hash of trace for chaining (audit trail)
 */
export function hashTrace(trace: DecisionTrace): string {
  const content = JSON.stringify({
    decisionId: trace.decisionId,
    artifactVersion: trace.artifactVersion,
    candidateSet: trace.candidateSet,
    eliminations: trace.eliminations,
    arbitration: trace.arbitration,
    totalMs: trace.totalMs,
  });

  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Add a candidate to the trace
 */
export function addCandidate(
  trace: DecisionTrace,
  actionId: string,
  enteredAtNode: string,
  score?: number
): void {
  trace.candidateSet.push({
    actionId,
    enteredAtNode,
    score,
  });
}

/**
 * Record an elimination event
 */
export function recordElimination(
  trace: DecisionTrace,
  actionId: string,
  nodeId: string,
  ruleId: string,
  reasonCode: string,
  humanReason: string
): void {
  trace.eliminations.push({
    actionId,
    nodeId,
    ruleId,
    reasonCode,
    humanReason,
  });
}

/**
 * Record a score for an action
 */
export function recordScore(
  trace: DecisionTrace,
  actionId: string,
  component: 'propensity' | 'value' | 'context' | 'lever',
  value: number,
  modelVersion?: string,
  topFeatures?: string[]
): void {
  trace.scores.push({
    actionId,
    component,
    value,
    modelVersion,
    topFeatures,
  });
}

/**
 * Render trace for customer (minimal info)
 */
export function renderForCustomer(trace: DecisionTrace): string {
  const winner = trace.arbitration.winner;
  const eliminations = trace.eliminations.filter((e) => e.actionId === winner);

  let result = `Decision: ${winner}\n\n`;

  if (eliminations.length > 0) {
    result += 'Why you got this offer:\n';
    for (const e of eliminations) {
      result += `  - ${e.humanReason}\n`;
    }
  }

  return result;
}

/**
 * Render trace for analyst (detailed metrics)
 */
export function renderForAnalyst(trace: DecisionTrace): string {
  let result = `Decision ID: ${trace.decisionId}\n`;
  result += `Artifact Version: ${trace.artifactVersion}\n`;
  result += `Total Time: ${trace.totalMs}ms\n\n`;

  result += `Candidates Considered: ${trace.candidateSet.length}\n`;
  for (const c of trace.candidateSet) {
    result += `  - ${c.actionId} (entered at ${c.enteredAtNode})\n`;
  }

  result += `\nEliminations: ${trace.eliminations.length}\n`;
  for (const e of trace.eliminations) {
    result += `  - ${e.actionId}: ${e.reasonCode} (${e.humanReason})\n`;
  }

  result += `\nScores:\n`;
  for (const s of trace.scores) {
    result += `  - ${s.actionId} [${s.component}]: ${s.value.toFixed(3)}\n`;
  }

  result += `\nArbitration: ${JSON.stringify(trace.arbitration)}\n`;

  return result;
}

/**
 * Render trace for engineer (full details)
 */
export function renderForEngineer(trace: DecisionTrace): string {
  return JSON.stringify(trace, null, 2);
}

/**
 * Render trace for regulator (audit trail)
 */
export function renderForRegulator(trace: DecisionTrace): string {
  let result = `Decision Audit Report\n`;
  result += `======================\n\n`;
  result += `Decision ID: ${trace.decisionId}\n`;
  result += `Tenant: ${trace.tenantId}\n`;
  result += `Customer: ${trace.customerRef}\n`;
  result += `Artifact Version: ${trace.artifactVersion}\n`;
  result += `Chain Hash: ${trace.chainHash}\n`;
  result += `Previous Hash: ${trace.prevHash || 'N/A'}\n\n`;

  result += `Compliance Checks:\n`;
  for (const check of trace.complianceChecks) {
    const status = check.passed ? '✓' : '✗';
    result += `  ${status} ${check.checkId}: ${check.reason || 'passed'}\n`;
  }

  result += `\nConsent State:\n`;
  for (const [key, value] of Object.entries(trace.consentState)) {
    result += `  - ${key}: ${value ? 'granted' : 'denied'}\n`;
  }

  return result;
}

/**
 * Verify trace chain integrity
 */
export function verifyChainIntegrity(current: DecisionTrace, previous?: DecisionTrace): boolean {
  if (previous) {
    const previousHash = hashTrace(previous);
    return current.prevHash === previousHash;
  }
  return true;
}

/**
 * Render traces in multiple formats at once
 */
export function renderTraces(trace: DecisionTrace): {
  customer: string;
  analyst: string;
  engineer: string;
  regulator: string;
} {
  return {
    customer: renderForCustomer(trace),
    analyst: renderForAnalyst(trace),
    engineer: renderForEngineer(trace),
    regulator: renderForRegulator(trace),
  };
}
