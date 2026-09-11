import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, type Connectable, type MigrateResult } from '@metis/core/migrate';
import type { RegistryStore } from './registry';
import { InMemoryRegistryStore } from './memory-store';
import { PostgresRegistryStore, type Queryable } from './postgres-store';

/**
 * Pick a store from the environment.
 *
 * `METIS_DATABASE_URL` chooses PostgreSQL; without it the registry runs in
 * memory and loses everything on restart. Both satisfy the same interface and
 * pass the same behaviour suite, so this is a deployment choice rather than a
 * behavioural one.
 *
 * The default is deliberately the lossy one. A console started for five minutes
 * of local work should not need a database, and a service that silently fell
 * back to in-memory when its database was unreachable would be worse than one
 * that refuses to start — so the fallback is only ever taken when no URL was
 * configured at all, never when a configured one fails to connect.
 */
export interface StoreHandle {
  store: RegistryStore;
  /** What was chosen, for a startup line worth printing. */
  kind: 'postgres' | 'memory';
  description: string;
  close(): Promise<void>;
}

export interface CreateStoreOptions {
  databaseUrl?: string;
  /**
   * Apply any migration this database has not run before returning. Safe to
   * repeat: each file runs once, and a database that disagrees with the files
   * is refused rather than patched.
   */
  migrate?: boolean;
}

export async function createRegistryStore(
  options: CreateStoreOptions = {}
): Promise<StoreHandle> {
  const url = options.databaseUrl ?? process.env.METIS_DATABASE_URL;

  if (!url) {
    return {
      store: new InMemoryRegistryStore(),
      kind: 'memory',
      description:
        'in memory — every published version is lost on restart. Set METIS_DATABASE_URL for durable storage.',
      async close() {},
    };
  }

  // Imported lazily so a deployment with no database does not need the driver
  // installed at all.
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url });

  try {
    await pool.query('select 1');
  } catch (e) {
    await pool.end().catch(() => {});
    // Not a fallback. A configured database that cannot be reached is a
    // deployment fault, and starting anyway with storage that forgets would
    // turn it into a data-loss incident discovered days later.
    throw new Error(
      `METIS_DATABASE_URL is set but the database is not reachable: ${(e as Error).message}`
    );
  }

  if (options.migrate !== false) {
    await runMigration(pool);
  }

  return {
    store: new PostgresRegistryStore(pool as unknown as Queryable),
    kind: 'postgres',
    description: `postgres at ${redact(url)}`,
    async close() {
      await pool.end();
    },
  };
}

/** Where this store's numbered migrations live: `001_registry.sql` onward. */
export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations'
);

/**
 * This store's advisory lock key.
 *
 * Every service instance migrates on startup and instances start together, so
 * the runner serialises them: two running DDL at once can deadlock on the
 * function and trigger locks, and before the runner, two applying the old file
 * in the wrong order left a column out (G-076). An arbitrary constant, distinct
 * from the ledger's and the catalogue's so the three do not queue behind each
 * other for no reason.
 */
const MIGRATION_LOCK_KEY = 0x6d657469; // 'meti'

/**
 * Bring the database up to this store's migrations. `@metis/core/migrate` says
 * what it refuses and why; `to` stops at an earlier version, for the checks
 * that build a database as an older release left it.
 */
export function runMigration(
  pool: Connectable,
  options: { to?: number } = {}
): Promise<MigrateResult> {
  return migrate(pool, {
    component: 'registry',
    dir: MIGRATIONS_DIR,
    lockKey: MIGRATION_LOCK_KEY,
    to: options.to,
  });
}

function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
}
