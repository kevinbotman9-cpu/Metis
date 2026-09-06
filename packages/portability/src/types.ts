import type { PublishedVersion, EnvironmentState, RegistryEvent } from '@metis/registry';
import type { LedgerEntry, OutcomeEvent } from '@metis/ledger';
import type { EntityName } from './entities';

/**
 * The bundle format.
 *
 * Versioned from the first release, and checked on import. An export written
 * by a newer METIS than the one importing it must fail loudly rather than
 * import the parts it recognises: a half-imported tenant is a worse outcome
 * than a refused one, because the refusal is visible and the half is not.
 */
export const FORMAT_VERSION = '1.0.0';

export interface BundleFile {
  entity: EntityName;
  count: number;
  /** ADR-003 hash over the rows, so it means the same thing as a chain hash. */
  sha256: string;
}

export interface BundleManifest {
  formatVersion: string;
  tenantId: string;
  /** From the caller, never the clock — the same rule the engine follows, so a
   * bundle exported twice from unchanged data is byte-identical. */
  exportedAt: string;
  /** What produced it, so a bundle can be read years later. */
  producer: { name: string; version: string };
  files: BundleFile[];
  /**
   * ADR-003 hash over the file list.
   *
   * One number that changes if any row in any file changes, which is what
   * makes "this is the bundle I was given" checkable.
   */
  bundleHash: string;
  /** Entity types deliberately not exported, and why. Carried in the bundle so
   * the omission is visible to whoever receives it, not only to us. */
  excluded: { entity: string; reason: string }[];
}

/**
 * An environment paired with the flow it belongs to.
 *
 * `EnvironmentState` carries `environment`, `activeVersion` and
 * `shadowVersion` but not the flow name — inside the registry it is always
 * reached through one, so it never needed to. Flattened into a bundle it would
 * lose that context entirely, and "production is running 2.4.0" of *what*
 * is not an answer.
 */
export interface BundledEnvironment {
  flowName: string;
  state: EnvironmentState;
}

export interface TenantBundle {
  manifest: BundleManifest;
  registry_versions: PublishedVersion[];
  registry_environments: BundledEnvironment[];
  registry_events: RegistryEvent[];
  decision_records: LedgerEntry[];
  outcome_events: OutcomeEvent[];
}

/** Anything wrong with a bundle, stated so it can be acted on. */
export interface BundleProblem {
  kind:
    | 'format-version'
    | 'missing-entity'
    | 'unknown-entity'
    | 'file-hash'
    | 'bundle-hash'
    | 'count';
  message: string;
}

export class PortabilityError extends Error {
  constructor(
    readonly code: 'UNREADABLE_BUNDLE' | 'TARGET_NOT_EMPTY' | 'IMPORT_FAILED',
    message: string,
    readonly problems: BundleProblem[] = []
  ) {
    super(message);
    this.name = 'PortabilityError';
  }
}
