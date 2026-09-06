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

import { InMemoryIdempotencyStore } from '@metis/runtime';
import type { DecisionRecord } from '@metis/runtime';
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
  users as seedUsers,
} from './fixtures/catalogue';
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
  frequencyPolicies: typeof seedFrequencyPolicies;
  arbitration: typeof seedArbitration;
  /** Keys seen this process. Cleared by the test reset, like everything else. */
  idempotency: InMemoryIdempotencyStore;
  /**
   * Engine traces executed this process, by decision id.
   *
   * Separate from the seeded `decisions` fixtures, which are the console's
   * flattened display shape rather than engine output. Idempotent replay has
   * to return the decision that was actually made, so it needs the real thing.
   */
  executed: Map<string, DecisionRecord>;
  boosts: typeof seedBoosts;
  autonomy: typeof seedAutonomy;
  activity: typeof seedActivity;
  connectors: typeof seedConnectors;
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
  return {
    objectives: clone(seedObjectives),
    categories: clone(seedCategories),
    offers: clone(seedOffers),
    creatives: clone(seedCreatives),
    targetingPolicies: clone(seedTargetingPolicies),
    frequencyPolicies: clone(seedFrequencyPolicies),
    arbitration: clone(seedArbitration),
    idempotency: new InMemoryIdempotencyStore(),
    executed: new Map(),
    boosts: clone(seedBoosts),
    autonomy: clone(seedAutonomy),
    activity: clone(seedActivity),
    connectors: clone(seedConnectors),
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
    const outcome = await registry.publish(
      {
        tenantId: 'telco-uk',
        flowName: artifact.id,
        version: artifact.activeVersion,
        source: toSource(artifact),
        actor: artifact.updatedBy,
        occurredAt: at,
      },
      compileContext
    );

    if (outcome.status === 'published' && artifact.status === 'active') {
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
