import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  /** Apply the schema before returning. Safe to repeat; the DDL is idempotent. */
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

/** The schema, as committed. */
export function readMigration(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../migrations/001_registry.sql'), 'utf8');
}

/** A pool that can hand out a dedicated connection, which the lock below needs. */
export interface Connectable {
  connect(): Promise<{
    query(text: string, values?: unknown[]): Promise<unknown>;
    release(): void;
  }>;
}

/**
 * Apply the schema, under a lock, on one connection.
 *
 * The DDL is idempotent but not concurrency-safe: `CREATE OR REPLACE FUNCTION`
 * takes an exclusive lock on the function's `pg_proc` row and the trigger
 * statements take one on each table, so two processes running it at once can
 * take those locks in opposite orders and deadlock. That is not a test
 * artefact — every service instance runs this on startup, and instances start
 * together.
 *
 * An advisory lock is the fix rather than reordering the statements, because
 * the ordering that deadlocks today is not the only ordering a future
 * migration could introduce. The key is an arbitrary constant, namespaced to
 * this schema.
 *
 * Session-scoped rather than transaction-scoped, because the migration carries
 * its own BEGIN/COMMIT — so it must be taken on a checked-out client, not
 * through the pool, or the unlock could land on a different connection than the
 * lock.
 */
const MIGRATION_LOCK_KEY = 0x6d657469; // 'meti'

export async function runMigration(pool: Connectable): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      await client.query(readMigration());
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
}
