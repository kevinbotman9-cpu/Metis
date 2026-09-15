import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  migrate,
  migrationModeOf,
  verifyMigrations,
  type Connectable,
  type MigrateResult,
  type MigrationMode,
  type VerifyResult,
} from '@metis/core/migrate';
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
  /**
   * Apply any migration this database has not run before returning. Safe to
   * repeat: each file runs once, and a database that disagrees with the files
   * is refused rather than patched.
   */
  migrate?: boolean;
  /**
   * Apply migrations, or only verify the database is at this code's version
   * and refuse if it is behind. ADR-016 §3.1. Defaults to `METIS_MIGRATIONS`,
   * then to verify in a production build and apply anywhere else. Ignored when
   * `migrate` is false.
   */
  migrations?: MigrationMode;
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
    const mode = options.migrations ?? migrationModeOf(process.env);
    try {
      // A service outside development never changes a schema on start: the
      // migration job does that once per release, and a service only checks it
      // ran (ADR-016 §3).
      if (mode === 'verify') await verifySchema(pool as unknown as Parameters<typeof verifySchema>[0]);
      else await runMigration(pool);
    } catch (e) {
      await pool.end().catch(() => {});
      throw e;
    }
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

/** Where this store's numbered migrations live: `001_catalogue.sql` onward. */
export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations'
);

/**
 * This store's advisory lock key — the same reasoning as the registry's, and a
 * different constant again, so the three stores do not queue behind each other.
 */
const MIGRATION_LOCK_KEY = 0x63746c67; // 'ctlg'

/**
 * Check this store's schema against the migrations this code carries, changing
 * nothing, and refuse if the database is behind. ADR-016 §3.1.
 */
export function verifySchema(pool: { query(text: string, values?: unknown[]): Promise<unknown> }): Promise<VerifyResult> {
  return verifyMigrations(pool, { component: 'catalogue', dir: MIGRATIONS_DIR });
}

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
    component: 'catalogue',
    dir: MIGRATIONS_DIR,
    lockKey: MIGRATION_LOCK_KEY,
    to: options.to,
  });
}

function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
}
