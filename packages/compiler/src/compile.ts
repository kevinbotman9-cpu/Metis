/**
 * Main Compiler - Ties together type checking, version resolution, cost analysis
 */

import type { CompiledArtifact, DecisionIR, Tenant } from '@metis/types';
import { validateDirectionIntermediateRepresentation } from '@metis/core';
import { typeCheck } from './typecheck';
import { resolveVersions } from './resolver';
import { analyzeCost } from './costAnalyzer';
import * as crypto from 'crypto';

export interface CompileOptions {
  tenantConfig: Tenant;
  dataModel?: Record<string, any>;
  sign?: boolean;
  createdBy?: string;
}

export interface CompileResult {
  success: boolean;
  artifact?: CompiledArtifact;
  errors: string[];
  warnings: string[];
}

/**
 * Compile a Decision Intermediate Representation (DIR) to a CompiledArtifact
 */
export function compile(dir: unknown, options: CompileOptions): CompileResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Step 1: Validate schema
  const schemaValidation = validateDirectionIntermediateRepresentation(dir);
  if (!schemaValidation.valid) {
    errors.push('Schema validation failed:');
    errors.push(...schemaValidation.errors);
    return { success: false, errors, warnings };
  }

  const dirArtifact = dir as DecisionIR;

  // Step 2: Type check
  const typeCheckResult = typeCheck(dirArtifact, options.tenantConfig, options.dataModel || {});
  if (!typeCheckResult.valid) {
    errors.push('Type checking failed:');
    typeCheckResult.errors.forEach((e) => {
      if (e.severity === 'error') {
        errors.push(`  [${e.nodeId || 'global'}]: ${e.message}`);
      } else {
        warnings.push(`  [${e.nodeId || 'global'}]: ${e.message}`);
      }
    });
  }

  if (!typeCheckResult.valid) {
    return { success: false, errors, warnings };
  }

  // Step 3: Resolve versions
  const resolution = resolveVersions(dirArtifact);
  if (!resolution.success) {
    errors.push('Version resolution failed:');
    errors.push(...resolution.conflicts);
    return { success: false, errors, warnings };
  }

  // Step 4: Analyze cost
  const costAnalysis = analyzeCost(dirArtifact, options.tenantConfig);
  if (!costAnalysis.valid) {
    errors.push('Cost analysis failed:');
    errors.push(...costAnalysis.violations);
    return { success: false, errors, warnings };
  }

  // Step 5: Build compiled artifact
  const artifact: CompiledArtifact = {
    id: dirArtifact.id,
    version: dirArtifact.version,
    metadata: {
      id: dirArtifact.id,
      version: dirArtifact.version,
      tenantId: options.tenantConfig.id,
      createdAt: new Date().toISOString(),
      createdBy: options.createdBy || 'system',
      signature: '',
    },
    dirSchema: dirArtifact,
    packageVersions: resolution.locked,
    costManifest: costAnalysis.estimate,
    binary: Buffer.from(''), // Placeholder - Phase 2 builds WASM binary
    signature: '',
  };

  // Step 6: Sign if requested
  if (options.sign) {
    artifact.signature = signArtifact(artifact);
  }

  return {
    success: true,
    artifact,
    errors,
    warnings,
  };
}

/**
 * Create cryptographic signature of an artifact (stub for Phase 0)
 */
function signArtifact(artifact: CompiledArtifact): string {
  const content = JSON.stringify({
    id: artifact.id,
    version: artifact.version,
    dirSchema: artifact.dirSchema,
    packageVersions: artifact.packageVersions,
  });

  // In Phase 2, this would use actual cryptographic signing
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return hash;
}

/**
 * Verify an artifact signature
 */
export function verifySignature(artifact: CompiledArtifact): boolean {
  const expectedSignature = signArtifact(artifact);
  return artifact.signature === expectedSignature;
}

/**
 * Generate a human-readable compilation report
 */
export function generateCompileReport(result: CompileResult): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push('✓ Compilation successful');
    if (result.artifact) {
      lines.push(`  Artifact ID: ${result.artifact.id}`);
      lines.push(`  Version: ${result.artifact.version}`);
      lines.push(`  Nodes: ${result.artifact.dirSchema.nodes.length}`);
      lines.push(
        `  Estimated P95 Latency: ${result.artifact.costManifest.estimatedP95LatencyMs}ms`
      );
      lines.push(
        `  Models Invoked: ${result.artifact.costManifest.modelInvocations.join(', ') || 'none'}`
      );
    }
  } else {
    lines.push('✗ Compilation failed');
  }

  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    result.errors.forEach((e) => lines.push(`  ${e}`));
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    result.warnings.forEach((w) => lines.push(`  ${w}`));
  }

  return lines.join('\n');
}
