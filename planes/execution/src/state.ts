import { Catalogue, type CatalogueSnapshotRecord } from '@metis/catalogue';
import type { CatalogueStore } from '@metis/catalogue';
import type { ArtifactRegistry, Environment } from '@metis/registry';
import { hash } from '@metis/runtime/deterministic/canonical';
import type { CatalogueSnapshot, ExecArtifact } from '@metis/runtime/deterministic/types';
import { snapshotFor, TenantNotDecidable } from './snapshot';

/** Everything the service decides from for one tenant, held in memory. ADR-016 §1. */
export interface LoadedTenant {
  tenantId: string;
  record: CatalogueSnapshotRecord;
  snapshot: CatalogueSnapshot;
  catalogueSnapshotHash: string;
  /** The artifact active in the service's environment, by flow id. */
  artifacts: Map<string, ExecArtifact>;
}

export interface LoadResult {
  tenants: Map<string, LoadedTenant>;
  /** Tenants found and not loaded, each with the reason, for `/health`. */
  refused: { tenantId: string; reason: string }[];
}

/**
 * Load every tenant the catalogue store holds, once.
 *
 * ADR-016 §1: the service holds the active artifact and its catalogue snapshot
 * in memory, loaded at start, and never reads the registry per request. A flow
 * with nothing promoted to this environment is simply not served; a tenant
 * whose catalogue cannot decide is refused, named, and not served either.
 */
export async function loadTenants(options: {
  catalogueStore: CatalogueStore;
  registry: ArtifactRegistry;
  environment: Environment;
}): Promise<LoadResult> {
  const catalogue = new Catalogue(options.catalogueStore);
  const tenants = new Map<string, LoadedTenant>();
  const refused: LoadResult['refused'] = [];

  for (const tenantId of [...(await options.catalogueStore.listTenants())].sort()) {
    const record = await catalogue.read(tenantId);
    let snapshot: CatalogueSnapshot;
    try {
      snapshot = snapshotFor(tenantId, record);
    } catch (e) {
      if (e instanceof TenantNotDecidable) {
        refused.push({ tenantId, reason: e.reason });
        continue;
      }
      throw e;
    }

    const artifacts = new Map<string, ExecArtifact>();
    for (const flow of await options.registry.flows(tenantId)) {
      const active = await options.registry.active(tenantId, flow, options.environment);
      // A published artifact is a compiled flow: the fields the engine reads
      // plus the compiler's own, which the engine ignores — the console's
      // route returns `published.artifact` as an ExecArtifact for the same
      // reason.
      if (active) artifacts.set(flow, active.artifact as unknown as ExecArtifact);
    }

    tenants.set(tenantId, {
      tenantId,
      record,
      snapshot,
      catalogueSnapshotHash: hash(snapshot),
      artifacts,
    });
  }

  return { tenants, refused };
}
