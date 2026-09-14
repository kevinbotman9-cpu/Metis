import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgresCatalogueStore, runMigration, type CatalogueSnapshotRecord } from '@metis/catalogue';
import { hash } from '@metis/runtime/deterministic/canonical';
import type { CatalogueSnapshot } from '@metis/runtime/deterministic/types';
import { catalogueSnapshot } from '@/mocks/fixtures/engine';
import { openCatalogue, CatalogueTenantRefused, CONSOLE_TENANT } from '@/mocks/catalogue-source';

/**
 * What a person authors in the console survives a restart, and the next
 * decision is made against it.
 *
 * Until 2026-09-13 neither was true. The console authored into arrays in its
 * development store, a restart put the fixtures back, and a decision service
 * reading `packages/catalogue` would never have seen a marketer's edit. These
 * run against a real PostgreSQL, because memory is exactly what cannot show it.
 *
 * Skipped rather than failed when no database is reachable, like every other
 * PostgreSQL suite here. CI's `verify` job runs a postgres service, so the skip
 * does not become the normal case.
 */

const URL =
  process.env.METIS_TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/metis_registry_test';

const pool = new Pool({ connectionString: URL, max: 4 });

let reachable = false;
try {
  reachable = (await pool.query('select 1')).rowCount === 1;
} catch {
  reachable = false;
}

const TABLES = [
  'catalogue_events',
  'catalogue_arbitration',
  'catalogue_boosts',
  'catalogue_connectors',
  'catalogue_placements',
  'catalogue_profile_schemas',
  'catalogue_experiments',
  'catalogue_frequency_policies',
  'catalogue_targeting_policies',
  'catalogue_creatives',
  'catalogue_offers',
  'catalogue_categories',
  'catalogue_objectives',
];

/** TRUNCATE, because the edit log refuses DELETE by trigger. Test database only. */
const truncate = () => pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);

/** The part of a stored catalogue the engine decides from. */
const engineSnapshot = (held: CatalogueSnapshotRecord): CatalogueSnapshot => ({
  offers: held.offers,
  targetingPolicies: held.targetingPolicies,
  frequencyPolicies: held.frequencyPolicies,
  arbitration: held.arbitration!,
  boosts: held.boosts,
  connectors: held.connectors,
});

/**
 * Start the console's API as a fresh process would: its store rebuilt, every
 * module re-evaluated, pointed at the database.
 *
 * The store is stashed on `globalThis` to survive hot reload, so a restart has
 * to remove it as well as reset the modules — otherwise the "restarted" console
 * is the same object, holding the same state, and proves nothing.
 */
async function bootConsole() {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('metis.dev.store')];
  vi.resetModules();
  const route = await import('@/app/api/[...path]/route');
  const { store } = await import('@/mocks/store');
  await store.catalogueReady;
  await store.ledgerReady;
  await store.registryReady;
  return { route, store };
}

type Booted = Awaited<ReturnType<typeof bootConsole>>;

