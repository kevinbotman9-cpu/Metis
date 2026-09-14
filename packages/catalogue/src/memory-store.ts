import type {
  ArbitrationConfig,
  Boost,
  Category,
  Connector,
  Creative,
  FrequencyPolicy,
  Objective,
  Offer,
  Placement,
  TargetingPolicy,
} from '@metis/core/domain';
import type { ProfileSchema } from '@metis/core/profile-schema';
import type { Experiment } from '@metis/core/experiment';
import type {
  CatalogueEntity,
  CatalogueEvent,
  CatalogueSnapshotRecord,
  CatalogueStore,
} from './types';

/**
 * A copy, not the stored object.
 *
 * PostgreSQL can only ever hand back copies, so a caller that edits what it read
 * changes nothing there. The memory store handed back the stored objects until
 * 2026-09-13, so the same edit *did* change the store here — and code that
 * mutated a read result in place worked against memory, passed every test that
 * used memory, and silently lost the edit against a real database.
 */
const copy = <T,>(value: T): T => structuredClone(value);

/** A sorted deep copy, by id — the order every catalogue store reads in. */
const byId = <T extends { id: string }>(list: T[]): T[] =>
  list.map(copy).sort((a, b) => a.id.localeCompare(b.id));

/**
 * In-memory catalogue.
 *
 * Not a fake for tests only — it is what a developer without a database runs,
 * and what the console falls back to. Which is exactly why it is held to the
 * same behaviour suite as PostgreSQL: the day the two disagree, the difference
 * shows up as somebody's local run passing and CI failing, and nobody enjoys
 * finding that out from a pull request.
 */
export class InMemoryCatalogueStore implements CatalogueStore {
  private readonly tenants = new Map<string, CatalogueSnapshotRecord>();
  private readonly events: CatalogueEvent[] = [];
  private seq = 0;

  private tenant(tenantId: string): CatalogueSnapshotRecord {
    let t = this.tenants.get(tenantId);
    if (!t) {
      t = {
        objectives: [],
        categories: [],
        offers: [],
        creatives: [],
        targetingPolicies: [],
        frequencyPolicies: [],
        boosts: [],
        connectors: [],
        placements: [],
        profileSchema: null,
        experiments: [],
        arbitration: null,
      };
      this.tenants.set(tenantId, t);
    }
    return t;
  }

  /**
   * Cloned on the way out, so a caller mutating a result cannot edit the store.
   *
   * Every array in id order, as PostgreSQL returns it. This returned write order
   * until 2026-09-13, so the two stores could read one catalogue in two orders —
   * and the engine hashes arrays in the order it is given, so the same catalogue
   * carried two hashes depending on where it was stored.
   */
  async read(tenantId: string): Promise<CatalogueSnapshotRecord> {
    const t = this.tenant(tenantId);
    return {
      objectives: byId(t.objectives),
      categories: byId(t.categories),
      offers: byId(t.offers),
      creatives: byId(t.creatives),
      targetingPolicies: byId(t.targetingPolicies),
      frequencyPolicies: byId(t.frequencyPolicies),
      boosts: byId(t.boosts),
      connectors: byId(t.connectors),
      placements: byId(t.placements),
      profileSchema: t.profileSchema ? copy(t.profileSchema) : null,
      experiments: byId(t.experiments),
      arbitration: t.arbitration ? copy(t.arbitration) : null,
    };
  }

  /** Stores a copy, so a caller editing its own object afterwards cannot edit the store. */
  private upsert<T extends { id: string }>(list: T[], value: T): void {
    const stored = copy(value);
    const at = list.findIndex((x) => x.id === value.id);
    if (at === -1) list.push(stored);
    else list[at] = stored;
  }

  private remove<T extends { id: string }>(list: T[], id: string): boolean {
    const at = list.findIndex((x) => x.id === id);
    if (at === -1) return false;
    list.splice(at, 1);
    return true;
  }

  async putObjective(tenantId: string, objective: Objective) {
    this.upsert(this.tenant(tenantId).objectives, objective);
  }
  async putCategory(tenantId: string, category: Category) {
    this.upsert(this.tenant(tenantId).categories, category);
  }
  async putOffer(tenantId: string, offer: Offer) {
    this.upsert(this.tenant(tenantId).offers, offer);
  }
  async putCreative(tenantId: string, creative: Creative) {
    this.upsert(this.tenant(tenantId).creatives, creative);
  }
  async putTargetingPolicy(tenantId: string, policy: TargetingPolicy) {
    this.upsert(this.tenant(tenantId).targetingPolicies, policy);
  }
  async putFrequencyPolicy(tenantId: string, policy: FrequencyPolicy) {
    this.upsert(this.tenant(tenantId).frequencyPolicies, policy);
  }
  async putBoost(tenantId: string, boost: Boost) {
    this.upsert(this.tenant(tenantId).boosts, boost);
  }
  async putArbitration(tenantId: string, config: ArbitrationConfig) {
    this.tenant(tenantId).arbitration = copy(config);
  }
  async putConnector(tenantId: string, connector: Connector) {
    this.upsert(this.tenant(tenantId).connectors, connector);
  }
  async putPlacement(tenantId: string, placement: Placement) {
    this.upsert(this.tenant(tenantId).placements, placement);
  }
  async putProfileSchema(tenantId: string, schema: ProfileSchema) {
    this.tenant(tenantId).profileSchema = copy(schema);
  }
  async putExperiment(tenantId: string, experiment: Experiment) {
    this.upsert(this.tenant(tenantId).experiments, experiment);
  }

  async deleteOffer(tenantId: string, offerId: string): Promise<boolean> {
    return this.remove(this.tenant(tenantId).offers, offerId);
  }
  async deleteCreative(tenantId: string, creativeId: string): Promise<boolean> {
    return this.remove(this.tenant(tenantId).creatives, creativeId);
  }
  async deleteTargetingPolicy(tenantId: string, policyId: string): Promise<boolean> {
    return this.remove(this.tenant(tenantId).targetingPolicies, policyId);
  }
  async deletePlacement(tenantId: string, placementId: string): Promise<boolean> {
    return this.remove(this.tenant(tenantId).placements, placementId);
  }

  async appendEvent(event: Omit<CatalogueEvent, 'seq'>): Promise<CatalogueEvent> {
    const stored: CatalogueEvent = { ...event, seq: ++this.seq };
    this.events.push(stored);
    return stored;
  }

  async listEvents(filter?: {
    tenantId?: string;
    entity?: CatalogueEntity;
    limit?: number;
  }): Promise<CatalogueEvent[]> {
    let out = this.events;
    if (filter?.tenantId) out = out.filter((e) => e.tenantId === filter.tenantId);
    if (filter?.entity) out = out.filter((e) => e.entity === filter.entity);
    // Newest first, by sequence rather than timestamp: two edits can share a
    // timestamp, and the sequence is what makes the order a fact.
    const sorted = [...out].sort((a, b) => b.seq - a.seq);
    return filter?.limit ? sorted.slice(0, filter.limit) : sorted;
  }

  async listTenants(): Promise<string[]> {
    return [...this.tenants.keys()].sort();
  }

  /** For the test reset endpoint. */
  clear(): void {
    this.tenants.clear();
    this.events.length = 0;
    this.seq = 0;
  }
}
