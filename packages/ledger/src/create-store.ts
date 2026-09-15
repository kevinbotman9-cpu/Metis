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

/**
 * What kind of data a deployment holds. ADR-016 §4.
 *
 * `synthetic` — fixtures, test data, a demo. `real` — customer references and
 * attributes that belong to somebody.
 */
export type DataClass = 'synthetic' | 'real';

/**
 * How this store protects the subject a decision is about. ADR-016 §4.2.
 *
 * `none` today: `decision_records.record` holds `customerRef` in clear beside
 * `subject_hash`, and the hash is unkeyed (G-068). ADR-004's points 1–3 —
 * per-subject encryption of the whole record, a per-subject-keyed subject
 * column, and a rule for free-form columns — change this, and the change is
 * proved by a test that decrypts nothing without a subject key. It is a
 * constant of the code on purpose: a setting could be flipped by whoever wants
 * the refusal gone.
 */
export const SUBJECT_PROTECTION: 'none' | 'per-subject-key' = 'none';

/**
 * Read `METIS_DATA_CLASS`, refusing anything but the two declared values.
 *
 * `undefined` when the variable is unset. The ledger's refusal treats that as
 * not `real`, so a developer's console needs nothing; a built image must set it,
 * and the decision service refuses to start without it (ADR-016 §4.1).
 */
export function dataClassOf(value: string | undefined): DataClass | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === 'synthetic' || value === 'real') return value;
  throw new Error(`METIS_DATA_CLASS must be 'synthetic' or 'real', not '${value}'.`);
}

export interface CreateLedgerOptions {
  databaseUrl?: string;
  /** Defaults to `METIS_DATA_CLASS`. ADR-016 §4. */
  dataClass?: DataClass;
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

  // ADR-004's constraint as a refusal rather than a sentence (ADR-016 §4.2): no
  // deployment writes the ledger to PostgreSQL with real customer references
  // while the store holds them in clear. Before connecting, so the refusal does
  // not depend on the database being there, and in the same shape as the
  // refusal of an unreachable one. Memory is allowed: it keeps nothing.
  const dataClass = options.dataClass ?? dataClassOf(process.env.METIS_DATA_CLASS);
  if (dataClass === 'real' && SUBJECT_PROTECTION === 'none') {
    throw new Error(
      'METIS_DATA_CLASS is real and METIS_DATABASE_URL is set, but this ledger stores the customer ' +
        'reference in clear (subject protection: none). ADR-004 forbids writing real customer ' +
        'references to PostgreSQL until per-subject encryption exists; G-068 records the gap. ' +
        'Refusing to start.'
    );
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
