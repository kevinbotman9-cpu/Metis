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
 * The catalogue on PostgreSQL.
 *
 * Takes a `Queryable` rather than a `Pool` for the same reason the registry
 * does: the caller owns the connection lifecycle, and a store that opened its
 * own would make two of them two pools.
 */
export interface Queryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

export class PostgresCatalogueStore implements CatalogueStore {
  constructor(private readonly db: Queryable) {}

  /**
   * The whole catalogue in one round trip.
   *
   * Eight queries rather than eight round trips would still be eight moments;
   * this is deliberately a single statement so the snapshot is consistent.
   * The engine hashes what it reads, and a hash over a mixture of two moments
   * is a hash of something that never existed.
   */
  async read(tenantId: string): Promise<CatalogueSnapshotRecord> {
    const { rows } = await this.db.query<{ source: string; body: unknown }>(
      `SELECT 'objective' AS source, body FROM catalogue_objectives WHERE tenant_id = $1
       UNION ALL SELECT 'category', body FROM catalogue_categories WHERE tenant_id = $1
       UNION ALL SELECT 'offer', body FROM catalogue_offers WHERE tenant_id = $1
       UNION ALL SELECT 'creative', body FROM catalogue_creatives WHERE tenant_id = $1
       UNION ALL SELECT 'targeting', body FROM catalogue_targeting_policies WHERE tenant_id = $1
       UNION ALL SELECT 'frequency', body FROM catalogue_frequency_policies WHERE tenant_id = $1
       UNION ALL SELECT 'boost', body FROM catalogue_boosts WHERE tenant_id = $1
       UNION ALL SELECT 'arbitration', body FROM catalogue_arbitration WHERE tenant_id = $1`,
      [tenantId]
    );

    const snapshot: CatalogueSnapshotRecord = {
      objectives: [],
      categories: [],
      offers: [],
      creatives: [],
      targetingPolicies: [],
      frequencyPolicies: [],
      boosts: [],
      arbitration: null,
    };

    for (const row of rows) {
      switch (row.source) {
        case 'objective':
          snapshot.objectives.push(row.body as Objective);
          break;
        case 'category':
          snapshot.categories.push(row.body as Category);
          break;
        case 'offer':
          snapshot.offers.push(row.body as Offer);
          break;
        case 'creative':
          snapshot.creatives.push(row.body as Creative);
          break;
        case 'targeting':
          snapshot.targetingPolicies.push(row.body as TargetingPolicy);
          break;
        case 'frequency':
          snapshot.frequencyPolicies.push(row.body as FrequencyPolicy);
          break;
        case 'boost':
          snapshot.boosts.push(row.body as Boost);
          break;
        case 'arbitration':
          snapshot.arbitration = row.body as ArbitrationConfig;
          break;
      }
    }

    // Sorted by id so two reads of unchanged data are identical. Postgres
    // makes no ordering promise without ORDER BY, and the engine hashes this.
    const byId = <T extends { id: string }>(list: T[]) =>
      list.sort((a, b) => a.id.localeCompare(b.id));
    byId(snapshot.objectives);
    byId(snapshot.categories);
    byId(snapshot.offers);
    byId(snapshot.creatives);
    byId(snapshot.targetingPolicies);
    byId(snapshot.frequencyPolicies);
    byId(snapshot.boosts);

    return snapshot;
  }

  async putObjective(tenantId: string, o: Objective): Promise<void> {
    await this.db.query(
      `INSERT INTO catalogue_objectives (tenant_id, id, name, body, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (tenant_id, id) DO UPDATE
         SET name = EXCLUDED.name, body = EXCLUDED.body, updated_at = now()`,
      [tenantId, o.id, o.name, JSON.stringify(o)]
    );
  }

  async putCategory(tenantId: string, c: Category): Promise<void> {
    await this.db.query(
      `INSERT INTO catalogue_categories (tenant_id, id, objective_id, name, body, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (tenant_id, id) DO UPDATE
         SET objective_id = EXCLUDED.objective_id, name = EXCLUDED.name,
             body = EXCLUDED.body, updated_at = now()`,
      [tenantId, c.id, c.objectiveId, c.name, JSON.stringify(c)]
    );
  }

  async putOffer(tenantId: string, o: Offer): Promise<void> {
    await this.db.query(
      `INSERT INTO catalogue_offers (tenant_id, id, category_id, key, status, body, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (tenant_id, id) DO UPDATE
         SET category_id = EXCLUDED.category_id, key = EXCLUDED.key,
             status = EXCLUDED.status, body = EXCLUDED.body, updated_at = now()`,
      [tenantId, o.id, o.categoryId, o.key, o.status, JSON.stringify(o)]
    );
  }

