import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  migrate,
  verifyMigrations,
  type Connectable,
  type MigrateResult,
  type VerifyResult,
} from '@metis/core/migrate';

/** Where this store's numbered migrations live: `001_keys.sql` onward. */
export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

/** Distinct from the other stores' keys, so they do not queue behind each other. */
const MIGRATION_LOCK_KEY = 0x6b657973; // 'keys'

/**
 * Check this store's schema against the migrations this code carries, changing
 * nothing, and refuse if the database is behind. ADR-016 §3.1.
 */
export function verifySchema(pool: { query(text: string, values?: unknown[]): Promise<unknown> }): Promise<VerifyResult> {
  return verifyMigrations(pool, { component: 'keys', dir: MIGRATIONS_DIR });
}

export function runMigration(pool: Connectable, options: { to?: number } = {}): Promise<MigrateResult> {
  return migrate(pool, { component: 'keys', dir: MIGRATIONS_DIR, lockKey: MIGRATION_LOCK_KEY, to: options.to });
}
