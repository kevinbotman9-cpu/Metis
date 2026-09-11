import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { runMigration } from '../src/create-store';
import { PostgresLedgerStore } from '../src/postgres-store';

/**
 * One migration run on an empty database produces the whole schema.
 *
 * The registry's migration did not (G-076): it added a column with an ALTER
 * that ran before its CREATE, so an empty database got the column only on a
 * second run, and CI — which migrates an empty database from two files at
 * once — failed whenever the wrong file took the lock first. That migration
 * and this one are written the same way and run the same way, and nothing
 * else checks this class: every other test here migrates a database some
 * other file may already have migrated, which is exactly what hides it.
 *
 * This migration passed on arrival. The check stays, because the next ALTER
 * added to a table that already exists is the same mistake waiting to be made.
 * Same shape as `packages/registry/tests/migration.test.ts`.
 */

const DATABASE_URL =
  process.env.METIS_TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/metis_registry_test';

/** Only ever used to create and drop the databases below. */
const admin = new Pool({ connectionString: DATABASE_URL, max: 2 });

let reachable = false;
try {
  reachable = (await admin.query('select 1')).rowCount === 1;
} catch {
  reachable = false;
}

const created: string[] = [];
const pools: Pool[] = [];

/** An empty database of its own, so no other file's migration can have run first. */
async function emptyDatabase(): Promise<Pool> {
  const name = `metis_migration_check_${process.pid}_${Date.now()}_${created.length}`;
  await admin.query(`CREATE DATABASE ${name}`);
  created.push(name);
  const url = new URL(DATABASE_URL);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 2 });
  pools.push(pool);
  return pool;
}

/** Columns, constraints, indexes and triggers, in a form two databases can be compared by. */
async function schemaOf(pool: Pool) {
  const rows = async (sql: string) => (await pool.query(sql)).rows;
  return {
    columns: await rows(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, column_name`),
    constraints: await rows(`
      SELECT conrelid::regclass::text AS on_table, conname, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace
       ORDER BY on_table, conname`),
    indexes: await rows(`
      SELECT tablename, indexname, indexdef
        FROM pg_indexes
       WHERE schemaname = 'public'
       ORDER BY tablename, indexname`),
    triggers: await rows(`
      SELECT event_object_table, trigger_name, action_timing, event_manipulation, action_statement
        FROM information_schema.triggers
       WHERE trigger_schema = 'public'
       ORDER BY event_object_table, trigger_name, event_manipulation`),
  };
}

if (!reachable) {
  it.skip(`postgres at ${DATABASE_URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  describe('the ledger migration on an empty database', () => {
    afterAll(async () => {
      await Promise.all(pools.map((p) => p.end()));
      for (const name of created) {
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      }
      await admin.end();
    });

    it('produces, in one run, the schema that two runs produce', async () => {
      const db = await emptyDatabase();
      await runMigration(db);
      const once = await schemaOf(db);
      await runMigration(db);
      const twice = await schemaOf(db);

      expect(once.columns.length, 'the migration created no columns at all').toBeGreaterThan(0);
      // The append-only triggers are the ledger's whole guarantee, so their
      // absence after one run would be the worst version of this defect.
      expect(once.triggers.length, 'the migration created no triggers').toBeGreaterThan(0);
      expect(once).toEqual(twice);
    });

    it('leaves the store able to read after one run', async () => {
      // Every read the store makes, against tables nothing has written to.
      const db = await emptyDatabase();
      await runMigration(db);
      const store = new PostgresLedgerStore(db);

      await expect(store.get('telco-uk', 'no-such-decision')).resolves.toBeUndefined();
      await expect(store.query({ tenantId: 'telco-uk' })).resolves.toEqual([]);
      await expect(store.outcomesFor('telco-uk', 'no-such-decision')).resolves.toEqual([]);
      await expect(store.deliveriesFor('telco-uk', 'no-such-decision')).resolves.toEqual([]);
      await expect(store.idempotency.get('telco-uk', 'no-such-key')).resolves.toBeUndefined();
    });
  });
}
