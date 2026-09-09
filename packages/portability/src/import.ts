import type { RegistryStore } from '@metis/registry';
import type { DecisionLedger } from '@metis/ledger';
import type { Catalogue, CatalogueStore } from '@metis/catalogue';
import { verifyBundle } from './verify';
import { PortabilityError, type TenantBundle } from './types';

/**
 * Restore a bundle into an empty instance.
 *
 * A restore, not a re-authoring. Versions are written at the store level
 * rather than through `registry.publish()`, and the distinction is the whole
 * point of the exercise: publishing recompiles, and a compiler that has moved
 * on by one patch release would produce a different artifact hash. The
 * customer's evidence that a decision was made by version 2.4.0 is the hash,
 * so an import that regenerated it would destroy exactly what it was meant to
 * preserve.
 *
 * The ledger goes through its facade, because there the rules are the ones we
 * want: it refuses to overwrite a decision id with different content, which on
 * an import means the target was not as empty as claimed.
 */

export interface ImportTargets {
  registryStore: RegistryStore;
  ledger: DecisionLedger;
  catalogue: Catalogue;
  /**
   * Written through the store, not the facade, for the same reason registry
   * versions are: `Catalogue` enforces authoring rules — an offer needs its
   * category to exist *first* — and a restore has to land rows in whatever
   * order the bundle holds them, not re-run the authoring conversation.
   */
  catalogueStore: CatalogueStore;
}

export interface ImportSummary {
  tenantId: string;
  counts: Record<string, number>;
}

/**
 * Refuse a target that already holds the tenant.
 *
 * Merging would be the friendlier behaviour and the wrong one: two bundles
 * partially overlaid leave a tenant that looks whole and replays wrong, which
 * nothing downstream would detect.
 */
async function assertEmpty(bundle: TenantBundle, targets: ImportTargets): Promise<void> {
  const { tenantId } = bundle.manifest;
  const flows = await targets.registryStore.listFlows(tenantId);
  const decisions = await targets.ledger.query({ tenantId, limit: 1 });
  const catalogue = await targets.catalogue.read(tenantId);
  const hasCatalogue = catalogue.offers.length > 0 || catalogue.objectives.length > 0;

  if (flows.length > 0 || decisions.length > 0 || hasCatalogue) {
    throw new PortabilityError(
      'TARGET_NOT_EMPTY',
      `Tenant ${tenantId} already exists in the target: ${flows.length} flow(s) ` +
        `and ${decisions.length > 0 ? 'at least one decision' : 'no decisions'}. ` +
        'Import restores a tenant into an empty instance; merging two bundles ' +
        'would leave something that looks whole and replays wrong.'
    );
  }
}

export async function importTenant(
  bundle: TenantBundle,
  targets: ImportTargets
): Promise<ImportSummary> {
  const problems = verifyBundle(bundle);
  if (problems.length > 0) {
    throw new PortabilityError(
      'UNREADABLE_BUNDLE',
      `This bundle cannot be imported: ${problems.length} problem(s). ` +
        problems.map((p) => p.message).join(' '),
      problems
    );
  }

  await assertEmpty(bundle, targets);

  const tenantId = bundle.manifest.tenantId;

  // Taxonomy before what hangs off it. The order is the schema's foreign keys
  // read out loud, and getting it wrong is a restore that fails halfway.
  for (const o of bundle.catalogue_objectives) await targets.catalogueStore.putObjective(tenantId, o);
  for (const c of bundle.catalogue_categories) await targets.catalogueStore.putCategory(tenantId, c);
  for (const o of bundle.catalogue_offers) await targets.catalogueStore.putOffer(tenantId, o);
  for (const c of bundle.catalogue_creatives) await targets.catalogueStore.putCreative(tenantId, c);
  for (const p of bundle.catalogue_targeting_policies)
    await targets.catalogueStore.putTargetingPolicy(tenantId, p);
  for (const p of bundle.catalogue_frequency_policies)
    await targets.catalogueStore.putFrequencyPolicy(tenantId, p);
  for (const b of bundle.catalogue_boosts) await targets.catalogueStore.putBoost(tenantId, b);
  for (const a of bundle.catalogue_arbitration)
    await targets.catalogueStore.putArbitration(tenantId, a);

  for (const event of [...bundle.catalogue_events].sort((a, b) => a.seq - b.seq)) {
    const { seq: _catSeq, ...rest } = event;
    await targets.catalogueStore.appendEvent(rest);
  }

  for (const version of bundle.registry_versions) {
    await targets.registryStore.putVersion(version);
  }

  for (const { flowName, state } of bundle.registry_environments) {
    await targets.registryStore.putEnvironment(bundle.manifest.tenantId, flowName, state);
  }

  // Ascending, so the target's own sequence lands in the same order. `seq` is
  // a property of the log an event lives in rather than of the event, which is
  // why the export renumbers it — see `export.ts`.
  for (const event of [...bundle.registry_events].sort((a, b) => a.seq - b.seq)) {
    const { seq: _seq, ...rest } = event;
    await targets.registryStore.appendEvent(rest);
  }

  for (const entry of bundle.decision_records) {
    await targets.ledger.record(entry);
  }

  for (const outcome of bundle.outcome_events) {
    await targets.ledger.recordOutcome(outcome);
  }

  return {
    tenantId: bundle.manifest.tenantId,
    counts: {
      catalogue_offers: bundle.catalogue_offers.length,
      catalogue_creatives: bundle.catalogue_creatives.length,
      catalogue_events: bundle.catalogue_events.length,
      registry_versions: bundle.registry_versions.length,
      registry_environments: bundle.registry_environments.length,
      registry_events: bundle.registry_events.length,
      decision_records: bundle.decision_records.length,
      outcome_events: bundle.outcome_events.length,
    },
  };
}
