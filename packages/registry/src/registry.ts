import { compileDecisionFlow, type CompileContext } from '@metis/compiler/decision-flow';
import type { Diagnostic } from '@metis/compiler/decision-flow';
import type {
  Environment,
  EnvironmentState,
  PublishCommand,
  PublishOutcome,
  PublishedVersion,
  RegistryEvent,
  FlowTestResult,
  FlowTestRunner,
  FlowDraft,
  ShadowComparisonRecord,
} from './types';
import { RegistryError } from './types';
import type { ModelVersion } from '@metis/core/domain';
import {
  compareVersions,
  modelContentHash,
  modelProblems,
  modelVersionOf,
  type ModelDeclaration,
  type ModelPublishOutcome,
} from './models';

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
    flowName?: string;
    limit?: number;
  }): Promise<RegistryEvent[]>;

  listFlows(tenantId: string): Promise<string[]>;

  getModelVersion(tenantId: string, modelId: string, version: string): Promise<ModelVersion | undefined>;
  /** Every version of every model the tenant has, or of the one named. */
  listModelVersions(tenantId: string, modelId?: string): Promise<ModelVersion[]>;
  /** Append-only. The registry checks for an existing version before calling. */
  putModelVersion(version: ModelVersion): Promise<void>;

  getDraft(tenantId: string, name: string): Promise<FlowDraft | undefined>;
  /** Replaces the flow's draft. The one write here that is not append-only. */
  putDraft(draft: FlowDraft): Promise<void>;
  listDrafts(tenantId: string): Promise<FlowDraft[]>;

  /** Append-only. */
  appendShadowComparison(record: ShadowComparisonRecord): Promise<void>;
  /** Oldest first, narrowed by whichever of the pair's fields are given. */
  listShadowComparisons(filter: {
    tenantId: string;
    flowName: string;
    environment?: Environment;
    activeVersion?: string;
    shadowVersion?: string;
  }): Promise<ShadowComparisonRecord[]>;
}

export class ArtifactRegistry {
  constructor(private readonly store: RegistryStore) {}

  // --- Publishing -----------------------------------------------------------

