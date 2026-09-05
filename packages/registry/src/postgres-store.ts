import type { RegistryStore } from './registry';
import type { Environment, EnvironmentState, PublishedVersion, RegistryEvent } from './types';

/**
 * Durable storage for the registry.
 *
 * Typed against a minimal `Queryable` rather than against `pg` directly, so a
 * `pg.Pool`, a pooled client inside a transaction, or a test harness that
 * wraps each case in a rolled-back transaction all satisfy it. Adding a
 * dependency on a specific driver here would put a driver between the registry
 * and its own tests.
 *
 * Two things the schema does that this class deliberately does not:
 *
 *   - Immutability. `registry_versions` and `registry_events` carry triggers
 *     rejecting UPDATE and DELETE. Enforced only here it would be a
 *     convention that survives exactly until somebody writes a migration
 *     script or an admin query.
 *   - Sequence numbers. `seq` is a bigserial, so the ordering of the event log
 *     is assigned by the database rather than by whichever process happened to
 *     be writing.
 */

export interface QueryResult<R> {
  rows: R[];
}

export interface Queryable {
  query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

/** Rows as Postgres returns them, before mapping onto the domain. */
interface VersionRow {
  tenant_id: string;
  flow_name: string;
  version: string;
  artifact: unknown;
  published_at: Date | string;
  published_by: string;
  warnings: unknown;
}

interface EnvironmentRow {
  environment: string;
  active_version: string | null;
  previous_version: string | null;
  promoted_at: Date | string | null;
  promoted_by: string | null;
}

interface EventRow {
  seq: string | number;
  at: Date | string;
  actor: string;
  type: string;
  tenant_id: string;
  flow_name: string;
  version: string;
  environment: string | null;
  summary: string;
  diagnostics: unknown;
}

/**
 * Timestamps come back as `Date` from `pg` and as strings from some pools.
 *
 * The domain carries ISO strings because they are what the engine and the
 * canonical hasher work in, and because a `Date` would reintroduce a
 * timezone-shaped ambiguity into something that has to compare exactly.
 */
function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class PostgresRegistryStore implements RegistryStore {
  constructor(private readonly db: Queryable) {}

  // --- Versions -------------------------------------------------------------

  async getVersion(
    tenantId: string,
    name: string,
    version: string
  ): Promise<PublishedVersion | undefined> {
    const { rows } = await this.db.query<VersionRow>(
      `SELECT tenant_id, flow_name, version, artifact, published_at, published_by, warnings
         FROM registry_versions
        WHERE tenant_id = $1 AND flow_name = $2 AND version = $3`,
      [tenantId, name, version]
    );
    return rows[0] ? this.toVersion(rows[0]) : undefined;
  }

  async listVersions(tenantId: string, name: string): Promise<PublishedVersion[]> {
    const { rows } = await this.db.query<VersionRow>(
      `SELECT tenant_id, flow_name, version, artifact, published_at, published_by, warnings
         FROM registry_versions
        WHERE tenant_id = $1 AND flow_name = $2
        ORDER BY published_at DESC, version DESC`,
      [tenantId, name]
    );
    return rows.map((r) => this.toVersion(r));
  }

  async putVersion(v: PublishedVersion): Promise<void> {
    // No ON CONFLICT clause. The registry checks for an existing version before
    // calling, and a race that got past it should fail loudly rather than
    // silently overwrite a published artifact — which the UPDATE trigger would
    // refuse anyway, but a unique violation is the clearer error.
    await this.db.query(
      `INSERT INTO registry_versions
         (tenant_id, flow_name, version, artifact, artifact_hash, published_at, published_by, warnings)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb)`,
      [
        v.tenantId,
        v.flowName,
        v.version,
        JSON.stringify(v.artifact),
        v.artifact.artifactHash,
        v.publishedAt,
        v.publishedBy,
        JSON.stringify(v.warnings),
      ]
    );
  }

  private toVersion(r: VersionRow): PublishedVersion {
    return {
      tenantId: r.tenant_id,
      flowName: r.flow_name,
      version: r.version,
      artifact: r.artifact as PublishedVersion['artifact'],
      publishedAt: iso(r.published_at),
      publishedBy: r.published_by,
      warnings: (r.warnings ?? []) as PublishedVersion['warnings'],
    };
  }

  // --- Environments ---------------------------------------------------------

  async getEnvironment(
    tenantId: string,
    name: string,
    env: Environment
  ): Promise<EnvironmentState | undefined> {
    const { rows } = await this.db.query<EnvironmentRow>(
      `SELECT environment, active_version, previous_version, promoted_at, promoted_by
         FROM registry_environments
        WHERE tenant_id = $1 AND flow_name = $2 AND environment = $3`,
      [tenantId, name, env]
    );
    return rows[0] ? this.toEnvironment(rows[0]) : undefined;
  }

  async putEnvironment(tenantId: string, name: string, state: EnvironmentState): Promise<void> {
    // The pointer is the one mutable thing in this schema, which is what an
    // environment is: a name for whatever is currently running.
    await this.db.query(
      `INSERT INTO registry_environments
         (tenant_id, flow_name, environment, active_version, previous_version, promoted_at, promoted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, flow_name, environment) DO UPDATE
          SET active_version   = EXCLUDED.active_version,
              previous_version = EXCLUDED.previous_version,
              promoted_at      = EXCLUDED.promoted_at,
              promoted_by      = EXCLUDED.promoted_by`,
      [
        tenantId,
        name,
        state.environment,
        state.activeVersion,
        state.previousVersion,
        state.promotedAt,
        state.promotedBy,
      ]
    );
  }

  async listEnvironments(tenantId: string, name: string): Promise<EnvironmentState[]> {
    const { rows } = await this.db.query<EnvironmentRow>(
      `SELECT environment, active_version, previous_version, promoted_at, promoted_by
         FROM registry_environments
        WHERE tenant_id = $1 AND flow_name = $2
        ORDER BY environment`,
      [tenantId, name]
    );
    return rows.map((r) => this.toEnvironment(r));
  }

  private toEnvironment(r: EnvironmentRow): EnvironmentState {
    return {
      environment: r.environment,
      activeVersion: r.active_version,
      previousVersion: r.previous_version,
      promotedAt: r.promoted_at ? iso(r.promoted_at) : null,
      promotedBy: r.promoted_by,
    };
  }

  // --- Events ---------------------------------------------------------------

  async appendEvent(event: Omit<RegistryEvent, 'seq'>): Promise<RegistryEvent> {
    const { rows } = await this.db.query<{ seq: string | number }>(
      `INSERT INTO registry_events
         (at, actor, type, tenant_id, flow_name, version, environment, summary, diagnostics)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING seq`,
      [
        event.at,
        event.actor,
        event.type,
        event.tenantId,
        event.flowName,
        event.version,
        event.environment ?? null,
        event.summary,
        event.diagnostics ? JSON.stringify(event.diagnostics) : null,
      ]
    );
    return { ...event, seq: Number(rows[0].seq) };
  }

  async listEvents(filter?: {
    tenantId?: string;
    flowName?: string;
    limit?: number;
  }): Promise<RegistryEvent[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter?.tenantId) {
      values.push(filter.tenantId);
      where.push(`tenant_id = $${values.length}`);
    }
    if (filter?.flowName) {
      values.push(filter.flowName);
      where.push(`flow_name = $${values.length}`);
    }

    let sql =
      `SELECT seq, at, actor, type, tenant_id, flow_name, version, environment, summary, diagnostics
         FROM registry_events` +
      (where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '') +
      // Newest first, by sequence rather than timestamp: two events can share a
      // timestamp and the sequence cannot.
      ` ORDER BY seq DESC`;

    if (filter?.limit !== undefined) {
      values.push(filter.limit);
      sql += ` LIMIT $${values.length}`;
    }

    const { rows } = await this.db.query<EventRow>(sql, values);
    return rows.map((r) => ({
      seq: Number(r.seq),
      at: iso(r.at),
      actor: r.actor,
      type: r.type as RegistryEvent['type'],
      tenantId: r.tenant_id,
      flowName: r.flow_name,
      version: r.version,
      // Absent rather than null, so the shape matches what the in-memory store
      // produces and the shared suite can compare them.
      ...(r.environment ? { environment: r.environment } : {}),
      summary: r.summary,
      ...(r.diagnostics ? { diagnostics: r.diagnostics as RegistryEvent['diagnostics'] } : {}),
    }));
  }

  // --- Flows -----------------------------------------------------------

  async listFlows(tenantId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ flow_name: string }>(
      `SELECT DISTINCT flow_name FROM registry_versions WHERE tenant_id = $1 ORDER BY flow_name`,
      [tenantId]
    );
    return rows.map((r) => r.flow_name);
  }
}
