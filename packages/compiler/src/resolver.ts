/**
 * Version Resolver - Resolve version ranges and pin packages
 */

import { satisfies } from 'semver';
import type { DecisionIR } from '@metis/types';

export interface ResolutionResult {
  success: boolean;
  locked: Record<string, string>;
  conflicts: string[];
}

/**
 * Simple in-memory package registry for Phase 0
 * In production, this would query a package repository
 */
const PACKAGE_REGISTRY: Record<string, string[]> = {
  '@metis/core': ['1.0.0', '1.0.1', '1.1.0'],
  '@metis/nodes-core': ['1.0.0', '1.0.1'],
  '@metis/trace': ['1.0.0'],
  '@metis/runtime': ['1.0.0'],
};

/**
 * Resolve version ranges in an artifact to exact locked versions
 */
export function resolveVersions(
  dir: DecisionIR,
  packageRegistry: Record<string, string[]> = PACKAGE_REGISTRY
): ResolutionResult {
  const locked: Record<string, string> = {};
  const conflicts: string[] = [];

  for (const [pkgId, versionRange] of Object.entries(dir.packageDependencies)) {
    const availableVersions = packageRegistry[pkgId];

    if (!availableVersions) {
      conflicts.push(`Package not found: ${pkgId}`);
      continue;
    }

    // Find the best matching version (highest that satisfies the range)
    const matching = availableVersions.filter((v) => satisfies(v, versionRange));

    if (matching.length === 0) {
      conflicts.push(
        `No version of ${pkgId} matches range ${versionRange}. Available: ${availableVersions.join(', ')}`
      );
      continue;
    }

    // Pick the highest matching version
    locked[pkgId] = matching[matching.length - 1];
  }

  return {
    success: conflicts.length === 0,
    locked,
    conflicts,
  };
}

/**
 * Check for transitive dependency conflicts
 */
export function checkConflicts(
  locked: Record<string, string>,
  dependencies: Record<string, Record<string, string>>
): string[] {
  const conflicts: string[] = [];

  for (const [pkgId, version] of Object.entries(locked)) {
    const deps = dependencies[`${pkgId}@${version}`];
    if (!deps) continue;

    for (const [depId, depRange] of Object.entries(deps)) {
      const lockedDepVersion = locked[depId];
      if (lockedDepVersion && !satisfies(lockedDepVersion, depRange)) {
        conflicts.push(
          `Conflict: ${pkgId}@${version} requires ${depId}@${depRange}, but ${lockedDepVersion} is locked`
        );
      }
    }
  }

  return conflicts;
}

/**
 * Create a reproducible lock file entry
 */
export function createLockEntry(locked: Record<string, string>): string {
  // Create a deterministic JSON representation for audit
  const sorted = Object.keys(locked)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] = locked[key];
        return acc;
      },
      {} as Record<string, string>
    );

  return JSON.stringify(sorted);
}

/**
 * Parse a lock file entry
 */
export function parseLockEntry(entry: string): Record<string, string> {
  return JSON.parse(entry);
}
