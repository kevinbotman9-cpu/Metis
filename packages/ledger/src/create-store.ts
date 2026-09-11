import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, type Connectable, type MigrateResult } from '@metis/core/migrate';
import type { LedgerStore } from './ledger';
import { InMemoryLedgerStore } from './memory-store';
import { PostgresLedgerStore, type Queryable } from './postgres-store';

/**
 * Pick a ledger store from the environment.
 *
 * Same contract as `createRegistryStore`, and the same reasoning: the default
 * is deliberately the lossy one, because a console started for five minutes of
 * local work should not need a database — but a *configured* database that
 * cannot be reached is an error, never a silent fallback to storage that
 * forgets. Falling back would turn a deployment fault into a data-loss incident
 * discovered days later, and for the decision ledger that means losing the
 * audit record of what was decided.
 */
export interface LedgerHandle {
  store: LedgerStore;
  kind: 'postgres' | 'memory';
  description: string;
  close(): Promise<void>;
}

export interface CreateLedgerOptions {
  databaseUrl?: string;
  /**
   * Apply any migration this database has not run before returning. Safe to
   * repeat: each file runs once, and a database that disagrees with the files
   * is refused rather than patched.
   */
  migrate?: boolean;
}

export async function createLedgerStore(
  options: CreateLedgerOptions = {}
): Promise<LedgerHandle> {
  const url = options.databaseUrl ?? process.env.METIS_DATABASE_URL;

  if (!url) {
    return {
      store: new InMemoryLedgerStore(),
      kind: 'memory',
      description:
        'in memory — every decision and outcome is lost on restart, and a retry ' +
        'after a restart will not find its original decision. Set METIS_DATABASE_URL ' +
        'for durable storage.',
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
    store: new PostgresLedgerStore(pool as unknown as Queryable),
    kind: 'postgres',
    description: `postgres at ${redact(url)}`,
    async close() {
      await pool.end();
    },
  };
}

/** Where this store's numbered migrations live: `001_ledger.sql` onward. */
export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations'
);

/**
 * This store's advisory lock key — the same reasoning as the registry's, and a
 * different constant, so the stores do not queue behind each other.
 */
const MIGRATION_LOCK_KEY = 0x6c656467; // 'ledg'

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
    component: 'ledger',
    dir: MIGRATIONS_DIR,
    lockKey: MIGRATION_LOCK_KEY,
    to: options.to,
  });
}

function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
}
