import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogueStore } from './types';
import { InMemoryCatalogueStore } from './memory-store';
import { PostgresCatalogueStore, type Queryable } from './postgres-store';

/**
 * Pick a catalogue store from the environment.
 *
 * Same contract as `createRegistryStore` and `createCatalogueStore`, and the same
 * reasoning: the default is deliberately the lossy one, because a console
 * started for five minutes of local work should not need a database — but a
 * *configured* database that cannot be reached is an error, never a silent
 * fallback to storage that forgets. For the catalogue that matters twice over,
 * because the loss is not noticed as an outage: the process comes back, the
 * console renders, and the engine decides against a catalogue nobody authored.
 */
export interface CatalogueHandle {
  store: CatalogueStore;
  kind: 'postgres' | 'memory';
  description: string;
  close(): Promise<void>;
}

export interface CreateCatalogueOptions {
  databaseUrl?: string;
  /** Apply the schema before returning. Safe to repeat; the DDL is idempotent. */
  migrate?: boolean;
}

export async function createCatalogueStore(
  options: CreateCatalogueOptions = {}
): Promise<CatalogueHandle> {
  const url = options.databaseUrl ?? process.env.METIS_DATABASE_URL;

  if (!url) {
    return {
      store: new InMemoryCatalogueStore(),
      kind: 'memory',
      description:
        'in memory — every offer, policy and boost is lost on restart, and the ' +
        'engine will decide against the seed rather than against what was ' +
        'authored. Set METIS_DATABASE_URL for durable storage.',
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
    store: new PostgresCatalogueStore(pool as unknown as Queryable),
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
  return fs.readFileSync(path.resolve(here, '../migrations/001_catalogue.sql'), 'utf8');
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
 * The same race the registry migration hit: `CREATE OR REPLACE FUNCTION` takes
 * an exclusive lock on the function's `pg_proc` row and the trigger statements
 * take one per table, so two processes running the DDL at once can acquire
 * them in opposite orders and deadlock. Every service instance runs this on
 * startup, and instances start together.
 *
 * Session-scoped rather than transaction-scoped, because the migration carries
 * its own BEGIN/COMMIT — through the pool the unlock could land on a different
 * connection than the lock. A different key again from the registry's and the
 * ledger's, so the three migrations do not serialise against each other for no
 * reason.
 */
const MIGRATION_LOCK_KEY = 0x63746c67; // 'ctlg'

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
