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
    await pool.query(readMigration());
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

function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
}
