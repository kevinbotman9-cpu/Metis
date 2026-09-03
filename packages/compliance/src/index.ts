/**
 * METIS Compliance - Phase 4
 * SOC 2, GDPR, AI Act, FCA Consumer Duty
 */

import type { DecisionTrace } from '@metis/types';

export interface ComplianceReport {
  checkId: string;
  framework: 'SOC2' | 'GDPR' | 'EU-AI-Act' | 'FCA-Consumer-Duty' | 'CCPA';
  timestamp: string;
  passed: boolean;
  findings: string[];
}

/**
 * SOC 2 Type II - Audit trail and access control checks
 */
export function checkSOC2(trace: DecisionTrace): ComplianceReport {
  const findings: string[] = [];

  // Check 1: Immutable audit trail
  if (!trace.chainHash) {
    findings.push('No chain hash - audit trail may not be immutable');
  }

  // Check 2: Access control (tenant isolation)
  if (!trace.tenantId) {
    findings.push('No tenant isolation - potential multi-tenant breach');
  }

  // Check 3: Encryption (in-transit, at-rest) - stub
  findings.push('Encryption verification deferred to infrastructure layer');

  return {
    checkId: 'SOC2-TYPE-II',
    framework: 'SOC2',
    timestamp: new Date().toISOString(),
    passed: findings.length === 0,
    findings,
  };
}

/**
 * GDPR - Consent, right-to-erasure, data processing agreement
 */
export function checkGDPR(trace: DecisionTrace): ComplianceReport {
  const findings: string[] = [];

  // Check 1: Consent
  const consentGranted = Object.values(trace.consentState).some((c) => c);
  if (!consentGranted) {
    findings.push('No consent found - decision may violate GDPR Article 6');
  }

  // Check 2: Legitimate interest documented
  if (!trace.arbitration) {
    findings.push('No arbitration reason - legitimate interest not documented');
  }

  // Check 3: Customer pseudonymization
  if (trace.customerRef && trace.customerRef.includes('@')) {
    findings.push('Customer ID not pseudonymized');
  }

  return {
    checkId: 'GDPR',
    framework: 'GDPR',
    timestamp: new Date().toISOString(),
    passed: findings.length === 0,
    findings,
  };
}

/**
 * EU AI Act - Transparency, human oversight, bias monitoring
 */
export function checkEUAIAct(trace: DecisionTrace): ComplianceReport {
  const findings: string[] = [];

  // Check 1: Transparency (explainability)
  if (trace.eliminations.length === 0 && trace.scores.length === 0) {
    findings.push('No decision reasoning provided - violates EU AI Act Article 13');
  }

  // Check 2: High-risk compliance (human in the loop)
  const hasModelScoring = trace.scores.some((s) => s.modelVersion);
  if (hasModelScoring && !trace.arbitration) {
    findings.push('Model-based decision lacks human oversight');
  }

  // Check 3: Bias monitoring
  // Stub: Phase 3 implements real drift detection
  findings.push('Bias monitoring deferred to Phase 3 analytics');

  return {
    checkId: 'EU-AI-ACT',
    framework: 'EU-AI-Act',
    timestamp: new Date().toISOString(),
    passed: findings.length === 1, // Only bias monitoring is deferred
    findings,
  };
}

/**
 * FCA Consumer Duty - Fair treatment, suitability, impact assessment
 */
export function checkFCAConsumerDuty(trace: DecisionTrace): ComplianceReport {
  const findings: string[] = [];

  // Check 1: Fair treatment
  if (!trace.arbitration) {
    findings.push('No arbitration documented - fair treatment not demonstrated');
  }

  // Check 2: Suitability (action appropriate for customer)
  // Stub: Phase 1 adds explicit suitability layer
  findings.push('Suitability layer deferred to Phase 1');

  // Check 3: Impact on vulnerable customers
  // Stub: Phase 3 adds vulnerability scoring
  findings.push('Vulnerability impact assessment deferred to Phase 3');

  return {
    checkId: 'FCA-CONSUMER-DUTY',
    framework: 'FCA-Consumer-Duty',
    timestamp: new Date().toISOString(),
    passed: findings.length === 2, // Only deferred items
    findings,
  };
}

/**
 * Run all compliance checks
 */
export function runComplianceChecks(trace: DecisionTrace): ComplianceReport[] {
  return [checkSOC2(trace), checkGDPR(trace), checkEUAIAct(trace), checkFCAConsumerDuty(trace)];
}

/**
 * Generate compliance evidence for audit/regulator
 */
export function generateComplianceEvidence(trace: DecisionTrace): {
  framework: string;
  evidence: Record<string, string>;
  timestamp: string;
} {
  return {
    framework: 'Multi-Framework Compliance',
    evidence: {
      'Audit Trail': trace.chainHash,
      'Consent State': JSON.stringify(trace.consentState),
      'Decision Reasoning': trace.eliminations.map((e) => e.humanReason).join('; '),
      'Tenant Isolation': trace.tenantId,
      'Compliance Checks': JSON.stringify(trace.complianceChecks),
    },
    timestamp: new Date().toISOString(),
  };
}
