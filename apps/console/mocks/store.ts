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

import {
  issues as seedIssues,
  groups as seedGroups,
  propositions as seedPropositions,
  treatments as seedTreatments,
  engagementPolicies as seedEngagementPolicies,
  contactPolicies as seedContactPolicies,
  arbitrationConfig as seedArbitration,
  levers as seedLevers,
  autonomySettings as seedAutonomy,
  agentActivity as seedActivity,
  connectors as seedConnectors,
  users as seedUsers,
} from './fixtures/catalogue';
import { artifacts as seedArtifacts, type ArtifactSummary } from './fixtures/artifacts';
import { compileContext, toSource } from './fixtures/compiled';
import { ArtifactRegistry, InMemoryRegistryStore } from '@metis/registry';
import {
  changeRequests as seedChangeRequests,
  auditEvents as seedAuditEvents,
  type ChangeRequestRecord,
  type AuditEvent,
} from './fixtures/governance';

type Store = {
  issues: typeof seedIssues;
  groups: typeof seedGroups;
  propositions: typeof seedPropositions;
  treatments: typeof seedTreatments;
  engagementPolicies: typeof seedEngagementPolicies;
  contactPolicies: typeof seedContactPolicies;
  arbitration: typeof seedArbitration;
  levers: typeof seedLevers;
  autonomy: typeof seedAutonomy;
  activity: typeof seedActivity;
  connectors: typeof seedConnectors;
  users: typeof seedUsers;
  artifacts: ArtifactSummary[];
  changeRequests: ChangeRequestRecord[];
  auditEvents: AuditEvent[];
  /**
   * The artifact registry.
   *
   * Held alongside the rest of the development store and reset with it, so an
   * E2E spec that publishes a version does not leak it into the next one.
   */
  registryStore: InMemoryRegistryStore;
  registry: ArtifactRegistry;
};

function seed(): Store {
  // Deep clone so mutations never write back through to the fixture modules.
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const registryStore = new InMemoryRegistryStore();
  const registry = new ArtifactRegistry(registryStore);
  seedRegistry(registry);
  return {
    issues: clone(seedIssues),
    groups: clone(seedGroups),
    propositions: clone(seedPropositions),
    treatments: clone(seedTreatments),
    engagementPolicies: clone(seedEngagementPolicies),
    contactPolicies: clone(seedContactPolicies),
    arbitration: clone(seedArbitration),
    levers: clone(seedLevers),
    autonomy: clone(seedAutonomy),
    activity: clone(seedActivity),
    connectors: clone(seedConnectors),
    users: clone(seedUsers),
    artifacts: clone(seedArtifacts),
    changeRequests: clone(seedChangeRequests),
    auditEvents: clone(seedAuditEvents),
    registryStore,
    registry,
  };
}

/**
 * Put the fixture strategies through the real publish path.
 *
 * Not inserted directly: they are compiled and either accepted or refused,
 * exactly as a publish from the console would be. One of the fixtures does not
 * compile, so the seeded registry starts with a rejection in its log — which is
 * the honest starting state for a console whose home page already reports one
 * strategy as blocked.
 *
 * Accepted versions are promoted to `production`, because the console's
 * decisions were generated from them and it would be odd to show a strategy as
 * running while the registry says nothing is active.
 */
function seedRegistry(registry: ArtifactRegistry): void {
  const at = '2026-08-01T09:00:00.000Z';
  for (const artifact of seedArtifacts) {
    const outcome = registry.publish(
      {
        tenantId: 'telco-uk',
        strategyName: artifact.id,
        version: artifact.activeVersion,
        source: toSource(artifact),
        actor: artifact.updatedBy,
        occurredAt: at,
      },
      compileContext
    );

    if (outcome.status === 'published' && artifact.status === 'active') {
      registry.promote('telco-uk', artifact.id, artifact.activeVersion, 'production', artifact.updatedBy, at);
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
  changeRequestId?: string | null;
}) {
  const entry: AuditEvent = {
    id: `evt_${++auditCounter}`,
    timestamp: new Date().toISOString(),
    changeRequestId: event.changeRequestId ?? null,
    ...event,
  };
  store.auditEvents.unshift(entry);
  return entry;
}
