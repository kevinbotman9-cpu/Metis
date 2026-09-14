/**
 * The console's catalogue, opened from a real store.
 *
 * Until 2026-09-13 the console authored into arrays in its development store —
 * offers, policies, connectors, placements, the profile schema, experiments —
 * and a restart put the fixtures back. Nothing a person changed survived, and a
 * decision service reading `packages/catalogue` would never have seen it. Now
 * the console reads and writes through `@metis/catalogue`: PostgreSQL when
 * `METIS_DATABASE_URL` is set, memory otherwise — the same choice, made the same
 * way, as the ledger's.
 *
 * ## What happens to the seed
 *
 * The fixtures stop being the console's state and become an import, performed
 * at most once per store:
 *
 * - **An empty store** — no tenant at all — is given the seeded tenant. With
 *   memory that is every start and every test reset; with PostgreSQL it is the
 *   first start against a new database, and never again.
 * - **A store that already holds `telco-us`** is used exactly as found. It is
 *   not reseeded, not merged with the fixtures, and not checked against them —
 *   so a fixture edited after the first start does not reach that database.
 *   That is the point: what a person authored is not overwritten by what a
 *   developer committed.
 * - **A store that holds other tenants and not `telco-us`** is refused. The
 *   console serves one tenant and has no way to switch; writing its demo seed
 *   into a database that already belongs to somebody else would mix a
 *   fictional telco into a real tenant's store, and nothing could separate them
 *   afterwards except by hand.
 *
 * Seeding is a sequence of writes, not a transaction — the store has no
 * transaction to offer — so a seed interrupted halfway leaves a tenant that
 * exists and is incomplete, and the next start will use it as found. The error
 * the interrupted start raises says so; the remedy is an empty database.
 */

import { Catalogue, type CatalogueStore } from '@metis/catalogue';
import {
  objectives,
  categories,
  offers,
  creatives,
  targetingPolicies,
  frequencyPolicies,
  arbitrationConfig,
  boosts,
  connectors,
  placements,
} from './fixtures/catalogue';
import { profileSchema } from './fixtures/profile-schema';
import { experiments } from './fixtures/experiments';

/** The one tenant this console serves. */
export const CONSOLE_TENANT = 'telco-us';

export class CatalogueTenantRefused extends Error {
  constructor(
    readonly tenantId: string,
    readonly found: string[]
  ) {
    super(
      `The catalogue store holds ${found.map((t) => `'${t}'`).join(', ')} and not '${tenantId}'. ` +
        `This console serves '${tenantId}' alone and will not write its seed beside another ` +
        "tenant's data, where nothing could tell the two apart afterwards. Point METIS_DATABASE_URL " +
        `at an empty database, or import '${tenantId}' into this one first.`
    );
    this.name = 'CatalogueTenantRefused';
  }
}

export interface OpenedCatalogue {
  store: CatalogueStore;
  catalogue: Catalogue;
  /** Whether this open wrote the seed, or found the tenant already there. */
  seeded: boolean;
}

/**
 * Write the seeded tenant into a store.
 *
 * Through the store rather than `Catalogue`, as a restore rather than an
 * authoring session — the same choice `packages/portability` makes for an
 * import, for the same reason: the facade would log thousands of "created"
 * events attributed to a person who did nothing. The order is the schema's
 * foreign keys: taxonomy, then what hangs off it.
 */
export async function seedTenant(store: CatalogueStore, tenantId = CONSOLE_TENANT): Promise<void> {
  try {
    for (const o of objectives) await store.putObjective(tenantId, o);
    for (const c of categories) await store.putCategory(tenantId, c);
    for (const o of offers) await store.putOffer(tenantId, o);
    for (const c of creatives) await store.putCreative(tenantId, c);
    for (const p of targetingPolicies) await store.putTargetingPolicy(tenantId, p);
    for (const p of frequencyPolicies) await store.putFrequencyPolicy(tenantId, p);
    for (const b of boosts) await store.putBoost(tenantId, b);
    for (const c of connectors) await store.putConnector(tenantId, c);
    for (const p of placements) await store.putPlacement(tenantId, p);
    for (const e of experiments) await store.putExperiment(tenantId, e);
    await store.putProfileSchema(tenantId, profileSchema);
    await store.putArbitration(tenantId, arbitrationConfig);
  } catch (e) {
    throw new Error(
      `Seeding '${tenantId}' failed partway: ${(e as Error).message}. The store now holds part of ` +
        'the seed, and the next start will use that part as found. Start from an empty database.'
    );
  }
}

/**
 * Open the console's tenant in a store: use it, seed it, or refuse.
 *
 * `listTenants` is read once, before anything is written, so the decision is
 * made on what the store held rather than on what this call has begun to write.
 */
export async function openCatalogue(
  store: CatalogueStore,
  tenantId = CONSOLE_TENANT
): Promise<OpenedCatalogue> {
  const tenants = await store.listTenants();
  if (tenants.includes(tenantId)) {
    return { store, catalogue: new Catalogue(store), seeded: false };
  }
  if (tenants.length > 0) throw new CatalogueTenantRefused(tenantId, tenants);

  await seedTenant(store, tenantId);
  return { store, catalogue: new Catalogue(store), seeded: true };
}