  async putCreative(tenantId: string, c: Creative): Promise<void> {
    await this.db.query(
      `INSERT INTO catalogue_creatives (tenant_id, id, offer_id, channel, body, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (tenant_id, id) DO UPDATE
         SET offer_id = EXCLUDED.offer_id, channel = EXCLUDED.channel,
             body = EXCLUDED.body, updated_at = now()`,
      [tenantId, c.id, c.offerId, c.channel, JSON.stringify(c)]
    );
  }

  async putTargetingPolicy(tenantId: string, p: TargetingPolicy): Promise<void> {
    await this.db.query(
      `INSERT INTO catalogue_targeting_policies (tenant_id, id, kind, body, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (tenant_id, id) DO UPDATE
         SET kind = EXCLUDED.kind, body = EXCLUDED.body, updated_at = now()`,
      [tenantId, p.id, p.kind, JSON.stringify(p)]
    );
  }

  async putFrequencyPolicy(tenantId: string, p: FrequencyPolicy): Promise<void> {
    await this.db.query(
      `INSERT INTO catalogue_frequency_policies (tenant_id, id, body, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (tenant_id, id) DO UPDATE
         SET body = EXCLUDED.body, updated_at = now()`,
      [tenantId, p.id, JSON.stringify(p)]
    );
  }

  async putBoost(tenantId: string, b: Boost): Promise<void> {
    await this.db.query(
      `INSERT INTO catalogue_boosts (tenant_id, id, body, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (tenant_id, id) DO UPDATE
         SET body = EXCLUDED.body, updated_at = now()`,
      [tenantId, b.id, JSON.stringify(b)]
    );
  }

  async putArbitration(tenantId: string, a: ArbitrationConfig): Promise<void> {
    await this.db.query(
      `INSERT INTO catalogue_arbitration (tenant_id, body, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (tenant_id) DO UPDATE
         SET body = EXCLUDED.body, updated_at = now()`,
      [tenantId, JSON.stringify(a)]
    );
  }

  async deleteOffer(tenantId: string, offerId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      'DELETE FROM catalogue_offers WHERE tenant_id = $1 AND id = $2',
      [tenantId, offerId]
    );
    return (rowCount ?? 0) > 0;
  }

  async appendEvent(event: Omit<CatalogueEvent, 'seq'>): Promise<CatalogueEvent> {
    const { rows } = await this.db.query<{ seq: string }>(
      `INSERT INTO catalogue_events (tenant_id, at, actor, entity, entity_id, action, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING seq`,
      [
        event.tenantId,
        event.at,
        event.actor,
        event.entity,
        event.entityId,
        event.action,
        event.summary,
      ]
    );
    return { ...event, seq: Number(rows[0].seq) };
  }

  async listEvents(filter?: {
    tenantId?: string;
    entity?: CatalogueEntity;
    limit?: number;
  }): Promise<CatalogueEvent[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter?.tenantId) {
      values.push(filter.tenantId);
      where.push(`tenant_id = $${values.length}`);
    }
    if (filter?.entity) {
      values.push(filter.entity);
      where.push(`entity = $${values.length}`);
    }

    let sql =
      `SELECT seq, tenant_id, at, actor, entity, entity_id, action, summary
         FROM catalogue_events` +
      (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
      ' ORDER BY seq DESC';
    if (filter?.limit) {
      values.push(filter.limit);
      sql += ` LIMIT $${values.length}`;
    }

    const { rows } = await this.db.query<{
      seq: string;
      tenant_id: string;
      at: Date | string;
      actor: string;
      entity: string;
      entity_id: string;
      action: string;
      summary: string;
    }>(sql, values);

    return rows.map((r) => ({
      seq: Number(r.seq),
      tenantId: r.tenant_id,
      // Normalised to an ISO string: `pg` hands back a Date, and the memory
      // store holds what it was given. The suite compares the two.
      at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
      actor: r.actor,
      entity: r.entity as CatalogueEntity,
      entityId: r.entity_id,
      action: r.action as CatalogueEvent['action'],
      summary: r.summary,
    }));
  }

  async listTenants(): Promise<string[]> {
    const { rows } = await this.db.query<{ tenant_id: string }>(
      `SELECT DISTINCT tenant_id FROM catalogue_objectives
       UNION SELECT DISTINCT tenant_id FROM catalogue_offers
       ORDER BY tenant_id`
    );
    return rows.map((r) => r.tenant_id);
  }
}
