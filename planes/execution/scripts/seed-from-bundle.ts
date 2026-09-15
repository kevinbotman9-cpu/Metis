/**
 * Load `docs/conformance/service-bundle.json` into the stores `METIS_DATABASE_URL`
 * names, so a built image of the decision service has a catalogue and active
 * flows to serve.
 *
 *   METIS_DATABASE_URL=postgres://… node --import tsx planes/execution/scripts/seed-from-bundle.ts
 *
 * Test tooling for the image job, not part of the service: the service never
 * writes a catalogue or promotes a flow. It refuses a database that already
 * holds the tenant, because seeding over real state is how a test harness
 * becomes a way to overwrite production.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalogueStore } from '@metis/catalogue';
import { createRegistryStore } from '@metis/registry';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const bundle = JSON.parse(readFileSync(path.join(root, 'docs/conformance/service-bundle.json'), 'utf8'));

async function main(): Promise<void> {
  if (!process.env.METIS_DATABASE_URL) {
    throw new Error('METIS_DATABASE_URL is not set; seeding memory would prove nothing about the image.');
  }
  const catalogue = await createCatalogueStore();
  const registry = await createRegistryStore();
  try {
    const tenantId: string = bundle.artifacts[0].tenantId;
    if ((await catalogue.store.listTenants()).includes(tenantId)) {
      throw new Error(`Tenant '${tenantId}' already exists in this database. Seed an empty one.`);
    }

    const c = bundle.catalogue;
    for (const o of c.offers) await catalogue.store.putOffer(tenantId, o);
    for (const p of c.targetingPolicies) await catalogue.store.putTargetingPolicy(tenantId, p);
    for (const f of c.frequencyPolicies) await catalogue.store.putFrequencyPolicy(tenantId, f);
    for (const b of c.boosts) await catalogue.store.putBoost(tenantId, b);
    for (const k of c.connectors ?? []) await catalogue.store.putConnector(tenantId, k);
    await catalogue.store.putArbitration(tenantId, c.arbitration);
    for (const p of bundle.placements ?? []) await catalogue.store.putPlacement(tenantId, p);
    if (bundle.profileSchema) await catalogue.store.putProfileSchema(tenantId, bundle.profileSchema);
    for (const e of bundle.experiments ?? []) await catalogue.store.putExperiment(tenantId, e);

    const at = '2026-08-01T09:00:00.000Z';
    for (const a of bundle.artifacts) {
      await registry.store.putVersion({
        tenantId,
        flowName: a.id,
        version: a.version,
        artifact: a,
        publishedAt: at,
        publishedBy: 'fixture',
        warnings: [],
        tests: [],
      });
      await registry.store.putEnvironment(tenantId, a.id, {
        environment: 'production',
        activeVersion: a.version,
        previousVersion: null,
        shadowVersion: null,
        promotedAt: at,
        promotedBy: 'fixture',
      });
    }
    console.log(`seeded ${tenantId}: ${c.offers.length} offers, ${bundle.artifacts.length} flows active in production`);
  } finally {
    await Promise.all([catalogue.close(), registry.close()]);
  }
}

main().catch((e: unknown) => {
  console.error(`seed failed: ${(e as Error).message}`);
  process.exit(1);
});
