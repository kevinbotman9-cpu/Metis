import type {
  ArbitrationConfig,
  Boost,
  Category,
  Creative,
  FrequencyPolicy,
  Objective,
  Offer,
  TargetingPolicy,
} from '@metis/core/domain';
import type {
  CatalogueEntity,
  CatalogueEvent,
  CatalogueSnapshotRecord,
  CatalogueStore,
} from './types';

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
        arbitration: null,
      };
      this.tenants.set(tenantId, t);
    }
    return t;
  }

  /** Cloned on the way out, so a caller mutating a result cannot edit the store. */
  async read(tenantId: string): Promise<CatalogueSnapshotRecord> {
    const t = this.tenant(tenantId);
    return {
      objectives: [...t.objectives],
      categories: [...t.categories],
      offers: [...t.offers],
      creatives: [...t.creatives],
      targetingPolicies: [...t.targetingPolicies],
      frequencyPolicies: [...t.frequencyPolicies],
      boosts: [...t.boosts],
      arbitration: t.arbitration,
    };
  }

  private upsert<T extends { id: string }>(list: T[], value: T): void {
    const at = list.findIndex((x) => x.id === value.id);
    if (at === -1) list.push(value);
    else list[at] = value;
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
    this.tenant(tenantId).arbitration = config;
  }

  async deleteOffer(tenantId: string, offerId: string): Promise<boolean> {
    const t = this.tenant(tenantId);
    const before = t.offers.length;
    t.offers = t.offers.filter((o) => o.id !== offerId);
    return t.offers.length !== before;
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
