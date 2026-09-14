/**
 * Development persistence.
 *
 * The fixture modules are the seed. The catalogue, the registry, change sets
 * with the audit log, and the ledger are real stores — PostgreSQL when
 * `METIS_DATABASE_URL` is set — so what a person authors in them survives a
 * restart; each `*-source.ts` module says when the seed is written. The rest of
 * this object (data sources, tenant settings, autonomy, users) lives for the
 * life of the process and is seeded again on every start (G-118).
 *
 * Deliberately module-scoped: Next.js dev can re-evaluate modules on HMR, so
 * the store is stashed on globalThis to survive a hot reload.
 */

import { DecisionLedger, InMemoryLedgerStore, createLedgerStore } from '@metis/ledger';
import {
  Catalogue,
  InMemoryCatalogueStore,
  createCatalogueStore,
  type CatalogueStore,
} from '@metis/catalogue';
import { openCatalogue, CONSOLE_TENANT } from './catalogue-source';
import { clearCalls } from './call-log';
import {
  objectives as seedObjectives,
  categories as seedCategories,
  offers as seedOffers,
  creatives as seedCreatives,
  targetingPolicies as seedTargetingPolicies,
  frequencyPolicies as seedFrequencyPolicies,
  arbitrationConfig as seedArbitration,
  boosts as seedBoosts,
  autonomySettings as seedAutonomy,
  agentActivity as seedActivity,
  connectors as seedConnectors,
  placements as seedPlacements,
  tenantSettings as seedTenantSettings,
  users as seedUsers,
} from './fixtures/catalogue';
import { profileSchema as seedProfileSchema } from './fixtures/profile-schema';
import { seedFingerprint, type SeedFingerprint } from './fixtures/fingerprint';
import type { DataSourceDefinition, ValidationReport } from '@metis/core/intake';
import { experiments as seedExperiments } from './fixtures/experiments';
import { artifacts as seedArtifacts } from './fixtures/artifacts';
import {
  ArtifactRegistry,
  InMemoryRegistryStore,
  createRegistryStore,
  type RegistryStore,
} from '@metis/registry';
import { openRegistry } from './registry-source';
import { changeSets as seedChangeSets, auditEvents as seedAuditEvents } from './fixtures/governance';
import {
  Governance,
  InMemoryGovernanceStore,
  createGovernanceStore,
  type AuditEvent,
  type GovernanceStore,
} from '@metis/governance';
import { openGovernance } from './governance-source';

