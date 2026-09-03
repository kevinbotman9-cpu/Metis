/**
 * Artifact Registry - Immutable, versioned, signed artifact storage
 */

import type { CompiledArtifact, ArtifactMetadata } from '@metis/types';
import { v4 as uuid } from 'uuid';

export interface RegistryEntry {
  artifact: CompiledArtifact;
  activeVersion?: string;
  versions: Map<string, CompiledArtifact>;
  auditLog: RegistryAuditEntry[];
}

export interface RegistryAuditEntry {
  timestamp: string;
  action: 'published' | 'promoted' | 'rolled_back';
  actor: string;
  details: Record<string, any>;
}

/**
 * In-memory artifact registry for Phase 0
 * Phase 1 will add persistent storage (PostgreSQL + S3)
 */
export class ArtifactRegistry {
  private artifacts: Map<string, RegistryEntry> = new Map();

  /**
   * Publish a new artifact version
   */
  publishArtifact(
    artifact: CompiledArtifact,
    tenantId: string,
    actor: string
  ): { success: boolean; artifactId: string; error?: string } {
    const key = `${tenantId}:${artifact.id}`;

    if (!this.artifacts.has(key)) {
      this.artifacts.set(key, {
        artifact,
        activeVersion: artifact.version,
        versions: new Map(),
        auditLog: [],
      });
    }

    const entry = this.artifacts.get(key)!;
    entry.versions.set(artifact.version, artifact);
    entry.activeVersion = artifact.version;

    entry.auditLog.push({
      timestamp: new Date().toISOString(),
      action: 'published',
      actor,
      details: { version: artifact.version },
    });

    return { success: true, artifactId: artifact.id };
  }

  /**
   * Get an artifact by name and version
   */
  getArtifact(
    tenantId: string,
    artifactName: string,
    version?: string
  ): CompiledArtifact | undefined {
    const key = `${tenantId}:${artifactName}`;
    const entry = this.artifacts.get(key);

    if (!entry) return undefined;

    if (version) {
      return entry.versions.get(version);
    }

    // Return active version
    if (entry.activeVersion) {
      return entry.versions.get(entry.activeVersion);
    }

    return entry.artifact;
  }

  /**
   * List all versions of an artifact
   */
  listVersions(tenantId: string, artifactName: string): string[] {
    const key = `${tenantId}:${artifactName}`;
    const entry = this.artifacts.get(key);

    if (!entry) return [];

    return Array.from(entry.versions.keys()).sort();
  }

  /**
   * Promote an artifact version to active (blue/green deployment)
   */
  promoteVersion(
    tenantId: string,
    artifactName: string,
    version: string,
    actor: string
  ): { success: boolean; error?: string } {
    const key = `${tenantId}:${artifactName}`;
    const entry = this.artifacts.get(key);

    if (!entry) {
      return { success: false, error: 'Artifact not found' };
    }

    if (!entry.versions.has(version)) {
      return { success: false, error: `Version ${version} not found` };
    }

    const previousVersion = entry.activeVersion;
    entry.activeVersion = version;

    entry.auditLog.push({
      timestamp: new Date().toISOString(),
      action: 'promoted',
      actor,
      details: { from: previousVersion, to: version },
    });

    return { success: true };
  }

  /**
   * Rollback to a previous version
   */
  rollbackVersion(
    tenantId: string,
    artifactName: string,
    actor: string
  ): { success: boolean; version?: string; error?: string } {
    const key = `${tenantId}:${artifactName}`;
    const entry = this.artifacts.get(key);

    if (!entry) {
      return { success: false, error: 'Artifact not found' };
    }

    // Find previous published version
    const auditLog = entry.auditLog.reverse();
    for (const log of auditLog) {
      if (log.action === 'published' && log.details.version !== entry.activeVersion) {
        const previousVersion = log.details.version as string;
        if (entry.versions.has(previousVersion)) {
          entry.activeVersion = previousVersion;

          entry.auditLog.push({
            timestamp: new Date().toISOString(),
            action: 'rolled_back',
            actor,
            details: { to: previousVersion },
          });

          return { success: true, version: previousVersion };
        }
      }
    }

    return { success: false, error: 'No previous version found to rollback to' };
  }

  /**
   * Get audit log for an artifact
   */
  getAuditLog(tenantId: string, artifactName: string): RegistryAuditEntry[] {
    const key = `${tenantId}:${artifactName}`;
    const entry = this.artifacts.get(key);

    return entry ? entry.auditLog : [];
  }
}

// Global registry instance
export const registry = new ArtifactRegistry();
