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
/**
 * Asynchronous because durable storage is. The in-memory implementation
 * satisfies it trivially; making the interface synchronous to suit the easy
 * case would have meant rewriting every caller the first time a real database
 * appeared, which is the wrong way round.
 */
export interface RegistryStore {
  getVersion(tenantId: string, name: string, version: string): Promise<PublishedVersion | undefined>;
  listVersions(tenantId: string, name: string): Promise<PublishedVersion[]>;
  putVersion(v: PublishedVersion): Promise<void>;

  getEnvironment(
    tenantId: string,
    name: string,
    env: Environment
  ): Promise<EnvironmentState | undefined>;
  putEnvironment(tenantId: string, name: string, state: EnvironmentState): Promise<void>;
  listEnvironments(tenantId: string, name: string): Promise<EnvironmentState[]>;

  appendEvent(event: Omit<RegistryEvent, 'seq'>): Promise<RegistryEvent>;
  listEvents(filter?: {
    tenantId?: string;
    strategyName?: string;
    limit?: number;
  }): Promise<RegistryEvent[]>;

  listStrategies(tenantId: string): Promise<string[]>;
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
  async publish(command: PublishCommand, ctx: CompileContext): Promise<PublishOutcome> {
    const { tenantId, strategyName, version, source, actor, occurredAt } = command;

    const result = compileStrategy(source, ctx);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    const warnings = result.diagnostics.filter((d) => d.severity === 'warning');

    if (!result.ok || !result.artifact) {
      // Recorded, not silently dropped. "Did anyone try to ship this?" is a
      // question worth being able to answer.
      await this.store.appendEvent({
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

    const existing = await this.store.getVersion(tenantId, strategyName, version);
    if (existing) {
      if (existing.artifact.artifactHash === result.artifact.artifactHash) {
        // Idempotent. A retried deploy is not an error, and it must not
        // produce a second event that looks like a second publish.
        return { status: 'unchanged', artifact: existing.artifact, diagnostics: result.diagnostics };
      }
      await this.store.appendEvent({
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

    await this.store.putVersion({
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
    const stored = (await this.store.getVersion(tenantId, strategyName, version))!;

    await this.store.appendEvent({
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
  async promote(
    tenantId: string,
    strategyName: string,
    version: string,
    environment: Environment,
    actor: string,
    occurredAt: string
  ): Promise<EnvironmentState> {
    const target = await this.store.getVersion(tenantId, strategyName, version);
    if (!target) {
      throw new RegistryError(
        'UNKNOWN_VERSION',
        `${strategyName} ${version} has not been published. Publish it before promoting it.`
      );
    }

    const current = await this.store.getEnvironment(tenantId, strategyName, environment);
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
    await this.store.putEnvironment(tenantId, strategyName, next);

    await this.store.appendEvent({
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
  async rollback(
    tenantId: string,
    strategyName: string,
    environment: Environment,
    actor: string,
    occurredAt: string
  ): Promise<EnvironmentState> {
    const current = await this.store.getEnvironment(tenantId, strategyName, environment);
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
    await this.store.putEnvironment(tenantId, strategyName, next);

    await this.store.appendEvent({
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
  async active(tenantId: string, strategyName: string, environment: Environment) {
    const state = await this.store.getEnvironment(tenantId, strategyName, environment);
    if (!state?.activeVersion) return null;
    return (await this.store.getVersion(tenantId, strategyName, state.activeVersion)) ?? null;
  }

  async version(tenantId: string, strategyName: string, version: string) {
    return (await this.store.getVersion(tenantId, strategyName, version)) ?? null;
  }

  /** Newest first, by publish time then version, so the list is stable. */
  async versions(tenantId: string, strategyName: string): Promise<PublishedVersion[]> {
    const all = await this.store.listVersions(tenantId, strategyName);
    return [...all].sort(
      (a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.version.localeCompare(a.version)
    );
  }

  async environments(tenantId: string, strategyName: string): Promise<EnvironmentState[]> {
    const all = await this.store.listEnvironments(tenantId, strategyName);
    return [...all].sort((a, b) => a.environment.localeCompare(b.environment));
  }

  async strategies(tenantId: string): Promise<string[]> {
    return [...(await this.store.listStrategies(tenantId))].sort();
  }

  /** Newest first. */
  events(filter?: {
    tenantId?: string;
    strategyName?: string;
    limit?: number;
  }): Promise<RegistryEvent[]> {
    return this.store.listEvents(filter);
  }

  /** Warnings a version published with, for a surface that has to explain it. */
  async warningsFor(
    tenantId: string,
    strategyName: string,
    version: string
  ): Promise<Diagnostic[]> {
    return (await this.store.getVersion(tenantId, strategyName, version))?.warnings ?? [];
  }
}
