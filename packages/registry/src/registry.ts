import { compileStrategy, type CompileContext } from '@metis/compiler/strategy';
import type { Diagnostic } from '@metis/compiler/strategy';
import type {
  Environment,
  EnvironmentState,
  PublishCommand,
  PublishOutcome,
  PublishedVersion,
  RegistryEvent,
} from './types';
import { RegistryError } from './types';

/**
 * The artifact registry.
 *
 * Storage is behind `RegistryStore` so PostgreSQL can replace the in-memory
 * implementation without touching any of the rules below. The rules are the
 * point; where the rows live is not.
 *
 * Nothing here reads the clock. `occurredAt` arrives with the command, for the
 * same reason the engine takes it as an input: a registry that stamped
 * `Date.now()` would make its own audit log untestable and its ordering
 * dependent on how fast the machine was.
 */
export interface RegistryStore {
  getVersion(tenantId: string, name: string, version: string): PublishedVersion | undefined;
  listVersions(tenantId: string, name: string): PublishedVersion[];
  putVersion(v: PublishedVersion): void;

  getEnvironment(tenantId: string, name: string, env: Environment): EnvironmentState | undefined;
  putEnvironment(tenantId: string, name: string, state: EnvironmentState): void;
  listEnvironments(tenantId: string, name: string): EnvironmentState[];

  appendEvent(event: Omit<RegistryEvent, 'seq'>): RegistryEvent;
  listEvents(filter?: { tenantId?: string; strategyName?: string; limit?: number }): RegistryEvent[];

  listStrategies(tenantId: string): string[];
}

export class ArtifactRegistry {
  constructor(private readonly store: RegistryStore) {}

  // --- Publishing -----------------------------------------------------------

  /**
   * Compile, then store.
   *
   * The order is the feature. A strategy that does not compile does not enter
   * the registry, so it cannot be promoted, so it cannot reach execution. The
   * compiler already knew — nothing was listening.
   */
  publish(command: PublishCommand, ctx: CompileContext): PublishOutcome {
    const { tenantId, strategyName, version, source, actor, occurredAt } = command;

    const result = compileStrategy(source, ctx);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    const warnings = result.diagnostics.filter((d) => d.severity === 'warning');

    if (!result.ok || !result.artifact) {
      // Recorded, not silently dropped. "Did anyone try to ship this?" is a
      // question worth being able to answer.
      this.store.appendEvent({
        at: occurredAt,
        actor,
        type: 'PublishRejected',
        tenantId,
        strategyName,
        version,
        summary: `Refused ${strategyName} ${version}: ${errors.length} compilation error(s) — ${errors
          .map((e) => e.code)
          .join(', ')}`,
        diagnostics: result.diagnostics,
      });
      return { status: 'rejected', reason: 'compilation', diagnostics: result.diagnostics };
    }

    const existing = this.store.getVersion(tenantId, strategyName, version);
    if (existing) {
      if (existing.artifact.artifactHash === result.artifact.artifactHash) {
        // Idempotent. A retried deploy is not an error, and it must not
        // produce a second event that looks like a second publish.
        return { status: 'unchanged', artifact: existing.artifact, diagnostics: result.diagnostics };
      }
      this.store.appendEvent({
        at: occurredAt,
        actor,
        type: 'PublishRejected',
        tenantId,
        strategyName,
        version,
        summary:
          `Refused ${strategyName} ${version}: the version already holds different content. ` +
          `Published ${existing.artifact.artifactHash.slice(0, 12)}, offered ${result.artifact.artifactHash.slice(0, 12)}.`,
        diagnostics: result.diagnostics,
      });
      return {
        status: 'rejected',
        reason: 'immutable',
        diagnostics: result.diagnostics,
        existingHash: existing.artifact.artifactHash,
        attemptedHash: result.artifact.artifactHash,
      };
    }

    this.store.putVersion({
      tenantId,
      strategyName,
      version,
      artifact: result.artifact,
      publishedAt: occurredAt,
      publishedBy: actor,
      warnings,
    });

    // Read it back rather than returning the compiler's object. What publish
    // hands out has to be the thing that was stored — otherwise a caller holds
    // a mutable copy that looks authoritative and is not.
    const stored = this.store.getVersion(tenantId, strategyName, version)!;

    this.store.appendEvent({
      at: occurredAt,
      actor,
      type: 'ArtifactPublished',
      tenantId,
      strategyName,
      version,
      summary:
        `Published ${strategyName} ${version} (${result.artifact.artifactHash.slice(0, 12)})` +
        (warnings.length > 0 ? ` with ${warnings.length} warning(s)` : '') +
        `. Not active anywhere until promoted.`,
    });

    return { status: 'published', artifact: stored.artifact, diagnostics: result.diagnostics };
  }

