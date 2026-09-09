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

/**
 * The catalogue's vocabulary.
 *
 * Everything here lived in the console's in-memory store until now, which made
 * a restart lose authored state. That is a correctness problem rather than
 * tidiness: a marketer edits a boost, the process recycles, and the decision
 * the engine makes next is against a catalogue nobody chose.
 *
 * Three ideas, taken from the registry because they are proven there:
 *
 *   1. **Rules in one class, storage behind an interface.** `CatalogueStore`
 *      only persists. Everything that decides what is allowed lives in
 *      `Catalogue`, so the same behaviour suite runs against memory and a real
 *      database and the rules are known to be storage-independent.
 *
 *   2. **Edits are audited, not overwritten silently.** Every write appends to
 *      a log naming the actor. A catalogue is what the engine decided from; a
 *      change to it with no record of who made it is the gap an auditor asks
 *      about first.
 *
 *   3. **Referential integrity is the store's job, not the caller's.** An
 *      offer in a category that does not exist, or a creative for an offer
 *      that was deleted, is refused. The in-memory fixtures could not express
 *      that, and a foreign key is the cheapest place to be sure of it.
 */

export type CatalogueEntity =
  | 'objective'
  | 'category'
  | 'offer'
  | 'creative'
  | 'targeting_policy'
  | 'frequency_policy'
  | 'boost'
  | 'arbitration';

/** One change to the catalogue. Append-only. */
export interface CatalogueEvent {
  /** Monotonic. The order is a fact, not a sort key. */
  seq: number;
  tenantId: string;
  at: string;
  actor: string;
  entity: CatalogueEntity;
  entityId: string;
  action: 'created' | 'updated' | 'deleted';
  /** Short enough to scan a log, specific enough to act on. */
  summary: string;
}

/**
 * A tenant's whole catalogue.
 *
 * Read as a unit because that is how the engine consumes it: a decision is
 * made against a catalogue *snapshot*, whose hash is recorded, so fetching the
 * parts separately would risk hashing a mixture of two moments.
 */
export interface CatalogueSnapshotRecord {
  objectives: Objective[];
  categories: Category[];
  offers: Offer[];
  creatives: Creative[];
  targetingPolicies: TargetingPolicy[];
  frequencyPolicies: FrequencyPolicy[];
  boosts: Boost[];
  /** Null until a tenant has configured one. */
  arbitration: ArbitrationConfig | null;
}

export interface CatalogueStore {
  read(tenantId: string): Promise<CatalogueSnapshotRecord>;

  putObjective(tenantId: string, objective: Objective): Promise<void>;
  putCategory(tenantId: string, category: Category): Promise<void>;
  putOffer(tenantId: string, offer: Offer): Promise<void>;
  putCreative(tenantId: string, creative: Creative): Promise<void>;
  putTargetingPolicy(tenantId: string, policy: TargetingPolicy): Promise<void>;
  putFrequencyPolicy(tenantId: string, policy: FrequencyPolicy): Promise<void>;
  putBoost(tenantId: string, boost: Boost): Promise<void>;
  putArbitration(tenantId: string, config: ArbitrationConfig): Promise<void>;

  deleteOffer(tenantId: string, offerId: string): Promise<boolean>;

  appendEvent(event: Omit<CatalogueEvent, 'seq'>): Promise<CatalogueEvent>;
  listEvents(filter?: {
    tenantId?: string;
    entity?: CatalogueEntity;
    limit?: number;
  }): Promise<CatalogueEvent[]>;

  listTenants(): Promise<string[]>;
}

export class CatalogueError extends Error {
  constructor(
    readonly code:
      | 'UNKNOWN_CATEGORY'
      | 'UNKNOWN_OBJECTIVE'
      | 'UNKNOWN_OFFER'
      | 'DUPLICATE_KEY'
      | 'OFFER_IN_USE',
    message: string
  ) {
    super(message);
    this.name = 'CatalogueError';
  }
}
