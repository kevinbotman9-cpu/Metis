import type { CatalogueSnapshotRecord } from '@metis/catalogue';
import type { CatalogueSnapshot } from '@metis/runtime/deterministic/types';

/**
 * The part of a tenant's catalogue a decision is made from.
 *
 * The console builds the same object in its mock layer
 * (`apps/console/mocks/catalogue-state.ts`, `snapshotFrom`), which this service
 * may not import (ADR-016 §1). Same fields, same order, so the hash a decision
 * carries is the hash the console would stamp for the same record.
 *
 * A tenant with no ranking function cannot decide anything, and the service
 * refuses to load it rather than decide against a default: ADR-016 §5.3 — it
 * never serves a decision from nothing.
 */
export function snapshotFor(tenantId: string, record: CatalogueSnapshotRecord): CatalogueSnapshot {
  if (!record.arbitration) {
    throw new TenantNotDecidable(
      tenantId,
      'has no ranking function in its catalogue, so no decision can be made'
    );
  }
  // Cloned: the record belongs to whoever read it, and a snapshot that could be
  // edited afterwards would rewrite the history of every decision made from it.
  return structuredClone({
    offers: record.offers,
    targetingPolicies: record.targetingPolicies,
    frequencyPolicies: record.frequencyPolicies,
    arbitration: record.arbitration,
    boosts: record.boosts,
    connectors: record.connectors,
  });
}

export class TenantNotDecidable extends Error {
  constructor(
    readonly tenantId: string,
    readonly reason: string
  ) {
    super(`Tenant '${tenantId}' ${reason}.`);
    this.name = 'TenantNotDecidable';
  }
}