function call(booted: Booted, method: 'GET' | 'POST' | 'PUT', path: string[], body?: unknown) {
  const marcus = booted.store.users.find((u) => u.email === 'marcus.webb@telco.example')!;
  const req = new Request(`http://localhost/api/${path.join('/')}`, {
    method,
    headers: { authorization: `Bearer metis.${marcus.id}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ctx = { params: Promise.resolve({ path }) };
  return method === 'GET' ? booted.route.GET(req, ctx) : method === 'PUT' ? booted.route.PUT(req, ctx) : booted.route.POST(req, ctx);
}

if (!reachable) {
  it.skip(`postgres at ${URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  beforeAll(async () => {
    await runMigration(pool);
  });

  afterAll(async () => {
    delete process.env.METIS_DATABASE_URL;
    await pool.end();
  });

  describe('opening the console tenant in a database', () => {
    it('gives an empty database the seeded tenant, which reads back as exactly the fixture catalogue', async () => {
      await truncate();
      const opened = await openCatalogue(new PostgresCatalogueStore(pool));
      expect(opened.seeded).toBe(true);

      // The same hash the 10,400 seeded decisions and the 60 service cases name.
      // A jsonb round trip that dropped a field, or a read in another order,
      // would move it — and a decision service reading this store could then
      // reproduce none of them.
      const held = await opened.catalogue.read(CONSOLE_TENANT);
      expect(hash(engineSnapshot(held))).toBe(hash(catalogueSnapshot));
      expect(held.profileSchema).not.toBeNull();
      expect(held.placements.length).toBeGreaterThan(0);
    });

    it('uses a database that already holds the tenant as it finds it, never reseeding over an edit', async () => {
      await truncate();
      const first = await openCatalogue(new PostgresCatalogueStore(pool));
      const [offer] = (await first.catalogue.read(CONSOLE_TENANT)).offers;
      await first.catalogue.putOffer(CONSOLE_TENANT, { ...offer, name: 'Renamed by a person' }, 'sarah', '2026-09-14T09:00:00.000Z');

      // A different store over the same database is what a restarted process gets.
      const again = await openCatalogue(new PostgresCatalogueStore(pool));
      expect(again.seeded).toBe(false);
      const held = (await again.catalogue.read(CONSOLE_TENANT)).offers.find((o) => o.id === offer.id)!;
      expect(held.name).toBe('Renamed by a person');
    });

    it('refuses a database that holds another tenant and not this one, and writes nothing', async () => {
      await truncate();
      const store = new PostgresCatalogueStore(pool);
      await store.putObjective('someone-else', {
        id: 'obj_theirs', name: 'Theirs', key: 'theirs', description: '', sortOrder: 1,
        createdAt: '2026-09-14T09:00:00.000Z', updatedAt: '2026-09-14T09:00:00.000Z',
      });

      const refusal = await openCatalogue(store).catch((e: unknown) => e);
      expect(refusal).toBeInstanceOf(CatalogueTenantRefused);
      expect((refusal as Error).message).toContain("'someone-else'");
      expect(await store.listTenants()).toEqual(['someone-else']);
    });
  });

  describe('the console over PostgreSQL', () => {
    it('keeps an edit made through the API across a restart, and decides the next request against it', async () => {
      await truncate();
      process.env.METIS_DATABASE_URL = URL;

      const first = await bootConsole();
      expect(first.store.catalogueKind()).toBe('postgres');
      expect(first.store.catalogueSeeded()).toBe(true);
      // This process wrote the seed, so the fingerprint of the fixtures
      // describes what it serves (G-002).
      const firstUptime = (await (await call(first, 'GET', ['_test', 'uptime'])).json()) as { seed: unknown };
      expect(firstUptime.seed).not.toBeNull();

      const weights = { propensity: 1, value: 0.1, boost: 3, context: 0.5 };
      const put = await call(first, 'PUT', ['arbitration', CONSOLE_TENANT], { weights });
      expect(put.status, await put.clone().text()).toBe(200);

      // A test reset against a real database would have to destroy what people
      // authored, so it is refused rather than performed.
      const reset = await call(first, 'POST', ['_test', 'reset']);
      expect(reset.status).toBe(409);

      const second = await bootConsole();
      expect(second.store.catalogueSeeded(), 'the restart reseeded over the edit').toBe(false);
      // It found what people authored, not the fixtures, so it must not claim
      // the fixtures' fingerprint — `global-setup.ts` would trust it.
      const secondUptime = (await (await call(second, 'GET', ['_test', 'uptime'])).json()) as { seed: unknown };
      expect(secondUptime.seed).toBeNull();

      const got = await call(second, 'GET', ['arbitration', CONSOLE_TENANT]);
      expect(((await got.json()) as { config: { weights: typeof weights } }).config.weights).toEqual(weights);

      const decided = await call(second, 'POST', ['placements', CONSOLE_TENANT, 'homepage_hero', 'decisions'], {
        request: {
          tenantId: CONSOLE_TENANT,
          // Unique per run, so a durable ledger from an earlier run holds no
          // decision under this id.
          customerId: `cust_durable_${Date.now()}`,
          channel: 'web',
          occurredAt: '2026-06-01T12:00:00.000Z',
          input: {
            customer: {
              age: 41,
              credit_status: 'pass',
              account_status: 'active',
              current_plan: 'standard',
              bill_to_income_ratio: 0.018,
              arrears_count_12mo: 0,
              credit_band: 'A',
              address: { fiber_available: true },
              usage: { pct_of_allowance_3mo_avg: 0.94, months_of_history: 14 },
              contract: { days_to_end: 210 },
              events: { pac_requested_within_days: 999 },
              device: { residual_value: 32000 },
            },
            context: { offer: { monthly_delta: 300 } },
          },
          consent: { marketing: true, profiling: true, thirdParty: false },
          contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
        },
      });
      expect(decided.status, await decided.clone().text()).toBe(200);
      const { decisionId } = (await decided.json()) as { decisionId: string };

      // The decision names the catalogue as the person left it — the stored one,
      // not the fixtures the process would have started from before.
      const entry = await second.store.ledger.get(CONSOLE_TENANT, decisionId);
      const held = await second.store.catalogue.read(CONSOLE_TENANT);
      expect(entry!.record.decision.catalogueSnapshotHash).toBe(hash(engineSnapshot(held)));
      expect(entry!.record.decision.catalogueSnapshotHash).not.toBe(hash(catalogueSnapshot));
    });
  });
}
