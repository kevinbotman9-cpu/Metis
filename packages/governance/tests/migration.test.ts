import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readMigrations } from '@metis/core/migrate';
import { runMigration, MIGRATIONS_DIR } from '../src/create-store';
import { PostgresGovernanceStore } from '../src/postgres-store';

/**
 * One migration run on an empty database produces the whole schema, and a
 * database at any earlier version reaches it. Same shape as
 * `packages/catalogue/tests/migration.test.ts`; the runner's own refusals are
 * proved in `packages/core/tests/migrate.test.ts`.
 *
 * A database of this file's own, emptied before each case, because every other
 * check here migrates a database another file may already have migrated — the
 * condition that hides a migration out of step with itself (G-076).
 */

const DATABASE_URL =
  process.env.METIS_TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/metis_registry_test';

/** Only ever used to create and drop the database below. */
const admin = new Pool({ connectionString: DATABASE_URL, max: 2 });

let reachable = false;
try {
  reachable = (await admin.query('select 1')).rowCount === 1;
} catch {
  reachable = false;
}

let own: { name: string; pool: Pool } | undefined;

/** One database for the file, its schema dropped per case (G-078). */
async function emptyDatabase(): Promise<Pool> {
  if (!own) {
    const name = `metis_governance_migration_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(DATABASE_URL);
    url.pathname = `/${name}`;
    own = { name, pool: new Pool({ connectionString: url.toString(), max: 2 }) };
  }
  await own.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  return own.pool;
}

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
    versions: await rows(`SELECT version, name, checksum FROM governance_schema_migrations ORDER BY version`),
  };
}

if (!reachable) {
  it.skip(`postgres at ${DATABASE_URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  describe('the governance migrations on an empty database', () => {
    afterAll(async () => {
      if (own) {
        await own.pool.end();
        // Not `WITH (FORCE)`: G-081.
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
      expect(once.triggers.length, 'the decide-once and append-only triggers are missing').toBeGreaterThan(0);
      expect(once).toEqual(twice);
    });

    it('brings a database at every earlier version to the schema a fresh one has', async () => {
      // One migration today, so the loop has nothing to iterate; it starts
      // checking the day `002_*.sql` arrives, without anyone remembering to.
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
      const db = await emptyDatabase();
      await runMigration(db);
      const store = new PostgresGovernanceStore(db);

      await expect(store.listChangeSets('telco-us')).resolves.toEqual([]);
      await expect(store.listAuditEvents('telco-us')).resolves.toEqual([]);
      await expect(store.countAuditEvents('telco-us')).resolves.toBe(0);
    });
  });
}