type Store = {
  /**
   * The catalogue: taxonomy, offers, creatives, targeting and frequency
   * policies, boosts, the ranking function, connectors, placements, the profile
   * schema and experiments.
   *
   * `@metis/catalogue` — PostgreSQL when `METIS_DATABASE_URL` is set, memory
   * otherwise — rather than arrays in this object. Until 2026-09-13 it was the
   * arrays, so everything a person authored was lost on restart and invisible to
   * anything reading the real store. `mocks/catalogue-source.ts` says what
   * happens to the fixtures: an import into an empty store, never over one that
   * already holds the tenant.
   *
   * Starts as an empty in-memory store and is replaced in place once the
   * configured one is open, like the ledger. Await `catalogueReady` first.
   */
  catalogue: Catalogue;
  catalogueStore: CatalogueStore;
  /** Resolves once the configured store is open and the tenant found or seeded. */
  catalogueReady: Promise<void>;
  catalogueKind: () => 'memory' | 'postgres';
  /**
   * Whether this process wrote the seed, or found the tenant already stored.
   *
   * The seed fingerprint describes the fixtures, so it describes this store only
   * when this process seeded it; `/api/_test/uptime` serves it only then (G-002).
   */
  catalogueSeeded: () => boolean;
  /** Configured sources of customer records. */
  dataSources: DataSourceDefinition[];
  /**
   * Rows as they were landed, by source id.
   *
   * Held in memory only and never written to disk. These are customer records
   * in their original shape, which is the one thing ADR-004 has not yet decided
   * how to retain — so they live where a restart clears them, and the
   * per-source cap keeps a bad import from becoming an unbounded one.
   */
  landedRows: Map<string, Record<string, unknown>[]>;
  /** The most recent report per source. Cleared when new rows land. */
  validationReports: Map<string, ValidationReport>;
  /**
   * The decision ledger: records, outcomes and idempotency keys.
   *
   * `METIS_DATABASE_URL` chooses PostgreSQL and decisions and outcomes survive
   * a restart; without it this is in memory and forgets, which is the right
   * default for a console started for five minutes of local work. Both satisfy
   * `LedgerStore` and both pass `packages/ledger`'s one behaviour suite, so
   * this is a deployment choice rather than a behavioural one — ADR-008 phase
   * three.
   *
   * Await `ledgerReady` before the first use. Choosing the store is async
   * because reaching a database is, and a configured database that cannot be
   * reached must be an error rather than a silent fall back to storage that
   * forgets.
   */
  ledger: DecisionLedger;
  /** Resolves once the configured store is connected and migrated. */
  ledgerReady: Promise<void>;
  /** How it was resolved, for a startup line worth printing. */
  ledgerKind: () => 'memory' | 'postgres';
  /** The in-memory store, when there is one, so the test reset can clear it. */
  ledgerStore: InMemoryLedgerStore;
  /**
   * Shadow runs not yet finished.
   *
   * Exposed so a test can wait for quiescence rather than sleep. An async
   * mechanism tested with a sleep is a flake with a timer attached.
   */
  shadowInFlight: Set<Promise<void>>;
  autonomy: typeof seedAutonomy;
  activity: typeof seedActivity;
  /** How this tenant presents dates, numbers and money. G-092. */
  tenantSettings: typeof seedTenantSettings;
  users: typeof seedUsers;
  /**
   * Change sets and the audit log.
   *
   * `@metis/governance` — PostgreSQL when `METIS_DATABASE_URL` is set, memory
   * otherwise. Until 2026-09-14 these were two arrays here, so after a restart
   * an approved change set came back pending over a catalogue that already held
   * its edit. `mocks/governance-source.ts` says what happens to the fixtures.
   *
   * Starts as an empty in-memory store and is replaced in place once the
   * configured one is open. Await `governanceReady` first; `recordAudit` does.
   */
  governance: Governance;
  governanceStore: GovernanceStore;
  governanceReady: Promise<void>;
  governanceKind: () => 'memory' | 'postgres';
  /** Whether this process wrote the fixture change sets and log; see `catalogueSeeded`. */
  governanceSeeded: () => boolean;
  /**
   * The artifact registry: every flow's draft, every published version, the
   * environment pointers and the registry's event log.
   *
   * `@metis/registry` — PostgreSQL when `METIS_DATABASE_URL` is set, memory
   * otherwise. Until 2026-09-14 drafts were an array here and the registry was
   * always in memory, refilled from the fixture flows on every start, so a
   * published flow did not survive a restart. `mocks/registry-source.ts` says
   * what happens to the fixture flows now.
   *
   * Starts as an empty in-memory registry and is replaced in place once the
   * configured one is open. Await `registryReady` first.
   */
  registryStore: RegistryStore;
  registry: ArtifactRegistry;
  /**
   * Resolves once the registry is open and the flows found or seeded.
   *
   * Waits on `catalogueReady`, because seeding compiles the fixture flows
   * against the catalogue as stored. Handlers await this before reading the
   * registry, so a request that arrives during startup waits instead of seeing
   * an empty one.
   */
  registryReady: Promise<void>;
  registryKind: () => 'memory' | 'postgres';
  /**
   * Whether this process wrote the fixture flows, or found drafts already
   * stored. The seed fingerprint covers the flows, so like `catalogueSeeded`
   * this decides whether `/api/_test/uptime` may serve it.
   */
  registrySeeded: () => boolean;
  /**
   * What this store seeded, hashed, set when the store was built.
   *
   * On the store rather than at module scope, because the store is stashed on
   * `globalThis` and survives hot reload while this module does not: Next
   * re-runs `store.ts` when a fixture changes, finds the stash already set and
   * keeps the old store — so a module-scope constant would be recomputed from
   * the new fixtures and match disk while the store it claims to describe was
   * still answering from the old ones. Measured on 2026-09-12: decisions on a
   * boost of 1.07 while the file said 1.05 and the fingerprint agreed with the
   * file. Held here it goes stale together with the thing it describes, which
   * is the only way the comparison means anything (G-002).
   */
  seededFingerprint: SeedFingerprint;
};

