/**
 * Development persistence.
 *
 * The fixture modules are the seed; this module holds the mutable copy that
 * route handlers read and write. State lives for the life of the server
 * process, so edits survive navigation and reload but not a restart — which is
 * the right fidelity for a console running ahead of its execution plane.
 *
 * Deliberately module-scoped: Next.js dev can re-evaluate modules on HMR, so
 * the store is stashed on globalThis to survive a hot reload.
 */

import { DecisionLedger, InMemoryLedgerStore, createLedgerStore } from '@metis/ledger';
import { clearCalls } from './call-log';
import type { ShadowComparison } from '@metis/runtime';
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
  users as seedUsers,
} from './fixtures/catalogue';
import { profileSchema as seedProfileSchema } from './fixtures/profile-schema';
import type { ProfileSchema } from '@metis/core/profile-schema';
import type { DataSourceDefinition, ValidationReport } from '@metis/core/intake';
import type { Experiment } from '@metis/core/experiment';
import { experiments as seedExperiments } from './fixtures/experiments';
import { artifacts as seedArtifacts, type ArtifactSummary } from './fixtures/artifacts';
import { compileContext, toSource } from './fixtures/compiled';
import { ArtifactRegistry, InMemoryRegistryStore } from '@metis/registry';
import {
  changeSets as seedChangeSets,
  auditEvents as seedAuditEvents,
  type ChangeSetRecord,
  type AuditEvent,
} from './fixtures/governance';

type Store = {
  objectives: typeof seedObjectives;
  categories: typeof seedCategories;
  offers: typeof seedOffers;
  creatives: typeof seedCreatives;
  targetingPolicies: typeof seedTargetingPolicies;
  /** The tenant's data model. Editable, so it lives here rather than in the fixture. */
  profileSchema: ProfileSchema;
  /** Configured sources of customer records. */
  dataSources: DataSourceDefinition[];
  /** Running experiments. Arms reach policies as `experiments.<key>`. */
  experiments: Experiment[];
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
  frequencyPolicies: typeof seedFrequencyPolicies;
  arbitration: typeof seedArbitration;
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
  /** Shadow comparisons recorded this process, oldest first. */
  shadowComparisons: ShadowComparison[];
  /**
   * Shadow runs not yet finished.
   *
   * Exposed so a test can wait for quiescence rather than sleep. An async
   * mechanism tested with a sleep is a flake with a timer attached.
   */
  shadowInFlight: Set<Promise<void>>;
  boosts: typeof seedBoosts;
  autonomy: typeof seedAutonomy;
  activity: typeof seedActivity;
  connectors: typeof seedConnectors;
  placements: typeof seedPlacements;
  users: typeof seedUsers;
  artifacts: ArtifactSummary[];
  changeSets: ChangeSetRecord[];
  auditEvents: AuditEvent[];
  /**
   * The artifact registry.
   *
   * Held alongside the rest of the development store and reset with it, so an
   * E2E spec that publishes a version does not leak it into the next one.
   */
  registryStore: InMemoryRegistryStore;
  registry: ArtifactRegistry;
  /**
   * Resolves once the fixture flows have been through the publish path.
   *
   * Seeding is asynchronous because the registry is — durable storage forced
   * that, and the in-memory store follows the same interface rather than
   * getting a synchronous shortcut. Handlers await this before reading the
   * registry, so a request that arrives during startup waits instead of seeing
   * an empty one.
   */
  registryReady: Promise<void>;
};

