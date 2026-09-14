import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { PostgresCatalogueStore, runMigration, type CatalogueSnapshotRecord } from '@metis/catalogue';
import { createRegistryStore } from '@metis/registry';
import { createGovernanceStore } from '@metis/governance';
import { hash } from '@metis/runtime/deterministic/canonical';
import type { CatalogueSnapshot } from '@metis/runtime/deterministic/types';
import { catalogueSnapshot } from '@/mocks/fixtures/engine';
import { openCatalogue, CatalogueTenantRefused, CONSOLE_TENANT } from '@/mocks/catalogue-source';
import { toSource } from '@/mocks/fixtures/compiled';
import type { ArtifactSummary } from '@/mocks/fixtures/artifacts';

/**
 * What a person authors in the console survives a restart, and the next
 * decision is made against it.
 *
 * Until 2026-09-13 none of it did. The console authored into arrays in its
 * development store, a restart put the fixtures back, and a decision service
 * reading `packages/catalogue` would never have seen a marketer's edit. The
 * catalogue moved onto its store that day; decision flows — drafts, published
 * versions and environments — followed on 2026-09-14. These run against a real
 * PostgreSQL, because memory is exactly what cannot show it.
 *
 * One file for every store the console opens, not one per store: the console's
 * unit files run in parallel, and two files truncating one database would take
 * each other's locks (G-078).
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

const CATALOGUE_TABLES = [
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

const REGISTRY_TABLES = ['registry_environments', 'registry_versions', 'registry_events', 'registry_drafts'];

const GOVERNANCE_TABLES = ['governance_change_sets', 'governance_audit_events'];

/** TRUNCATE, because the edit logs refuse DELETE by trigger. Test database only. */
const truncate = (tables = [...CATALOGUE_TABLES, ...REGISTRY_TABLES, ...GOVERNANCE_TABLES]) =>
  pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);

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

const uptimeSeed = async (booted: Booted) =>
  ((await (await call(booted, 'GET', ['_test', 'uptime'])).json()) as { seed: unknown }).seed;