function seed(): Store {
  // Deep clone so mutations never write back through to the fixture modules.
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const ledgerStore = new InMemoryLedgerStore();

  // Starts in memory and is replaced in place if a database is configured, so
  // nothing that already holds `store.ledger` has to be re-fetched. The
  // in-memory instance stays reachable either way: `POST /api/_test/reset`
  // clears it, and clearing a real database from a test endpoint is not a
  // thing this should be able to do.
  let kind: 'memory' | 'postgres' = 'memory';
  let catalogueKind: 'memory' | 'postgres' = 'memory';
  let catalogueSeeded = false;
  const placeholderCatalogue = new InMemoryCatalogueStore();
  let registryKind: 'memory' | 'postgres' = 'memory';
  let registrySeeded = false;
  const placeholderRegistry = new InMemoryRegistryStore();
  let governanceKind: 'memory' | 'postgres' = 'memory';
  let governanceSeeded = false;
  const placeholderGovernance = new InMemoryGovernanceStore();

  const built: Store = {
    catalogue: new Catalogue(placeholderCatalogue),
    catalogueStore: placeholderCatalogue,
    catalogueReady: Promise.resolve(),
    catalogueKind: () => catalogueKind,
    catalogueSeeded: () => catalogueSeeded,
    dataSources: [],
    landedRows: new Map(),
    validationReports: new Map(),
    // Replaced in place once a database resolves, below. Not a getter over a
    // closure: `resetStore` rebuilds the store with `Object.assign`, which
    // cannot write through an accessor, and not a mutation on `DecisionLedger`
    // either — its store is `private readonly` and a ledger that can be
    // repointed mid-process is a worse object than one that cannot.
    ledger: new DecisionLedger(ledgerStore),
    ledgerReady: Promise.resolve(),
    ledgerKind: () => kind,
    ledgerStore,
    shadowInFlight: new Set(),
    autonomy: clone(seedAutonomy),
    activity: clone(seedActivity),
    tenantSettings: clone(seedTenantSettings),
    users: clone(seedUsers),
    governance: new Governance(placeholderGovernance),
    governanceStore: placeholderGovernance,
    governanceReady: Promise.resolve(),
    governanceKind: () => governanceKind,
    governanceSeeded: () => governanceSeeded,
    registryStore: placeholderRegistry,
    registry: new ArtifactRegistry(placeholderRegistry),
    registryReady: Promise.resolve(),
    registryKind: () => registryKind,
    registrySeeded: () => registrySeeded,
    seededFingerprint: seedFingerprint({
      objectives: seedObjectives,
      categories: seedCategories,
      offers: seedOffers,
      creatives: seedCreatives,
      targetingPolicies: seedTargetingPolicies,
      frequencyPolicies: seedFrequencyPolicies,
      arbitration: seedArbitration,
      boosts: seedBoosts,
      connectors: seedConnectors,
      placements: seedPlacements,
      tenantSettings: seedTenantSettings,
      artifacts: seedArtifacts,
      profileSchema: seedProfileSchema,
      experiments: seedExperiments,
      autonomySettings: seedAutonomy,
      agentActivity: seedActivity,
      users: seedUsers,
      changeSets: seedChangeSets,
      auditEvents: seedAuditEvents,
    }),
  };

  // Chosen asynchronously, because reaching a database is. The default is
  // deliberately the lossy one — a console started for five minutes of local
  // work should not need a database — but a *configured* database that cannot
  // be reached is an error, never a silent fall back to storage that forgets.
  // For the ledger that means losing the audit record of what was decided.
  built.ledgerReady = createLedgerStore()
    .then((handle) => {
      kind = handle.kind;
      if (handle.kind === 'postgres') {
        built.ledger = new DecisionLedger(handle.store);
        // eslint-disable-next-line no-console
        console.log(`[metis] decision ledger: ${handle.description}`);
      }
    })
    .catch((e: Error) => {
      // Attached to the first request that needed it rather than thrown at
      // import, so a misconfigured database fails loudly at the point of use
      // instead of stopping the process from starting.
      // eslint-disable-next-line no-console
      console.error(`[metis] decision ledger unavailable: ${e.message}`);
      throw e;
    });

  // The same shape for the catalogue: a configured database that cannot be
  // reached, or that holds another tenant, fails the request that needed it
  // rather than falling back to a catalogue nobody authored.
  built.catalogueReady = createCatalogueStore()
    .then(async (handle) => {
      const opened = await openCatalogue(handle.store);
      built.catalogueStore = opened.store;
      built.catalogue = opened.catalogue;
      catalogueKind = handle.kind;
      catalogueSeeded = opened.seeded;
      if (handle.kind === 'postgres') {
        // eslint-disable-next-line no-console
        console.log(
          `[metis] catalogue: ${handle.description}; ` +
            (opened.seeded ? 'seeded the tenant into an empty store' : 'tenant found, used as stored')
        );
      }
    })
    .catch((e: Error) => {
      // eslint-disable-next-line no-console
      console.error(`[metis] catalogue unavailable: ${e.message}`);
      throw e;
    });

  // After the catalogue, because an empty registry is seeded by compiling the
  // fixture flows against the catalogue as stored. Same failure shape: a
  // configured database that cannot be reached, or a registry holding flows
  // the console cannot show, fails the request that needed it.
  built.registryReady = built.catalogueReady
    .then(async () => {
      const handle = await createRegistryStore();
      const registry = new ArtifactRegistry(handle.store);
      const opened = await openRegistry(registry, built.catalogue);
      built.registryStore = handle.store;
      built.registry = registry;
      registryKind = handle.kind;
      registrySeeded = opened.seeded;
      if (handle.kind === 'postgres') {
        // eslint-disable-next-line no-console
        console.log(
          `[metis] registry: ${handle.description}; ` +
            (opened.seeded ? 'seeded the fixture flows into an empty registry' : 'flows found, used as stored')
        );
      }
    })
    .catch((e: Error) => {
      // eslint-disable-next-line no-console
      console.error(`[metis] registry unavailable: ${e.message}`);
      throw e;
    });

  // Independent of the catalogue: nothing here is compiled or checked against
  // it. The same failure shape as the other stores.
  built.governanceReady = createGovernanceStore()
    .then(async (handle) => {
      const opened = await openGovernance(handle.store);
      built.governanceStore = handle.store;
      built.governance = new Governance(handle.store);
      governanceKind = handle.kind;
      governanceSeeded = opened.seeded;
      if (handle.kind === 'postgres') {
        // eslint-disable-next-line no-console
        console.log(
          `[metis] governance: ${handle.description}; ` +
            (opened.seeded ? 'seeded change sets and the audit log into an empty store' : 'tenant found, used as stored')
        );
      }
    })
    .catch((e: Error) => {
      // eslint-disable-next-line no-console
      console.error(`[metis] governance unavailable: ${e.message}`);
      throw e;
    });

  return built;
}