  /**
   * Compile, then store.
   *
   * The order is the feature. A flow that does not compile does not enter
   * the registry, so it cannot be promoted, so it cannot reach execution. The
   * compiler already knew — nothing was listening.
   */
  /**
   * Publish a version, if it compiles and its own tests pass.
   *
   * The compilation gate is why a broken flow cannot reach production.
   * Compilation only proves the graph is well-formed, though — it says nothing
   * about whether the flow still offers what its author said it offers, which
   * is the change someone editing a policy is actually making. So a version
   * may attach cases, and they run here.
   *
   * A version that attaches cases and is published without a runner is
   * **refused**. An optional gate is not a gate: if a caller could skip the
   * tests by omitting an argument, the first hurried deploy would.
   */
  async publish(
    command: PublishCommand,
    ctx: CompileContext,
    runner?: FlowTestRunner
  ): Promise<PublishOutcome> {
    const { tenantId, flowName, version, source, actor, occurredAt } = command;

    const result = compileDecisionFlow(source, ctx);
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
        flowName,
        version,
        summary: `Refused ${flowName} ${version}: ${errors.length} compilation error(s) — ${errors
          .map((e) => e.code)
          .join(', ')}`,
        diagnostics: result.diagnostics,
      });
      return { status: 'rejected', reason: 'compilation', diagnostics: result.diagnostics };
    }

    const cases = (source as { tests?: unknown[] }).tests ?? [];
    let tests: FlowTestResult[] = [];

    if (cases.length > 0) {
      if (!runner) {
        await this.store.appendEvent({
          at: occurredAt,
          actor,
          type: 'PublishRejected',
          tenantId,
          flowName,
          version,
          summary:
            `Refused ${flowName} ${version}: it attaches ${cases.length} test case(s) ` +
            'and no runner was supplied, so they could not be run. A gate that ' +
            'can be skipped by omitting an argument is not a gate.',
          diagnostics: result.diagnostics,
        });
        return { status: 'rejected', reason: 'tests', diagnostics: result.diagnostics, tests: [] };
      }

      tests = await runner.run(result.artifact, cases);
      const failed = tests.filter((t) => !t.passed);
      if (failed.length > 0) {
        await this.store.appendEvent({
          at: occurredAt,
          actor,
          type: 'PublishRejected',
          tenantId,
          flowName,
          version,
          summary:
            `Refused ${flowName} ${version}: ${failed.length} of ${tests.length} ` +
            `test(s) failed — ${failed.map((t) => t.name).join(', ')}`,
          diagnostics: result.diagnostics,
        });
        return { status: 'rejected', reason: 'tests', diagnostics: result.diagnostics, tests };
      }
    }

    const existing = await this.store.getVersion(tenantId, flowName, version);
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
        flowName,
        version,
        summary:
          `Refused ${flowName} ${version}: the version already holds different content. ` +
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
      flowName,
      version,
      artifact: result.artifact,
      publishedAt: occurredAt,
      publishedBy: actor,
      warnings,
      tests,
    });

    // Read it back rather than returning the compiler's object. What publish
    // hands out has to be the thing that was stored — otherwise a caller holds
    // a mutable copy that looks authoritative and is not.
    const stored = (await this.store.getVersion(tenantId, flowName, version))!;

    await this.store.appendEvent({
      at: occurredAt,
      actor,
      type: 'ArtifactPublished',
      tenantId,
      flowName,
      version,
      summary:
        `Published ${flowName} ${version} (${result.artifact.artifactHash.slice(0, 12)})` +
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
    flowName: string,
    version: string,
    environment: Environment,
    actor: string,
    occurredAt: string
  ): Promise<EnvironmentState> {
    const target = await this.store.getVersion(tenantId, flowName, version);
    if (!target) {
      throw new RegistryError(
        'UNKNOWN_VERSION',
        `${flowName} ${version} has not been published. Publish it before promoting it.`
      );
    }

    const current = await this.store.getEnvironment(tenantId, flowName, environment);
    if (current?.activeVersion === version) {
      throw new RegistryError(
        'ALREADY_ACTIVE',
        `${flowName} ${version} is already active in ${environment}.`
      );
    }

    const next: EnvironmentState = {
      environment,
      activeVersion: version,
      // Promotion does not disturb a shadow. The two answer different
      // questions — what is running, and what is being evidenced — and
      // clearing the shadow on every promote would end a comparison halfway
      // through without anyone asking for it.
      shadowVersion: current?.shadowVersion ?? null,
      // What rollback returns to. Only the immediately previous version: a
      // deeper history invites rolling back to something nobody remembers.
      previousVersion: current?.activeVersion ?? null,
      promotedAt: occurredAt,
      promotedBy: actor,
    };
    await this.store.putEnvironment(tenantId, flowName, next);

    await this.store.appendEvent({
      at: occurredAt,
      actor,
      type: 'VersionPromoted',
      tenantId,
      flowName,
      version,
      environment,
      summary:
        current?.activeVersion
          ? `Promoted ${flowName} ${version} to ${environment}, replacing ${current.activeVersion}.`
          : `Promoted ${flowName} ${version} to ${environment}.`,
    });

    return next;
  }

  /**
   * Run a version beside the active one, deciding nothing.
   *
   * Refuses to shadow the version already active: comparing a thing with
   * itself produces a 100% agreement rate that means nothing, and publishing
   * that number would be worse than having none.
   */
  async startShadow(
    tenantId: string,
    flowName: string,
    version: string,
    environment: Environment,
    actor: string,
    occurredAt: string
  ): Promise<EnvironmentState> {
    const target = await this.store.getVersion(tenantId, flowName, version);
    if (!target) {
      throw new RegistryError(
        'UNKNOWN_VERSION',
        `${flowName} ${version} has not been published. Publish it before shadowing it.`
      );
    }

    const current = await this.store.getEnvironment(tenantId, flowName, environment);
    if (!current?.activeVersion) {
      throw new RegistryError(
        'UNKNOWN_VERSION',
        `${flowName} has nothing active in ${environment}, so there is nothing to shadow against.`
      );
    }
    if (current.activeVersion === version) {
      throw new RegistryError(
        'ALREADY_ACTIVE',
        `${flowName} ${version} is already active in ${environment}. ` +
          'Shadowing a version against itself measures nothing.'
      );
    }

    const next: EnvironmentState = { ...current, shadowVersion: version };
    await this.store.putEnvironment(tenantId, flowName, next);

    await this.store.appendEvent({
      at: occurredAt,
      actor,
      type: 'ShadowStarted',
      tenantId,
      flowName,
      version,
      environment,
      summary: `${flowName} ${version} is now shadowing ${current.activeVersion} in ${environment}.`,
    });

    return next;
  }

  /** Stop shadowing. The active version is untouched. */
  async stopShadow(
    tenantId: string,
    flowName: string,
    environment: Environment,
    actor: string,
    occurredAt: string
  ): Promise<EnvironmentState> {
    const current = await this.store.getEnvironment(tenantId, flowName, environment);
    if (!current?.shadowVersion) {
      throw new RegistryError(
        'NOTHING_TO_ROLL_BACK',
        `${flowName} has no shadow running in ${environment}.`
      );
    }

    const stopped = current.shadowVersion;
    const next: EnvironmentState = { ...current, shadowVersion: null };
    await this.store.putEnvironment(tenantId, flowName, next);

    await this.store.appendEvent({
      at: occurredAt,
      actor,
      type: 'ShadowStopped',
      tenantId,
      flowName,
      version: stopped,
      environment,
      summary: `${flowName} ${stopped} stopped shadowing in ${environment}.`,
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
    flowName: string,
    environment: Environment,
    actor: string,
    occurredAt: string
  ): Promise<EnvironmentState> {
    const current = await this.store.getEnvironment(tenantId, flowName, environment);
    if (!current || !current.activeVersion) {
      throw new RegistryError(
        'UNKNOWN_FLOW',
        `${flowName} is not active in ${environment}; there is nothing to roll back.`
      );
    }
    if (!current.previousVersion) {
      throw new RegistryError(
        'NOTHING_TO_ROLL_BACK',
        `${flowName} ${current.activeVersion} is the first version promoted to ${environment}. There is no earlier version to return to.`
      );
    }

    const next: EnvironmentState = {
      environment,
      activeVersion: current.previousVersion,
      // A rollback leaves the shadow alone too: whatever was being evidenced
      // is still worth evidencing against whatever is now running.
      shadowVersion: current.shadowVersion ?? null,
      previousVersion: current.activeVersion,
      promotedAt: occurredAt,
      promotedBy: actor,
    };
    await this.store.putEnvironment(tenantId, flowName, next);

    await this.store.appendEvent({
      at: occurredAt,
      actor,
      type: 'VersionRolledBack',
      tenantId,
      flowName,
      version: current.previousVersion,
      environment,
      summary: `Rolled ${environment} back from ${current.activeVersion} to ${current.previousVersion}.`,
    });

    return next;
  }

  // --- Reading --------------------------------------------------------------

  /** The artifact an environment is currently running, or null. */
  async active(tenantId: string, flowName: string, environment: Environment) {
    const state = await this.store.getEnvironment(tenantId, flowName, environment);
    if (!state?.activeVersion) return null;
    return (await this.store.getVersion(tenantId, flowName, state.activeVersion)) ?? null;
  }

  async version(tenantId: string, flowName: string, version: string) {
    return (await this.store.getVersion(tenantId, flowName, version)) ?? null;
  }

  /** Newest first, by publish time then version, so the list is stable. */
  async versions(tenantId: string, flowName: string): Promise<PublishedVersion[]> {
    const all = await this.store.listVersions(tenantId, flowName);
    return [...all].sort(
      (a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.version.localeCompare(a.version)
    );
  }

  /** One environment, for callers that know which one they mean. */
  environment(
    tenantId: string,
    flowName: string,
    environment: Environment
  ): Promise<EnvironmentState | undefined> {
    return this.store.getEnvironment(tenantId, flowName, environment);
  }

  async environments(tenantId: string, flowName: string): Promise<EnvironmentState[]> {
    const all = await this.store.listEnvironments(tenantId, flowName);
    return [...all].sort((a, b) => a.environment.localeCompare(b.environment));
  }

  async flows(tenantId: string): Promise<string[]> {
    return [...(await this.store.listFlows(tenantId))].sort();
  }

  // --- Models ----------------------------------------------------------------

  /**
   * Publish a model version. ADR-009 §4.
   *
   * The rules a flow version follows, with the compiler's place taken by
   * `modelProblems`: a declaration with a problem stores nothing, identical
   * content under a published version is a no-op, and different content under
   * one is refused. Publishing is not activating here either — a version becomes
   * something a flow can pin, and changes no decision until a flow pinning it is
   * published and promoted.
   *
   * Recorded on the version itself (who, when) and in the caller's audit log,
   * not in the registry's event log: that log is keyed by flow, and a model is
   * not one.
   */
  async publishModel(
    tenantId: string,
    declaration: ModelDeclaration,
    actor: string,
    occurredAt: string
  ): Promise<ModelPublishOutcome> {
    const problems = modelProblems(declaration);
    if (problems.length > 0) return { status: 'rejected', reason: 'invalid', problems };

    const attemptedHash = modelContentHash(declaration);
    const existing = await this.store.getModelVersion(tenantId, declaration.id, declaration.version);
    if (existing) {
      const existingHash = modelContentHash(existing);
      // Idempotent, as a flow's is: a retried publish is not a second publish.
      if (existingHash === attemptedHash) return { status: 'unchanged', model: existing };
      return {
        status: 'rejected',
        reason: 'immutable',
        existingHash,
        attemptedHash,
        problems: [
          {
            field: 'version',
            message:
              `${declaration.id} ${declaration.version} is already published and declares something else. ` +
              'A pinned version has to mean one thing, so publish the change as a new version.',
          },
        ],
      };
    }

    await this.store.putModelVersion(modelVersionOf(declaration, tenantId, actor, occurredAt));
    // Read back, for the reason `publish` gives: what is handed out is what was stored.
    const stored = (await this.store.getModelVersion(tenantId, declaration.id, declaration.version))!;
    return { status: 'published', model: stored };
  }

  /** Every version of every model, by model id and then newest version first. */
  async models(tenantId: string): Promise<ModelVersion[]> {
    const all = await this.store.listModelVersions(tenantId);
    return [...all].sort((a, b) => a.id.localeCompare(b.id) || compareVersions(b.version, a.version));
  }

  async modelVersion(tenantId: string, modelId: string, version: string): Promise<ModelVersion | null> {
    return (await this.store.getModelVersion(tenantId, modelId, version)) ?? null;
  }

  // --- Drafts ----------------------------------------------------------------

  /**
   * Save the flow a person is editing.
   *
   * Publishes nothing and records no registry event. A draft is work in
   * progress; the log is about what was shipped, promoted or refused, and a
   * log that filled with every save would bury the one publish that mattered.
   * Whoever saves a draft records that in its own audit, as the console does.
   */
  async saveDraft<T>(
    tenantId: string,
    flowName: string,
    draft: T,
    actor: string,
    occurredAt: string
  ): Promise<FlowDraft<T>> {
    const saved: FlowDraft<T> = { tenantId, flowName, draft, updatedAt: occurredAt, updatedBy: actor };
    await this.store.putDraft(saved);
    return saved;
  }

  async draft<T = unknown>(tenantId: string, flowName: string): Promise<FlowDraft<T> | undefined> {
    return (await this.store.getDraft(tenantId, flowName)) as FlowDraft<T> | undefined;
  }

  /** In flow-name order, so two reads of unchanged drafts are identical. */
  async drafts<T = unknown>(tenantId: string): Promise<FlowDraft<T>[]> {
    const all = (await this.store.listDrafts(tenantId)) as FlowDraft<T>[];
    return [...all].sort((a, b) => a.flowName.localeCompare(b.flowName));
  }

  // --- Shadow comparisons ----------------------------------------------------

  /**
   * Record one shadow run and how it compared with the active version.
   *
   * Both versions must be published: evidence about a version that does not
   * exist is evidence about nothing, and PostgreSQL refuses it by foreign key,
   * so memory refuses it here rather than accepting what a database would not.
   */
  async recordShadowComparison<T>(record: ShadowComparisonRecord<T>): Promise<void> {
    for (const version of [record.activeVersion, record.shadowVersion]) {
      if (!(await this.store.getVersion(record.tenantId, record.flowName, version))) {
        throw new RegistryError(
          'UNKNOWN_VERSION',
          `Cannot record a shadow comparison for ${record.flowName} ${version}: that version was never published.`
        );
      }
    }
    await this.store.appendShadowComparison(record);
  }

  /** Oldest first. Pass the pair to get only the comparisons about it. */
  async shadowComparisons<T = unknown>(
    tenantId: string,
    flowName: string,
    pair?: { environment: Environment; activeVersion: string; shadowVersion: string }
  ): Promise<ShadowComparisonRecord<T>[]> {
    return (await this.store.listShadowComparisons({ tenantId, flowName, ...pair })) as ShadowComparisonRecord<T>[];
  }

  /** Newest first. */
  events(filter?: {
    tenantId?: string;
    flowName?: string;
    limit?: number;
  }): Promise<RegistryEvent[]> {
    return this.store.listEvents(filter);
  }

  /** Warnings a version published with, for a surface that has to explain it. */
  async warningsFor(
    tenantId: string,
    flowName: string,
    version: string
  ): Promise<Diagnostic[]> {
    return (await this.store.getVersion(tenantId, flowName, version))?.warnings ?? [];
  }
}
