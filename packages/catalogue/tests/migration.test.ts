import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readMigrations } from '@metis/core/migrate';
import { runMigration, MIGRATIONS_DIR } from '../src/create-store';
import { PostgresCatalogueStore } from '../src/postgres-store';

/**
 * One migration run on an empty database produces the whole schema.
 *
 * The registry's migration did not (G-076): it added a column with an ALTER
 * that ran before its CREATE, so an empty database got the column only on a
 * second run, and CI — which migrates an empty database from more than one
 * file — failed whenever the wrong file took the lock first. That migration and
 * this one are written the same way and run the same way, and nothing else
 * checks this class: every other test here migrates a database some other file
 * may already have migrated, which is exactly what hides it.
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

/**
 * A database of this file's own, so no other file's migration can have run in
 * it, emptied before each case.
 *
 * One per case was the first design, and it made cleanup the slowest thing in
 * the package: every `CREATE DATABASE` copies the template into shared buffers,
 * and the first `DROP DATABASE` forces a checkpoint that writes them all — 54
 * seconds for ten databases on a development machine, past the hook's limit,
 * failing a suite whose every assertion had passed (G-078). Dropping and
 * recreating the `public` schema gives each case the same empty start — no
 * tables, functions, triggers or version table — for one copy instead of ten.
 */
let own: { name: string; pool: Pool } | undefined;

async function emptyDatabase(): Promise<Pool> {
  if (!own) {
    const name = `metis_migration_check_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(DATABASE_URL);
    url.pathname = `/${name}`;
    own = { name, pool: new Pool({ connectionString: url.toString(), max: 2 }) };
  }
  await own.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  return own.pool;
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
    versions: await rows(`SELECT version, name, checksum FROM catalogue_schema_migrations ORDER BY version`),
  };
}

if (!reachable) {
  it.skip(`postgres at ${DATABASE_URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  describe('the catalogue migration on an empty database', () => {
    afterAll(async () => {
      if (own) {
        await own.pool.end();
        // Not `WITH (FORCE)`. `pool.end()` resolves before its connections have
        // closed, and forcing terminates one still closing: the server sends it
        // `57P01`, the pool re-emits that with nobody listening, and the file
        // fails with every assertion passed (G-081). A plain drop waits for the
        // connections to go, and refuses by name if one never does.
        await admin.query(`DROP DATABASE IF EXISTS ${own.name}`);
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
      // The edit log's append-only trigger is what makes it an audit, so its
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
      // Every table the store reads, against tables nothing has written to.
      const db = await emptyDatabase();
      await runMigration(db);
      const store = new PostgresCatalogueStore(db);

      await expect(store.read('telco-uk')).resolves.toEqual({
        objectives: [],
        categories: [],
        offers: [],
        creatives: [],
        targetingPolicies: [],
        frequencyPolicies: [],
        boosts: [],
        arbitration: null,
      });
      await expect(store.listEvents({ tenantId: 'telco-uk' })).resolves.toEqual([]);
      await expect(store.listTenants()).resolves.toEqual([]);
    });
  });
}
