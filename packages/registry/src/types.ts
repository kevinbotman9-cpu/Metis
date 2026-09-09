/**
 * The artifact registry's vocabulary.
 *
 * Three ideas do the work here, and the old stub in `planes/execution` had none
 * of them:
 *
 *   1. **Publishing compiles.** A flow that does not compile never enters
 *      the registry. The console has shown the compiler's verdict for a while;
 *      nothing acted on it, so a flow with an error could be promoted to
 *      production and fail at execution instead of at publish.
 *
 *   2. **Publishing is not activating.** A published version sits in the
 *      registry until somebody promotes it to an environment. Conflating the
 *      two is what makes "publish" a frightening button and rollback a
 *      restore-from-backup exercise.
 *
 *   3. **Versions are immutable.** A version is bound to an artifact hash. The
 *      same content republished is a no-op; different content under the same
 *      version is refused. Without that, "the decision was made by v2.1.0" is
 *      not a fact about anything.
 */

import type { Diagnostic, CompiledDecisionFlow, DecisionFlowSource } from '@metis/compiler/decision-flow';

/**
 * A deployment target. Free-form because tenants differ — some run
 * development/staging/production, some add a canary — and hard-coding three
 * would only push the fourth into a comment.
 */
export type Environment = string;

export interface PublishCommand {
  tenantId: string;
  /** Stable identity across versions, e.g. `inbound-web-offers`. */
  flowName: string;
  /** Caller-supplied. The registry checks it is not already taken by different content. */
  version: string;
  source: DecisionFlowSource;
  actor: string;
  /** An input, never the clock — the same rule the engine follows. */
  occurredAt: string;
}

export type PublishOutcome =
  /** Compiled, stored, and now available to promote. */
  | { status: 'published'; artifact: CompiledDecisionFlow; diagnostics: Diagnostic[] }
  /** Byte-identical content already published under this version. Nothing changed. */
  | { status: 'unchanged'; artifact: CompiledDecisionFlow; diagnostics: Diagnostic[] }
  /** Compilation failed. Nothing was stored. */
  | { status: 'rejected'; reason: 'compilation'; diagnostics: Diagnostic[] }
  /**
   * The flow compiled and then failed its own tests.
   *
   * Separate from a compilation refusal because it means something different:
   * the graph is sound and the behaviour is not what its author said it is.
   */
  | { status: 'rejected'; reason: 'tests'; diagnostics: Diagnostic[]; tests: FlowTestResult[] }
  /** The version exists and holds different content. */
  | {
      status: 'rejected';
      reason: 'immutable';
      diagnostics: Diagnostic[];
      existingHash: string;
      attemptedHash: string;
    };

/** Mirrors `@metis/runtime`'s shape. Repeated rather than imported: the
 * registry deliberately does not depend on the engine. */
export interface FlowTestResult {
  name: string;
  passed: boolean;
  failures: string[];
}

/**
 * Runs a version's attached cases. Supplied by the caller, because the caller
 * is what already has both the engine and a catalogue.
 */
export interface FlowTestRunner {
  run(artifact: unknown, tests: unknown[]): Promise<FlowTestResult[]>;
}

export interface PublishedVersion {
  tenantId: string;
  flowName: string;
  version: string;
  artifact: CompiledDecisionFlow;
  publishedAt: string;
  publishedBy: string;
  /**
   * Warnings the compiler raised.
   *
   * Kept with the version rather than discarded on success. A flow that
   * published with LATENCY_NEAR_BUDGET is a different thing to explain in six
   * months than one that published clean.
   */
  warnings: Diagnostic[];
  /**
   * How the version's own cases fared at publish.
   *
   * Stored with the version rather than folded into the artifact hash: a test
   * does not change how a flow decides, and treating one as new content would
   * force a version bump for no behavioural change. Empty when the version
   * attaches none.
   */
  tests: FlowTestResult[];
}

export interface EnvironmentState {
  environment: Environment;
  /** Null before anything has been promoted here. */
  activeVersion: string | null;
  /** What rollback returns to. Null when there is nothing to go back to. */
  previousVersion: string | null;
  /**
   * A version running beside the active one, deciding nothing.
   *
   * Shadow output never reaches a customer: the active version's answer is the
   * one returned, always. What the shadow produces is compared against it and
   * recorded, which is how a migration is evidenced rather than asserted —
   * §12's factory needs "shadow production decisions, candidate/rank/reason
   * comparison" before anyone is asked to trust a cutover.
   *
   * Null when nothing is shadowing, which is the normal state.
   */
  shadowVersion: string | null;
  promotedAt: string | null;
  promotedBy: string | null;
}

export type RegistryEventType =
  | 'ArtifactPublished'
  | 'PublishRejected'
  | 'VersionPromoted'
  | 'VersionRolledBack'
  | 'ShadowStarted'
  | 'ShadowStopped';

/**
 * One entry in the append-only log.
 *
 * Rejections are recorded too. An audit that only shows what succeeded cannot
 * answer "did anyone try to ship this?", which is exactly the question asked
 * after an incident.
 */
export interface RegistryEvent {
  /** Monotonic per registry, so the order is a fact rather than a sort key. */
  seq: number;
  at: string;
  actor: string;
  type: RegistryEventType;
  tenantId: string;
  flowName: string;
  version: string;
  environment?: Environment;
  summary: string;
  /** Present on PublishRejected. */
  diagnostics?: Diagnostic[];
}

export class RegistryError extends Error {
  constructor(
    readonly code:
      | 'UNKNOWN_FLOW'
      | 'UNKNOWN_VERSION'
      | 'NOTHING_TO_ROLL_BACK'
      | 'ALREADY_ACTIVE',
    message: string
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}
