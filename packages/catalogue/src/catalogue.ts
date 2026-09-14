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
   * A connector is part of the snapshot the engine hashes, which is why it is
   * stored with the catalogue rather than beside the gateway: changing its field
   * mapping changes what a decision sees, and has to change the hash with it.
   */
  async putConnector(tenantId: string, connector: Connector, actor: string, at: string) {
    const existed = (await this.store.read(tenantId)).connectors.some((c) => c.id === connector.id);
    await this.store.putConnector(tenantId, connector);
    await this.log(tenantId, actor, at, 'connector', connector.id, existed, connector.name);
    return connector;
  }

  /**
   * A placement is read with the catalogue and not hashed with it: it governs
   * delivery, not what is decided. Its key is what a request names, so two
   * placements cannot share one — a request naming it would have two flows to
   * ask.
   */
  async putPlacement(tenantId: string, placement: Placement, actor: string, at: string) {
    const snapshot = await this.store.read(tenantId);
    const clash = snapshot.placements.find((p) => p.key === placement.key && p.id !== placement.id);
    if (clash) {
      throw new CatalogueError(
        'DUPLICATE_KEY',
        `Placement key "${placement.key}" is already used by ${clash.id}. A request names a ` +
          'placement by its key, so two placements cannot share one.'
      );
    }
    const existed = snapshot.placements.some((p) => p.id === placement.id);
    await this.store.putPlacement(tenantId, placement);
    await this.log(tenantId, actor, at, 'placement', placement.id, existed, placement.name);
    return placement;
  }

  /** The tenant's data model. One per tenant, so a put replaces it. */
  async putProfileSchema(tenantId: string, schema: ProfileSchema, actor: string, at: string) {
    const existed = (await this.store.read(tenantId)).profileSchema !== null;
    await this.store.putProfileSchema(tenantId, schema);
    await this.log(tenantId, actor, at, 'profile_schema', schema.id, existed, `version ${schema.version}`);
    return schema;
  }

  /**
   * An experiment's key becomes the field `experiments.<key>` in the decision
   * input, so two experiments cannot share one.
   */
  async putExperiment(tenantId: string, experiment: Experiment, actor: string, at: string) {
    const snapshot = await this.store.read(tenantId);
    const clash = snapshot.experiments.find((e) => e.key === experiment.key && e.id !== experiment.id);
    if (clash) {
      throw new CatalogueError(
        'DUPLICATE_KEY',
        `Experiment key "${experiment.key}" is already used by ${clash.id}. Its arm reaches the ` +
          'decision input at experiments.<key>, so two experiments cannot share one.'
      );
    }
    const existed = snapshot.experiments.some((e) => e.id === experiment.id);
    await this.store.putExperiment(tenantId, experiment);
    await this.log(tenantId, actor, at, 'experiment', experiment.id, existed, experiment.name);
    return experiment;
  }

  /**
   * Plain deletes, each recorded.
   *
   * What may be deleted — a policy no offer is bound to, a slot no creative
   * names, a creative that is not an active offer's last deliverable content —
   * is decided by the console before it calls these (G-038 records that the
   * console holds its own copy of the catalogue's rules). The log entry is
   * written here, so a deletion is answerable whoever made it.
   */
  async deleteCreative(tenantId: string, creativeId: string, actor: string, at: string) {
    const creative = (await this.store.read(tenantId)).creatives.find((c) => c.id === creativeId);
    if (!creative) return false;
    const deleted = await this.store.deleteCreative(tenantId, creativeId);
    if (deleted) await this.logDeleted(tenantId, actor, at, 'creative', creativeId, creative.name);
    return deleted;
  }

  async deleteTargetingPolicy(tenantId: string, policyId: string, actor: string, at: string) {
    const policy = (await this.store.read(tenantId)).targetingPolicies.find((p) => p.id === policyId);
    if (!policy) return false;
    const deleted = await this.store.deleteTargetingPolicy(tenantId, policyId);
    if (deleted) await this.logDeleted(tenantId, actor, at, 'targeting_policy', policyId, policy.name);
    return deleted;
  }

  async deletePlacement(tenantId: string, placementId: string, actor: string, at: string) {
    const placement = (await this.store.read(tenantId)).placements.find((p) => p.id === placementId);
    if (!placement) return false;
    const deleted = await this.store.deletePlacement(tenantId, placementId);
    if (deleted) await this.logDeleted(tenantId, actor, at, 'placement', placementId, placement.name);
    return deleted;
  }

  private logDeleted(
    tenantId: string,
    actor: string,
    at: string,
    entity: CatalogueEntity,
    entityId: string,
    label: string
  ): Promise<CatalogueEvent> {
    return this.store.appendEvent({
      tenantId,
      at,
      actor,
      entity,
      entityId,
      action: 'deleted',
      summary: `Deleted ${entity.replace(/_/g, ' ')} ${label} (${entityId}).`,
    });
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
