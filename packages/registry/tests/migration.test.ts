import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { runMigration } from '../src/create-store';
import { PostgresRegistryStore } from '../src/postgres-store';

/**
 * One migration run on an empty database produces the whole schema.
 *
 * G-076. `001_registry.sql` added `registry_versions.tests` with an ALTER that
 * ran before the CREATE, and the CREATE did not declare the column. The first
 * run on an empty database skipped the ALTER — there was no table yet — and
 * created the table without it, so the column appeared only on a second run.
 * CI starts an empty database for every job and two test files each migrate
 * it, so the Registry step passed when one file took the migration lock first
 * and failed when the other did: four of sixty runs, once on `main`.
 *
 * Every other check in this package migrates a database another file may
 * already have migrated, which is exactly the condition that hides this. So
 * each case here creates its own database, and nothing else ever touches it.
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

/**
 * Everything the migration creates, in a form two databases can be compared by.
 *
 * Columns, constraints, indexes and triggers: the four things a migration can
 * leave half-built, and the four a store or the append-only guarantee reads.
 */
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
  describe('the registry migration on an empty database', () => {
    afterAll(async () => {
      await Promise.all(pools.map((p) => p.end()));
      for (const name of created) {
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      }
      await admin.end();
    });

    it('produces, in one run, the schema that two runs produce', async () => {
      // The comparison rather than a list of expected columns: a list would
      // have to be kept in step with the migration by hand, and the defect it
      // guards against is exactly a migration out of step with itself.
      const db = await emptyDatabase();
      await runMigration(db);
      const once = await schemaOf(db);
      await runMigration(db);
      const twice = await schemaOf(db);

      expect(once.columns.length, 'the migration created no columns at all').toBeGreaterThan(0);
      expect(once).toEqual(twice);
    });

    it('leaves the store able to read after one run', async () => {
      // The symptom CI saw, asserted directly: every read selects `tests`.
      const db = await emptyDatabase();
      await runMigration(db);
      const store = new PostgresRegistryStore(db);

      await expect(store.listVersions('telco-uk', 'never-published')).resolves.toEqual([]);
      await expect(store.getVersion('telco-uk', 'never-published', '1.0.0')).resolves.toBeUndefined();
    });

    it('still adds the column to a table created before it existed', async () => {
      // A database migrated before 2026-09-06 has `registry_versions` without
      // `tests`, and `CREATE TABLE IF NOT EXISTS` will not add it. Dropping the
      // column from a migrated table is the nearest reproducible stand-in for
      // one of those; the ALTER is what brings it back.
      const db = await emptyDatabase();
      await runMigration(db);
      await db.query('ALTER TABLE registry_versions DROP COLUMN tests');
      await runMigration(db);

      const { rows } = await db.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_name = 'registry_versions' AND column_name = 'tests'`
      );
      expect(rows).toHaveLength(1);
    });
  });
}
