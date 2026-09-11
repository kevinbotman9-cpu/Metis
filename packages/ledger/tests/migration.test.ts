import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readMigrations } from '@metis/core/migrate';
import { runMigration, MIGRATIONS_DIR } from '../src/create-store';
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
 * This migration passed on arrival. Since G-077 it is a numbered file the
 * runner applies once and records, and the checks here hold it to that: one
 * run is the whole schema, and a database at any earlier version reaches it.
 * The runner's own refusals are proved in `packages/core/tests/migrate.test.ts`.
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
    versions: await rows(`SELECT version, name, checksum FROM ledger_schema_migrations ORDER BY version`),
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
    }, 60_000);

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

    it('brings a database at every earlier version to the schema a fresh one has', async () => {
      // One migration today, so there is no earlier version to build and this
      // loop has nothing to iterate — said here rather than hidden. It has
      // teeth from the first 002_*.sql without anybody remembering to add a
      // case, and the runner's version of it is proved in core with three.
      const files = readMigrations(MIGRATIONS_DIR);
      const fresh = await emptyDatabase();
      await runMigration(fresh);
      const target = await schemaOf(fresh);
      expect(target.versions).toHaveLength(files.length);

      for (let older = 1; older < files.length; older++) {
        const db = await emptyDatabase();
        await runMigration(db, { to: older });
        await runMigration(db);
        expect(await schemaOf(db), `a database left at version ${older}`).toEqual(target);
      }
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
