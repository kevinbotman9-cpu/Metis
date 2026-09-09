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
import {
  CatalogueError,
  type CatalogueEntity,
  type CatalogueEvent,
  type CatalogueSnapshotRecord,
  type CatalogueStore,
} from './types';

/**
 * The catalogue's rules, in one place.
 *
 * The store below this only persists. Everything that decides what is allowed
 * is here, which is what lets one behaviour suite run against memory and a
 * real PostgreSQL and prove the two agree.
 */
export class Catalogue {
  constructor(private readonly store: CatalogueStore) {}

  read(tenantId: string): Promise<CatalogueSnapshotRecord> {
    return this.store.read(tenantId);
  }

  events(filter?: { tenantId?: string; entity?: CatalogueEntity; limit?: number }) {
    return this.store.listEvents(filter);
  }

  tenants(): Promise<string[]> {
    return this.store.listTenants();
  }

  async putObjective(tenantId: string, objective: Objective, actor: string, at: string) {
    const existed = (await this.store.read(tenantId)).objectives.some((o) => o.id === objective.id);
    await this.store.putObjective(tenantId, objective);
    await this.log(tenantId, actor, at, 'objective', objective.id, existed, objective.name);
    return objective;
  }

  async putCategory(tenantId: string, category: Category, actor: string, at: string) {
    const snapshot = await this.store.read(tenantId);
    // Checked here rather than left to the foreign key, so the memory store
    // refuses it too and the rule is a property of the catalogue, not of
    // whichever storage happens to be configured.
    if (!snapshot.objectives.some((o) => o.id === category.objectiveId)) {
      throw new CatalogueError(
        'UNKNOWN_OBJECTIVE',
        `Category ${category.id} names objective ${category.objectiveId}, which does not exist. ` +
          'A category outside the taxonomy cannot be reached by a decision flow.'
      );
    }
    const existed = snapshot.categories.some((c) => c.id === category.id);
    await this.store.putCategory(tenantId, category);
    await this.log(tenantId, actor, at, 'category', category.id, existed, category.name);
    return category;
  }

  async putOffer(tenantId: string, offer: Offer, actor: string, at: string) {
    const snapshot = await this.store.read(tenantId);

    if (!snapshot.categories.some((c) => c.id === offer.categoryId)) {
      throw new CatalogueError(
        'UNKNOWN_CATEGORY',
        `Offer ${offer.id} names category ${offer.categoryId}, which does not exist.`
      );
    }

    // The key is what a decision flow selects on, so two offers sharing one
    // makes a flow's candidate list ambiguous — and the engine would pick
    // whichever the catalogue happened to list first.
    const clash = snapshot.offers.find((o) => o.key === offer.key && o.id !== offer.id);
    if (clash) {
      throw new CatalogueError(
        'DUPLICATE_KEY',
        `Offer key "${offer.key}" is already used by ${clash.id}. Keys are what a ` +
          'decision flow selects on, so two offers cannot share one.'
      );
    }

    const existed = snapshot.offers.some((o) => o.id === offer.id);
    await this.store.putOffer(tenantId, offer);
    await this.log(tenantId, actor, at, 'offer', offer.id, existed, offer.name);
    return offer;
  }

  async putCreative(tenantId: string, creative: Creative, actor: string, at: string) {
    const snapshot = await this.store.read(tenantId);
    if (!snapshot.offers.some((o) => o.id === creative.offerId)) {
      throw new CatalogueError(
        'UNKNOWN_OFFER',
        `Creative ${creative.id} is for offer ${creative.offerId}, which does not exist. ` +
          'Content with nothing to deliver is how a channel silently stops being covered.'
      );
    }
    const existed = snapshot.creatives.some((c) => c.id === creative.id);
    await this.store.putCreative(tenantId, creative);
    await this.log(tenantId, actor, at, 'creative', creative.id, existed, creative.name);
    return creative;
  }

  async putTargetingPolicy(tenantId: string, policy: TargetingPolicy, actor: string, at: string) {
    const existed = (await this.store.read(tenantId)).targetingPolicies.some(
      (p) => p.id === policy.id
    );
    await this.store.putTargetingPolicy(tenantId, policy);
    await this.log(tenantId, actor, at, 'targeting_policy', policy.id, existed, policy.name);
    return policy;
  }

  async putFrequencyPolicy(tenantId: string, policy: FrequencyPolicy, actor: string, at: string) {
    const existed = (await this.store.read(tenantId)).frequencyPolicies.some(
      (p) => p.id === policy.id
    );
    await this.store.putFrequencyPolicy(tenantId, policy);
    await this.log(tenantId, actor, at, 'frequency_policy', policy.id, existed, policy.name);
    return policy;
  }

  async putBoost(tenantId: string, boost: Boost, actor: string, at: string) {
    const existed = (await this.store.read(tenantId)).boosts.some((b) => b.id === boost.id);
    await this.store.putBoost(tenantId, boost);
    await this.log(tenantId, actor, at, 'boost', boost.id, existed, boost.name);
    return boost;
  }

  async putArbitration(tenantId: string, config: ArbitrationConfig, actor: string, at: string) {
    const existed = (await this.store.read(tenantId)).arbitration !== null;
    await this.store.putArbitration(tenantId, config);
    await this.log(tenantId, actor, at, 'arbitration', config.id, existed, 'Ranking function');
    return config;
  }

  /**
   * Deleting an offer that creatives still point at is refused.
   *
   * The alternative is cascading, which silently destroys content somebody
   * wrote. Making the caller remove the creatives first means the loss is a
   * decision rather than a side effect.
   */
  async deleteOffer(tenantId: string, offerId: string, actor: string, at: string) {
    const snapshot = await this.store.read(tenantId);
    const offer = snapshot.offers.find((o) => o.id === offerId);
    if (!offer) return false;

    const creatives = snapshot.creatives.filter((c) => c.offerId === offerId);
    if (creatives.length > 0) {
      throw new CatalogueError(
        'OFFER_IN_USE',
        `Offer ${offerId} still has ${creatives.length} creative(s): ` +
          `${creatives.map((c) => c.id).join(', ')}. Remove them first — cascading ` +
          'would destroy content somebody wrote as a side effect of a different action.'
      );
    }

    const deleted = await this.store.deleteOffer(tenantId, offerId);
    if (deleted) {
      await this.store.appendEvent({
        tenantId,
        at,
        actor,
        entity: 'offer',
        entityId: offerId,
        action: 'deleted',
        summary: `Deleted offer ${offer.name} (${offerId}).`,
      });
    }
    return deleted;
  }

  private log(
    tenantId: string,
    actor: string,
    at: string,
    entity: CatalogueEntity,
    entityId: string,
    existed: boolean,
    label: string
  ): Promise<CatalogueEvent> {
    return this.store.appendEvent({
      tenantId,
      at,
      actor,
      entity,
      entityId,
      action: existed ? 'updated' : 'created',
      summary: `${existed ? 'Updated' : 'Created'} ${entity.replace(/_/g, ' ')} ${label} (${entityId}).`,
    });
  }
}