if (!reachable) {
  it.skip(`postgres at ${URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  beforeAll(async () => {
    await runMigration(pool);
    // The registry's migrations, through the same entry point the console uses.
    const registry = await createRegistryStore({ databaseUrl: URL });
    await registry.close();
    const governance = await createGovernanceStore({ databaseUrl: URL });
    await governance.close();
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
      expect(await uptimeSeed(first)).not.toBeNull();

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
      expect(await uptimeSeed(second)).toBeNull();

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

    it('keeps a flow drawn, published and promoted through the API across a restart, and the next decision runs it', async () => {
      await truncate();
      process.env.METIS_DATABASE_URL = URL;
      const FLOW = 'next-best-action';

      const first = await bootConsole();
      expect(first.store.registryKind()).toBe('postgres');
      expect(first.store.registrySeeded()).toBe(true);

      // Drawn: a node relabelled, saved as the draft.
      const drawn = (await (await call(first, 'GET', ['artifacts', CONSOLE_TENANT, FLOW])).json()) as ArtifactSummary;
      const nodes = drawn.nodes.map((n) => (n.type === 'arbitrate' ? { ...n, label: 'Ranked by a person' } : n));
      const saved = await call(first, 'PUT', ['artifacts', CONSOLE_TENANT, FLOW, 'draft'], { nodes });
      expect(saved.status, await saved.clone().text()).toBe(200);
      const { artifact } = (await saved.json()) as { artifact: ArtifactSummary };

      // Published and promoted, as two separate authorities.
      const published = await call(first, 'POST', ['registry', CONSOLE_TENANT, FLOW], {
        version: '9.0.0',
        source: toSource({ ...artifact, activeVersion: '9.0.0' }),
      });
      expect(published.status, await published.clone().text()).toBe(201);
      const promoted = await call(first, 'POST', ['registry', CONSOLE_TENANT, FLOW, 'promote'], {
        version: '9.0.0',
        environment: 'production',
      });
      expect(promoted.status, await promoted.clone().text()).toBe(200);

      const second = await bootConsole();
      expect(second.store.registrySeeded(), 'the restart reseeded the fixture flows').toBe(false);

      // The published version is still the one in production, and the draft is
      // the graph the person saved rather than the fixture.
      const env = await second.store.registry.environment(CONSOLE_TENANT, FLOW, 'production');
      expect(env?.activeVersion).toBe('9.0.0');
      const kept = (await (await call(second, 'GET', ['artifacts', CONSOLE_TENANT, FLOW])).json()) as ArtifactSummary;
      expect(kept.nodes.find((n) => n.type === 'arbitrate')!.label).toBe('Ranked by a person');

      const decided = await call(second, 'POST', ['placements', CONSOLE_TENANT, 'homepage_hero', 'decisions'], {
        request: {
          tenantId: CONSOLE_TENANT,
          customerId: `cust_flow_durable_${Date.now()}`,
          channel: 'web',
          occurredAt: '2026-06-01T12:00:00.000Z',
          // The brief's fiber-available customer: every gate passes.
          input: {
            customer: {
              account_status: 'active',
              moving_within_days: 999,
              address: { fios_serviceable: true, fiveg_coverage: 'strong' },
              broadband: { status: 'active', product: 'dsl' },
              orders: { open_broadband: false },
              ott: { disney: false, netflix: false, disney_available: true, netflix_available: true },
              affinity: { gaming: 0.8, entertainment: 0.8 },
              engagement: { digital_or_broadband_intent: true },
              usage: { pct_of_allowance_3mo_avg: 0.94, months_of_history: 14 },
            },
            context: {},
          },
          consent: { marketing: true, profiling: true, thirdParty: false },
          contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
        },
      });
      expect(decided.status, await decided.clone().text()).toBe(200);
      const { decisionId } = (await decided.json()) as { decisionId: string };

      // The decision was made by the version published before the restart —
      // not by a reseeded fixture version, and not by the fallback artifact
      // `artifactFor` uses for a flow the registry does not hold.
      const entry = await second.store.ledger.get(CONSOLE_TENANT, decisionId);
      expect(entry!.record.decision.artifactId).toBe(FLOW);
      expect(entry!.record.decision.artifactVersion).toBe('9.0.0');
    });

    it('keeps an approval across a restart: still approved, not approvable again, and still in the log', async () => {
      // Before 2026-09-14 the change set came back pending after a restart, over
      // a catalogue that already held its edit, and the log had forgotten who
      // approved it.
      await truncate();
      process.env.METIS_DATABASE_URL = URL;
      const CHANGE_SET = 'cr_0041';

      const first = await bootConsole();
      expect(first.store.governanceKind()).toBe('postgres');
      expect(first.store.governanceSeeded()).toBe(true);

      const approved = await call(first, 'POST', ['change-sets', CHANGE_SET, 'approve'], { reason: 'Context explains little.' });
      expect(approved.status, await approved.clone().text()).toBe(200);

      const second = await bootConsole();
      expect(second.store.governanceSeeded(), 'the restart reseeded the change sets').toBe(false);

      const held = (await (await call(second, 'GET', ['change-sets', CHANGE_SET])).json()) as { status: string; decidedBy: string };
      expect(held).toMatchObject({ status: 'approved', decidedBy: 'marcus.webb@telco.example' });

      const again = await call(second, 'POST', ['change-sets', CHANGE_SET, 'approve'], {});
      expect(again.status, 'an approval that survived a restart was approved a second time').toBe(409);

      const log = await second.store.governance.events(CONSOLE_TENANT);
      expect(log.filter((e) => e.eventType === 'ChangeSetApproved' && e.changeSetId === CHANGE_SET)).toHaveLength(1);

      // And the diff it applied is still what the catalogue holds.
      const weights = (await (await call(second, 'GET', ['arbitration', CONSOLE_TENANT])).json()) as { config: { weights: { context: number } } };
      expect(weights.config.weights.context).toBe(0.65);
    });

    it('does not claim the fixture flows when the catalogue is seeded and the flows were found', async () => {
      // The fingerprint covers both, so either one found as stored voids it.
      await truncate();
      process.env.METIS_DATABASE_URL = URL;
      await bootConsole();
      await truncate(CATALOGUE_TABLES);

      const again = await bootConsole();
      expect(again.store.catalogueSeeded()).toBe(true);
      expect(again.store.registrySeeded()).toBe(false);
      expect(await uptimeSeed(again)).toBeNull();

      // And change sets and an audit log found as stored, with the catalogue
      // and the flows both seeded by this process.
      await truncate([...CATALOGUE_TABLES, ...REGISTRY_TABLES]);
      const third = await bootConsole();
      expect(third.store.catalogueSeeded()).toBe(true);
      expect(third.store.registrySeeded()).toBe(true);
      expect(third.store.governanceSeeded()).toBe(false);
      expect(await uptimeSeed(third)).toBeNull();
    });
  });
}
