import { hash } from '@metis/runtime/deterministic/canonical';
import type { ArtifactRegistry } from '@metis/registry';
import type { DecisionLedger } from '@metis/ledger';
import type { Catalogue } from '@metis/catalogue';
import { ENTITIES, EXPORTED_ENTITIES } from './entities';
import { FORMAT_VERSION, type BundleFile, type TenantBundle } from './types';

/**
 * Everything a tenant owns, in one bundle.
 *
 * Read through the same public interfaces the console uses, not through SQL:
 * an export that reached past the stores would drift the first time a rule
 * moved into one, and would behave differently against memory and Postgres.
 */

export interface ExportSources {
  registry: ArtifactRegistry;
  ledger: DecisionLedger;
  catalogue: Catalogue;
}

export interface ExportOptions {
  tenantId: string;
  /**
   * Supplied, not read from the clock, so an unchanged tenant exports
   * byte-identically twice. The round-trip assertion depends on that.
   */
  exportedAt: string;
  producer?: { name: string; version: string };
}

/**
 * Rows in a stable order.
 *
 * Two exports of the same data must be byte-identical, or the round-trip test
 * is checking the sort as much as the content — and a store that happens to
 * return rows in insertion order would hide one that does not.
 */
function stable<T>(rows: T[], key: (row: T) => string): T[] {
  return [...rows].sort((a, b) => key(a).localeCompare(key(b)));
}

export async function exportTenant(
  sources: ExportSources,
  options: ExportOptions
): Promise<TenantBundle> {
  const { tenantId } = options;
  const { registry, ledger, catalogue } = sources;

  const flows = await registry.flows(tenantId);

  const versions = stable(
    (await Promise.all(flows.map((f) => registry.versions(tenantId, f)))).flat(),
    (v) => [v.flowName, v.version].join('/')
  );

  // Paired with the flow. An `EnvironmentState` does not carry one, because
  // inside the registry it is always reached through a flow; flattened into a
  // bundle without it, "production is running 2.4.0" names no subject.
  const environments = stable(
    (
      await Promise.all(
        flows.map(async (flowName) =>
          (await registry.environments(tenantId, flowName)).map((state) => ({ flowName, state }))
        )
      )
    ).flat(),
    (e) => [e.flowName, e.state.environment].join('/')
  );

  // Ascending and renumbered from 1.
  //
  // `seq` is a property of the log an event lives in, not of the event: a
  // registry holding three tenants gives one of them the sequence 2, 5, 9, and
  // re-importing those into an empty instance produces 1, 2, 3. The *order* is
  // the fact worth carrying, so the export normalises the numbers to it and a
  // round trip is then exact. Nothing uses seq as a key — it is an ordering
  // and a cursor.
  const events = (await registry.events({ tenantId }))
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((event, i) => ({ ...event, seq: i + 1 }));

  const records = stable(await ledger.query({ tenantId }), (r) => r.decisionId);

  const outcomes = (
    await Promise.all(records.map((r) => ledger.outcomesFor(tenantId, r.decisionId)))
  ).flat();

  // ADR-013. Carried for the same reason the outcomes are: without it a
  // decision whose delivery was suppressed reads as offered-and-unmeasured,
  // which is indistinguishable from a channel that did not report back.
  const deliveries = (
    await Promise.all(records.map((r) => ledger.deliveriesFor(tenantId, r.decisionId)))
  ).flat();

  // Read as one snapshot, because that is how the engine consumes it: a
  // decision records the hash of the catalogue it saw, so assembling a bundle
  // from several reads could describe a moment that never existed.
  const cat = await catalogue.read(tenantId);
  const catEvents = (await catalogue.events({ tenantId }))
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((event, i) => ({ ...event, seq: i + 1 }));

  const data = {
    catalogue_objectives: cat.objectives,
    catalogue_categories: cat.categories,
    catalogue_offers: cat.offers,
    catalogue_creatives: cat.creatives,
    catalogue_targeting_policies: cat.targetingPolicies,
    catalogue_frequency_policies: cat.frequencyPolicies,
    catalogue_boosts: cat.boosts,
    catalogue_arbitration: cat.arbitration ? [cat.arbitration] : [],
    catalogue_events: catEvents,
    registry_versions: versions,
    registry_environments: environments,
    registry_events: events,
    decision_records: records,
    outcome_events: outcomes,
    delivery_attempts: deliveries,
  };

  // ADR-003, so a bundle hash means the same thing as a chain hash: the same
  // canonical form and the same digest, checkable by anyone holding the spec.
  const files: BundleFile[] = EXPORTED_ENTITIES.map((entity) => ({
    entity,
    count: data[entity].length,
    sha256: hash(data[entity]),
  }));

  return {
    manifest: {
      formatVersion: FORMAT_VERSION,
      tenantId,
      exportedAt: options.exportedAt,
      producer: options.producer ?? { name: '@metis/portability', version: FORMAT_VERSION },
      files,
      bundleHash: hash(files),
      excluded: ENTITIES.filter((e) => !e.included).map((e) => ({
        entity: e.table,
        reason: e.reason ?? 'No reason recorded, which is itself a problem.',
      })),
    },
    ...data,
  };
}
