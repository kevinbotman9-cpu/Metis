import { it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresKeyStore, runMigration } from '../src';
import { describeKeyStore } from './suite';

/**
 * The same suite against a real PostgreSQL: the one that can refuse to change
 * an erasure record. Skipped rather than failed when no database is reachable;
 * CI runs a postgres service.
 */

const URL =
  process.env.METIS_TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/metis_registry_test';

const pool = new Pool({ connectionString: URL, max: 4 });

let reachable = false;
try {
  reachable = (await pool.query('select 1')).rowCount === 1;
} catch {
  reachable = false;
}

if (!reachable) {
  it.skip(`postgres at ${URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  await runMigration(pool);

  describeKeyStore('key store over postgres', {
    async create() {
      // TRUNCATE gets past the append-only trigger, which refuses row by row.
      await pool.query('TRUNCATE key_tenants, subject_keys, erasures RESTART IDENTITY');
      return new PostgresKeyStore(pool);
    },
    async enforcesAppendOnly() {
      await expect(pool.query(`UPDATE erasures SET erased_by = 'someone else'`)).rejects.toThrow(/append-only/);
      await expect(pool.query('DELETE FROM erasures')).rejects.toThrow(/append-only/);
    },
  });

  afterAll(async () => {
    await pool.end();
  });
}
