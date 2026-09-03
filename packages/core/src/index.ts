/**
 * METIS Core - DIR Schema, Package Manifest, and Core Node Types
 */

import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import type { DecisionIR } from '@metis/types';

// Load schemas
const dirSchema = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'schema/dir.schema.json'), 'utf-8')
);
const packageSchema = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'schema/metis-package.schema.json'), 'utf-8')
);

const ajv = new Ajv();

/**
 * Validates a Decision Intermediate Representation (DIR) against the schema
 */
export function validateDirectionIntermediateRepresentation(dir: unknown): {
  valid: boolean;
  errors: string[];
} {
  const validator = ajv.compile(dirSchema);
  const valid = validator(dir) as boolean;
  const errors = valid ? [] : (validator.errors || []).map((e: any) => `${e.instancePath}: ${e.message}`);
  return { valid, errors };
}

/**
 * Validates a package manifest against the schema
 */
export function validatePackageManifestSchema(manifest: unknown): {
  valid: boolean;
  errors: string[];
} {
  const validator = ajv.compile(packageSchema);
  const valid = validator(manifest) as boolean;
  const errors = valid ? [] : (validator.errors || []).map((e: any) => `${e.instancePath}: ${e.message}`);
  return { valid, errors };
}

/**
 * Core node type definitions
 */
export const CORE_NODE_TYPES = {
  SOURCE: 'source',
  FILTER: 'filter',
  SET_PROPERTY: 'set-property',
  JOIN: 'join',
  AGGREGATE: 'aggregate',
  GROUP_BY: 'group-by',
  SCORE_MODEL: 'score-model',
  SCORE_ADAPTIVE: 'score-adaptive',
  PRIORITISE: 'prioritise',
  SWITCH: 'switch',
  SUB_STRATEGY: 'sub-strategy',
  CHAMPION_CHALLENGER: 'champion-challenger',
  INTERACTION_HISTORY: 'interaction-history',
  CONSTRAINT: 'constraint',
  SUPPRESS: 'suppress',
  ARBITRATE: 'arbitrate',
  EXPLAIN_ANNOTATE: 'explain-annotate',
} as const;

/**
 * Get all core node types as an array
 */
export function getCoreNodeTypes(): string[] {
  return Object.values(CORE_NODE_TYPES);
}

/**
 * Check if a node type is a core node type
 */
export function isCoreNodeType(type: string): boolean {
  return Object.values(CORE_NODE_TYPES).includes(type as any);
}

/**
 * Export schemas for external use
 */
export { dirSchema, packageSchema };
