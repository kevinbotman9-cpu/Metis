import { readFileSync } from 'node:fs';
import path from 'node:path';
import { InMemoryCatalogueStore } from '@metis/catalogue';
import { ArtifactRegistry, InMemoryRegistryStore } from '@metis/registry';
import { hash } from '@metis/runtime/deterministic/canonical';

/**
 * The console's flows and catalogue, loaded into in-memory stores the way the
 * registry and catalogue hold them.
 *
 * In-memory rather than Postgres here because these tests are about the
 * service; the stores' own suites run both implementations of the same
 * interfaces. The data is `docs/conformance/service-bundle.json`, generated
 * from the console fixtures, so the service decides from the product's
 * catalogue rather than one written to make it look right.
 */

export const BUNDLE_PATH = path.resolve(__dirname, '../../../docs/conformance/service-bundle.json');
export const CASES_PATH = path.resolve(__dirname, '../../../docs/conformance/service-cases.json');

export interface ServiceCase {
  artifactId: string;
  request: Record<string, unknown>;
  expected: {
    id: string;
    chainHash: string;
    inputSnapshotHash: string;
    catalogueSnapshotHash: string;
    winner: string | null;
    requestHash: string;
  };
}

interface Bundle {
  artifacts: { id: string; version: string; tenantId: string }[];
  catalogue: {
    offers: unknown[];
    targetingPolicies: unknown[];
    frequencyPolicies: unknown[];
    boosts: unknown[];
    connectors?: unknown[];
    arbitration: unknown;
  };
  objectives?: unknown[];
  categories?: unknown[];
  placements?: unknown[];
  profileSchema?: unknown;
  experiments?: unknown[];
}

export const readBundle = (): Bundle => JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));
export const readCases = (): ServiceCase[] => JSON.parse(readFileSync(CASES_PATH, 'utf8')).cases;

const PUBLISHED_AT = '2026-08-01T09:00:00.000Z';

export async function seedFromBundle(bundle: Bundle = readBundle()) {
  const catalogueStore = new InMemoryCatalogueStore();
  const registryStore = new InMemoryRegistryStore();
  const tenantId = bundle.artifacts[0].tenantId;
  const c = bundle.catalogue;

  // The store's own writes, not `Catalogue`'s authoring rules: this is loading
  // a catalogue that already exists, not authoring one. Parents first, in the
  // order the Postgres store's foreign keys require, so this seed cannot pass in
  // memory and fail against the database the image uses.
  for (const o of bundle.objectives ?? []) await catalogueStore.putObjective(tenantId, o as never);
  for (const g of bundle.categories ?? []) await catalogueStore.putCategory(tenantId, g as never);
  for (const o of c.offers) await catalogueStore.putOffer(tenantId, o as never);
  for (const p of c.targetingPolicies) await catalogueStore.putTargetingPolicy(tenantId, p as never);
  for (const f of c.frequencyPolicies) await catalogueStore.putFrequencyPolicy(tenantId, f as never);
  for (const b of c.boosts) await catalogueStore.putBoost(tenantId, b as never);
  for (const k of c.connectors ?? []) await catalogueStore.putConnector(tenantId, k as never);
  await catalogueStore.putArbitration(tenantId, c.arbitration as never);
  for (const p of bundle.placements ?? []) await catalogueStore.putPlacement(tenantId, p as never);
  if (bundle.profileSchema) await catalogueStore.putProfileSchema(tenantId, bundle.profileSchema as never);
  for (const e of bundle.experiments ?? []) await catalogueStore.putExperiment(tenantId, e as never);

  // Published and promoted as the registry records them: each compiled artifact
  // as a version, and production pointed at it.
  for (const a of bundle.artifacts) {
    await registryStore.putVersion({
      tenantId,
      flowName: a.id,
      version: a.version,
      // As `scripts/seed-from-bundle.ts` does: the Postgres registry requires
      // `artifactHash`, and the in-memory one should not accept what Postgres
      // refuses. The canonical hash of what is stored.
      artifact: { ...a, artifactHash: hash(a) } as never,
      publishedAt: PUBLISHED_AT,
      publishedBy: 'fixture',
      warnings: [],
      tests: [],
    });
    await registryStore.putEnvironment(tenantId, a.id, {
      environment: 'production',
      activeVersion: a.version,
      previousVersion: null,
      shadowVersion: null,
      promotedAt: PUBLISHED_AT,
      promotedBy: 'fixture',
    });
  }

  return { catalogueStore, registry: new ArtifactRegistry(registryStore), tenantId };
}
