import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, type Connectable, type MigrateResult } from '@metis/core/migrate';
import type { GovernanceStore } from './types';
import { InMemoryGovernanceStore } from './memory-store';
import { PostgresGovernanceStore, type Queryable } from './postgres-store';

/**
 * Pick a governance store from the environment.
 *
 * The same contract as the registry, the ledger and the catalogue:
 * `METIS_DATABASE_URL` chooses PostgreSQL, its absence chooses memory, and a
 * configured database that cannot be reached is an error rather than a silent
 * fall back. For governance the silent version would be an approval nobody can
 * find afterwards, beside the edit it approved.
 */
export interface GovernanceHandle {
  store: GovernanceStore;
  kind: 'postgres' | 'memory';
  description: string;
  close(): Promise<void>;
}

export interface CreateGovernanceOptions {
  databaseUrl?: string;
  /** Apply any migration this database has not run before returning. */
  migrate?: boolean;
}

export async function createGovernanceStore(
  options: CreateGovernanceOptions = {}
): Promise<GovernanceHandle> {
  const url = options.databaseUrl ?? process.env.METIS_DATABASE_URL;

  if (!url) {
    return {
      store: new InMemoryGovernanceStore(),
      kind: 'memory',
      description:
        'in memory — every change set decision and audit event is lost on restart. ' +
        'Set METIS_DATABASE_URL for durable storage.',
      async close() {},
    };
  }

  // Imported lazily so a deployment with no database does not need the driver.
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url });

  try {
    await pool.query('select 1');
  } catch (e) {
    await pool.end().catch(() => {});
    throw new Error(
      `METIS_DATABASE_URL is set but the database is not reachable: ${(e as Error).message}`
    );
  }

  if (options.migrate !== false) {
    await runMigration(pool);
  }

  return {
    store: new PostgresGovernanceStore(pool as unknown as Queryable),
    kind: 'postgres',
    description: `postgres at ${redact(url)}`,
    async close() {
      await pool.end();
    },
  };
}

/** Where this store's numbered migrations live: `001_governance.sql` onward. */
export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations'
);

/** Distinct from the other stores' keys, so they do not queue behind each other. */
const MIGRATION_LOCK_KEY = 0x676f7672; // 'govr'

export function runMigration(
  pool: Connectable,
  options: { to?: number } = {}
): Promise<MigrateResult> {
  return migrate(pool, {
    component: 'governance',
    dir: MIGRATIONS_DIR,
    lockKey: MIGRATION_LOCK_KEY,
    to: options.to,
  });
}

function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
}
