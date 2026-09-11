import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readMigrations } from '@metis/core/migrate';
import { runMigration, MIGRATIONS_DIR } from '../src/create-store';
import { PostgresRegistryStore } from '../src/postgres-store';

/**
 * The registry's migrations, on databases of their own.
 *
 * G-076: `001_registry.sql` once reached its full schema only on a second run,
 * and CI — which migrates an empty database from two test files at once —
 * failed whenever the wrong file took the lock first. G-077: each migration is
 * now a numbered file the runner applies once and records, and `001` was
 * rewritten as a plain baseline. The runner's own refusals are proved in
 * `packages/core/tests/migrate.test.ts`; these hold this store's files to them.
 *
 * Every other check in this package migrates a database another file may
 * already have migrated, which is exactly the condition that hides this class.
 * So this file creates a database of its own, nothing else touches it, and
 * each case starts from an empty schema in it.
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

/**
 * Everything the migrations create, and what the database says it has run.
 *
 * Columns, constraints, indexes and triggers — the four things a migration can
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
    versions: await rows(`SELECT version, name, checksum FROM registry_schema_migrations ORDER BY version`),
  };
}

if (!reachable) {
  it.skip(`postgres at ${DATABASE_URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  describe('the registry migrations on an empty database', () => {
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
      // The comparison rather than a list of expected columns: a list would
      // have to be kept in step with the migration by hand, and the defect it
      // guards against is exactly a migration out of step with itself.
      const db = await emptyDatabase();
      await runMigration(db);
      const once = await schemaOf(db);
      await runMigration(db);
      const twice = await schemaOf(db);

      expect(once.columns.length, 'the migration created no columns at all').toBeGreaterThan(0);
      expect(once.versions.length, 'nothing was recorded as run').toBeGreaterThan(0);
      expect(once).toEqual(twice);
    });

    it('leaves the store able to read after one run', async () => {
      // The symptom CI saw under G-076, asserted directly: every read selects `tests`.
      const db = await emptyDatabase();
      await runMigration(db);
      const store = new PostgresRegistryStore(db);

      await expect(store.listVersions('telco-uk', 'never-published')).resolves.toEqual([]);
      await expect(store.getVersion('telco-uk', 'never-published', '1.0.0')).resolves.toBeUndefined();
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

    it('names its foreign keys, so no database carries the pre-rename names', async () => {
      // A registry created before the 2026-09-05 vocabulary rename kept both
      // foreign keys under `…_strategy_name_…_fkey`, because the rename renamed
      // the columns and Postgres does not rename a constraint it named itself
      // (G-077). The baseline names them, and a database built the old way is
      // refused below rather than adopted with the old names inside it.
      const db = await emptyDatabase();
      await runMigration(db);
      const { constraints } = await schemaOf(db);

      const foreignKeys = constraints
        .filter((c) => c.on_table === 'registry_environments' && String(c.definition).startsWith('FOREIGN KEY'))
        .map((c) => c.conname)
        .sort();
      expect(foreignKeys).toEqual([
        'registry_environments_active_version_fkey',
        'registry_environments_previous_version_fkey',
      ]);
      expect(constraints.filter((c) => /strategy/.test(String(c.conname)))).toEqual([]);
    });

    it('refuses a database built before the runner, rather than adopting it', async () => {
      // What every registry database looked like before G-077: its tables, and
      // no record of how they came to be there.
      const db = await emptyDatabase();
      await db.query('CREATE TABLE registry_versions (tenant_id text)');

      await expect(runMigration(db)).rejects.toEqual(
        expect.objectContaining({ name: 'MigrationError', code: 'UNVERSIONED' })
      );
    });
  });
}