const GLOBAL_KEY = Symbol.for('metis.dev.store');
type GlobalWithStore = typeof globalThis & { [GLOBAL_KEY]?: Store };
const g = globalThis as GlobalWithStore;

if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = seed();

export const store: Store = g[GLOBAL_KEY]!;



/** Thrown by `resetStore` when the catalogue is a real database. */
export class ResetRefused extends Error {
  constructor() {
    super(
      'The catalogue is in PostgreSQL, and a test reset would have to destroy what people authored ' +
        "there — and the catalogue's append-only edit log with it, which only TRUNCATE can do. Reset " +
        'is for the in-memory store the test suites run against; unset METIS_DATABASE_URL to use it.'
    );
    this.name = 'ResetRefused';
  }
}

/** Restore the seed state. Used by the E2E suite between specs. */
export async function resetStore(): Promise<void> {
  await store.catalogueReady.catch(() => {});
  if (store.catalogueKind() === 'postgres') throw new ResetRefused();

  // Drain what the last test started, before replacing anything it could
  // still be writing into. A shadow run that resolves after the swap lands a
  // comparison in the new state, and the next spec sees a divergence it did
  // not cause — one of the three ingredients behind G-003.
  await Promise.race([
    Promise.allSettled([...store.shadowInFlight]),
    // Bounded on purpose. A shadow run that never settles would otherwise hang
    // the reset endpoint, and every test after it fails at login with no
    // indication that a reset is the reason — which is a worse failure than the
    // contamination this drain exists to prevent.
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);

  const next = seed();

  // Await the async halves *before* the swap, not after.
  //
  // `seed()` returns immediately and then finishes two things in the
  // background: the registry seeds itself, and the ledger resolves its store.
  // Both wrote into the object `seed()` returned — which, after the first
  // call, is not `store`, so the ledger upgrade was landing on a discarded
  // object and the registry was still filling while the next test read it.
  // Awaiting here makes the reset mean what its name says.
  await next.registryReady;
  await next.catalogueReady;
  await next.governanceReady;
  await next.ledgerReady.catch(() => {
    // A configured database that cannot be reached is already reported by
    // `seed()`. Swallowed here so a reset does not fail a test with the same
    // message twice.
  });

  Object.assign(store, next);

  // Module-level state that `seed()` cannot reach, because it does not own it.
  clearCalls();

  // `catalogue-state` is deliberately *not* cleared. It is keyed by content
  // hash, so a stale entry can never be returned for a different catalogue —
  // it is a leak of at most a few objects, and clearing it would make a
  // decision recorded before the reset unreplayable, which is a worse
  // property than a small map.
}

// ---------------------------------------------------------------------------
// Audit — every write goes through here, so the log is never out of step
// ---------------------------------------------------------------------------

/**
 * Append one event to the tenant's audit log.
 *
 * Asynchronous, and every caller awaits it, because the log is a store: a write
 * whose audit entry was still in flight when the response went out could be
 * lost with nobody told. The id is assigned by `Governance` — it was a counter
 * here that started again at 1000 on every boot, which over a durable log would
 * have reissued ids already cited.
 */
export async function recordAudit(event: {
  actor: string;
  actorType: AuditEvent['actorType'];
  eventType: string;
  scope: string;
  summary: string;
  changeSetId?: string | null;
}): Promise<AuditEvent> {
  await store.governanceReady;
  return store.governance.record(CONSOLE_TENANT, {
    timestamp: new Date().toISOString(),
    actor: event.actor,
    actorType: event.actorType,
    eventType: event.eventType,
    scope: event.scope,
    summary: event.summary,
    changeSetId: event.changeSetId ?? null,
  });
}
