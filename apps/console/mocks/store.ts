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

import { DecisionLedger, InMemoryLedgerStore } from '@metis/ledger';
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
  frequencyPolicies: typeof seedFrequencyPolicies;
  arbitration: typeof seedArbitration;
  /**
   * The decision ledger: records, outcomes and idempotency keys.
   *
   * Replaces the two ad-hoc maps this used to carry. In development it is the
   * in-memory store, so it still forgets on restart — but the rules are now
   * the ledger's, and the same behaviour suite runs them against PostgreSQL.
   */
  ledger: DecisionLedger;
  /** The concrete store, so the test reset can clear it. */
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
  return {
    objectives: clone(seedObjectives),
    categories: clone(seedCategories),
    offers: clone(seedOffers),
    creatives: clone(seedCreatives),
    targetingPolicies: clone(seedTargetingPolicies),
    profileSchema: clone(seedProfileSchema),
    frequencyPolicies: clone(seedFrequencyPolicies),
    arbitration: clone(seedArbitration),
    ledger: new DecisionLedger(ledgerStore),
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
export function resetStore() {
  Object.assign(store, seed());
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