function seed(): Store {
  // Deep clone so mutations never write back through to the fixture modules.
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const registryStore = new InMemoryRegistryStore();
  const registry = new ArtifactRegistry(registryStore);
  const registryReady = seedRegistry(registry);
  const ledgerStore = new InMemoryLedgerStore();

  // Starts in memory and is replaced in place if a database is configured, so
  // nothing that already holds `store.ledger` has to be re-fetched. The
  // in-memory instance stays reachable either way: `POST /api/_test/reset`
  // clears it, and clearing a real database from a test endpoint is not a
  // thing this should be able to do.
  let kind: 'memory' | 'postgres' = 'memory';

  const built: Store = {
    objectives: clone(seedObjectives),
    categories: clone(seedCategories),
    offers: clone(seedOffers),
    creatives: clone(seedCreatives),
    targetingPolicies: clone(seedTargetingPolicies),
    profileSchema: clone(seedProfileSchema),
    dataSources: [],
    experiments: clone(seedExperiments),
    landedRows: new Map(),
    validationReports: new Map(),
    frequencyPolicies: clone(seedFrequencyPolicies),
    arbitration: clone(seedArbitration),
    // Replaced in place once a database resolves, below. Not a getter over a
    // closure: `resetStore` rebuilds the store with `Object.assign`, which
    // cannot write through an accessor, and not a mutation on `DecisionLedger`
    // either — its store is `private readonly` and a ledger that can be
    // repointed mid-process is a worse object than one that cannot.
    ledger: new DecisionLedger(ledgerStore),
    ledgerReady: Promise.resolve(),
    ledgerKind: () => kind,
    ledgerStore,
    shadowComparisons: [],
    shadowInFlight: new Set(),
    boosts: clone(seedBoosts),
    autonomy: clone(seedAutonomy),
    activity: clone(seedActivity),
    connectors: clone(seedConnectors),
    placements: clone(seedPlacements),
    users: clone(seedUsers),
    artifacts: clone(seedArtifacts),
    changeSets: clone(seedChangeSets),
    auditEvents: clone(seedAuditEvents),
    registryStore,
    registry,
    registryReady,
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

  return built;
}

/**
 * Put the fixture flows through the real publish path.
 *
 * Not inserted directly: they are compiled and either accepted or refused,
 * exactly as a publish from the console would be. One of the fixtures does not
 * compile, so the seeded registry starts with a rejection in its log — which is
 * the honest starting state for a console whose home page already reports one
 * flow as blocked.
 *
 * Accepted versions are promoted to `production`, because the console's
 * decisions were generated from them and it would be odd to show a flow as
 * running while the registry says nothing is active.
 */
async function seedRegistry(registry: ArtifactRegistry): Promise<void> {
  const at = '2026-08-01T09:00:00.000Z';
  for (const artifact of seedArtifacts) {
    // Oldest first, so the registry's publishedAt ordering matches the order
    // the versions were actually released in.
    for (const version of [...artifact.versions].reverse()) {
      const source = toSource(artifact);
      await registry.publish(
        {
          tenantId: 'telco-uk',
          flowName: artifact.id,
          version,
          source: {
            ...source,
            version,
            candidateKeys: artifact.priorCandidateKeys?.[version] ?? source.candidateKeys,
          },
          actor: artifact.updatedBy,
          occurredAt: at,
        },
        compileContext
      );
    }

    if (artifact.status === 'active') {
      await registry.promote('telco-uk', artifact.id, artifact.activeVersion, 'production', artifact.updatedBy, at);
    }
  }
}

const GLOBAL_KEY = Symbol.for('metis.dev.store');
type GlobalWithStore = typeof globalThis & { [GLOBAL_KEY]?: Store };
const g = globalThis as GlobalWithStore;

if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = seed();

export const store: Store = g[GLOBAL_KEY]!;

/** Restore the seed state. Used by the E2E suite between specs. */
export async function resetStore(): Promise<void> {
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

let auditCounter = 1000;

export function recordAudit(event: {
  actor: string;
  actorType: AuditEvent['actorType'];
  eventType: string;
  scope: string;
  summary: string;
  changeSetId?: string | null;
}) {
  const entry: AuditEvent = {
    id: `evt_${++auditCounter}`,
    timestamp: new Date().toISOString(),
    changeSetId: event.changeSetId ?? null,
    ...event,
  };
  store.auditEvents.unshift(entry);
  return entry;
}