  // --- Promotion ------------------------------------------------------------

  /**
   * Point an environment at a published version.
   *
   * Separate from publishing on purpose. Promotion is the moment a change
   * reaches customers, and it should be its own decision with its own audit
   * entry — not a side effect of saving your work.
   */
  promote(
    tenantId: string,
    strategyName: string,
    version: string,
    environment: Environment,
    actor: string,
    occurredAt: string
  ): EnvironmentState {
    const target = this.store.getVersion(tenantId, strategyName, version);
    if (!target) {
      throw new RegistryError(
        'UNKNOWN_VERSION',
        `${strategyName} ${version} has not been published. Publish it before promoting it.`
      );
    }

    const current = this.store.getEnvironment(tenantId, strategyName, environment);
    if (current?.activeVersion === version) {
      throw new RegistryError(
        'ALREADY_ACTIVE',
        `${strategyName} ${version} is already active in ${environment}.`
      );
    }

    const next: EnvironmentState = {
      environment,
      activeVersion: version,
      // What rollback returns to. Only the immediately previous version: a
      // deeper history invites rolling back to something nobody remembers.
      previousVersion: current?.activeVersion ?? null,
      promotedAt: occurredAt,
      promotedBy: actor,
    };
    this.store.putEnvironment(tenantId, strategyName, next);

    this.store.appendEvent({
      at: occurredAt,
      actor,
      type: 'VersionPromoted',
      tenantId,
      strategyName,
      version,
      environment,
      summary:
        current?.activeVersion
          ? `Promoted ${strategyName} ${version} to ${environment}, replacing ${current.activeVersion}.`
          : `Promoted ${strategyName} ${version} to ${environment}.`,
    });

    return next;
  }

  /**
   * Return an environment to the version it ran before.
   *
   * The rollback becomes the new active version and the version it replaced
   * becomes the rollback target, so rolling back twice returns to where you
   * started rather than walking backwards through history. That is what an
   * operator means by "undo that".
   */
  rollback(
    tenantId: string,
    strategyName: string,
    environment: Environment,
    actor: string,
    occurredAt: string
  ): EnvironmentState {
    const current = this.store.getEnvironment(tenantId, strategyName, environment);
    if (!current || !current.activeVersion) {
      throw new RegistryError(
        'UNKNOWN_STRATEGY',
        `${strategyName} is not active in ${environment}; there is nothing to roll back.`
      );
    }
    if (!current.previousVersion) {
      throw new RegistryError(
        'NOTHING_TO_ROLL_BACK',
        `${strategyName} ${current.activeVersion} is the first version promoted to ${environment}. There is no earlier version to return to.`
      );
    }

    const next: EnvironmentState = {
      environment,
      activeVersion: current.previousVersion,
      previousVersion: current.activeVersion,
      promotedAt: occurredAt,
      promotedBy: actor,
    };
    this.store.putEnvironment(tenantId, strategyName, next);

    this.store.appendEvent({
      at: occurredAt,
      actor,
      type: 'VersionRolledBack',
      tenantId,
      strategyName,
      version: current.previousVersion,
      environment,
      summary: `Rolled ${environment} back from ${current.activeVersion} to ${current.previousVersion}.`,
    });

    return next;
  }

  // --- Reading --------------------------------------------------------------

  /** The artifact an environment is currently running, or null. */
  active(tenantId: string, strategyName: string, environment: Environment) {
    const state = this.store.getEnvironment(tenantId, strategyName, environment);
    if (!state?.activeVersion) return null;
    return this.store.getVersion(tenantId, strategyName, state.activeVersion) ?? null;
  }

  version(tenantId: string, strategyName: string, version: string) {
    return this.store.getVersion(tenantId, strategyName, version) ?? null;
  }

  /** Newest first, by publish time then version, so the list is stable. */
  versions(tenantId: string, strategyName: string): PublishedVersion[] {
    return [...this.store.listVersions(tenantId, strategyName)].sort(
      (a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.version.localeCompare(a.version)
    );
  }

  environments(tenantId: string, strategyName: string): EnvironmentState[] {
    return [...this.store.listEnvironments(tenantId, strategyName)].sort((a, b) =>
      a.environment.localeCompare(b.environment)
    );
  }

  strategies(tenantId: string): string[] {
    return [...this.store.listStrategies(tenantId)].sort();
  }

  /** Newest first. */
  events(filter?: { tenantId?: string; strategyName?: string; limit?: number }): RegistryEvent[] {
    return this.store.listEvents(filter);
  }

  /** Warnings a version published with, for a surface that has to explain it. */
  warningsFor(tenantId: string, strategyName: string, version: string): Diagnostic[] {
    return this.store.getVersion(tenantId, strategyName, version)?.warnings ?? [];
  }
}
