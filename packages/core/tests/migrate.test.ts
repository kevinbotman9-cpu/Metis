import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { migrate, readMigrations, checksumOf } from '../src/migrate';

/**
 * The migration runner — G-077.
 *
 * Every refusal the runner makes is a case here, and each was seen to fail with
 * the refusal taken out of the runner. The three that matter most, named in the
 * slice that built it: an edited applied file, a missing file in the sequence,
 * and a database at an older version reaching the schema a fresh one does.
 *
 * A synthetic sequence rather than a store's, because each store has one
 * migration today and an older version of it does not exist yet. This one has
 * three, so there is an older database to build.
 */

const V1 = `CREATE TABLE widgets (id text PRIMARY KEY, name text NOT NULL);\n`;
const V2 =
  `ALTER TABLE widgets ADD COLUMN colour text NOT NULL DEFAULT 'none';\n` +
  `CREATE INDEX widgets_by_colour ON widgets (colour);\n`;
const V3 =
  `CREATE TABLE widget_events (seq bigserial PRIMARY KEY, widget_id text NOT NULL REFERENCES widgets (id));\n` +
  `CREATE FUNCTION widget_events_append_only() RETURNS trigger AS $$\n` +
  `BEGIN\n  RAISE EXCEPTION 'append-only';\nEND;\n$$ LANGUAGE plpgsql;\n` +
  `CREATE TRIGGER widget_events_no_update BEFORE UPDATE OR DELETE ON widget_events\n` +
  `  FOR EACH ROW EXECUTE FUNCTION widget_events_append_only();\n`;
const SEQUENCE = { '001_widgets.sql': V1, '002_colour.sql': V2, '003_events.sql': V3 };

const tempDirs: string[] = [];
function dirWith(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metis-migrations-'));
  tempDirs.push(dir);
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

const refusal = (code: string) => expect.objectContaining({ name: 'MigrationError', code });

describe('reading a migration directory', () => {
  it('reads the files in order, with a checksum each', () => {
    const found = readMigrations(dirWith(SEQUENCE));
    expect(found.map((m) => [m.version, m.name])).toEqual([
      [1, '001_widgets.sql'],
      [2, '002_colour.sql'],
      [3, '003_events.sql'],
    ]);
    expect(found[0].checksum).toBe(checksumOf(V1));
  });

  it('gives a file the same checksum whatever its line endings', () => {
    // A Windows checkout reads CRLF and CI reads LF. If the two differed, a
    // database migrated on one would refuse to start from the other.
    expect(checksumOf('CREATE TABLE a (b int);\r\nCREATE TABLE c (d int);\r\n')).toBe(
      checksumOf('CREATE TABLE a (b int);\nCREATE TABLE c (d int);\n')
    );
    expect(checksumOf(V1)).not.toBe(checksumOf(V1 + '-- one more line\n'));
  });

  it('refuses a missing file in the sequence', () => {
    const dir = dirWith({ '001_widgets.sql': V1, '003_events.sql': V3 });
    expect(() => readMigrations(dir)).toThrow(refusal('GAP'));
    expect(() => readMigrations(dir)).toThrow(/002_\*\.sql is missing/);
  });

  it('refuses two files claiming one version', () => {
    const dir = dirWith({ '001_widgets.sql': V1, '001_other.sql': V2 });
    expect(() => readMigrations(dir)).toThrow(refusal('DUPLICATE'));
  });

  it('refuses a file that is not named like a migration', () => {
    expect(() => readMigrations(dirWith({ '1_widgets.sql': V1 }))).toThrow(refusal('NOT_A_MIGRATION'));
    expect(() => readMigrations(dirWith({ '001_Widgets.sql': V1 }))).toThrow(refusal('NOT_A_MIGRATION'));
  });

  it('refuses a file that opens or closes its own transaction', () => {
    expect(() => readMigrations(dirWith({ '001_widgets.sql': `BEGIN;\n${V1}COMMIT;\n` }))).toThrow(
      refusal('OWN_TRANSACTION')
    );
  });

  it('does not mistake the BEGIN and END of a function body for a transaction', () => {
    // Every store's baseline has a trigger function. A rule that refused them
    // would be switched off within a week.
    expect(() => readMigrations(dirWith({ '001_widgets.sql': V1, '002_colour.sql': V2, '003_events.sql': V3 }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Against a real database
// ---------------------------------------------------------------------------

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
 * A database of this file's own, emptied before each case.
 *
 * One per case was the first design, and it made cleanup the slowest thing
 * here: every `CREATE DATABASE` copies the template into shared buffers, and
 * the first `DROP DATABASE` forces a checkpoint that writes them all — 54
 * seconds for ten databases on a development machine, past the hook's limit,
 * failing this file with every assertion passed (G-078). Dropping and
 * recreating the `public` schema gives each case the same empty start — no
 * tables, functions, triggers or version table — for one copy instead of ten.
 */
let own: { name: string; url: string; pool: Pool } | undefined;

async function emptyDatabase(): Promise<{ pool: Pool; url: string }> {
  if (!own) {
    const name = `metis_migrate_check_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(DATABASE_URL);
    url.pathname = `/${name}`;
    own = { name, url: url.toString(), pool: new Pool({ connectionString: url.toString(), max: 2 }) };
  }
  await own.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  return { pool: own.pool, url: own.url };
}

const options = (dir: string, to?: number) => ({ component: 'widget', dir, lockKey: 0x77696467, to });

/** The schema, and what the database says it has run. */
async function stateOf(pool: Pool) {
  const rows = async (sql: string) => (await pool.query(sql)).rows;
  return {
    columns: await rows(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = 'public'
       ORDER BY table_name, column_name`),
    constraints: await rows(`
      SELECT conrelid::regclass::text AS on_table, conname, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint WHERE connamespace = 'public'::regnamespace
       ORDER BY on_table, conname`),
    indexes: await rows(`
      SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
       ORDER BY tablename, indexname`),
    triggers: await rows(`
      SELECT event_object_table, trigger_name, event_manipulation, action_statement
        FROM information_schema.triggers WHERE trigger_schema = 'public'
       ORDER BY event_object_table, trigger_name, event_manipulation`),
    versions: await rows(`SELECT version, name, checksum FROM widget_schema_migrations ORDER BY version`),
  };
}

const exists = async (pool: Pool, relation: string) =>
  (await pool.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [relation])).rows[0].present;

if (!reachable) {
  it.skip(`postgres at ${DATABASE_URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  describe('the runner, against a real database', () => {
    // One database to drop now, so one forced checkpoint; the limit stays
    // generous because that checkpoint is still a disk sync on a busy machine.
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

    it('applies each file once, in order, and records what it ran', async () => {
      const { pool } = await emptyDatabase();
      const dir = dirWith(SEQUENCE);

      await expect(migrate(pool, options(dir))).resolves.toEqual({ applied: [1, 2, 3], version: 3 });
      const { versions } = await stateOf(pool);
      expect(versions).toEqual(
        readMigrations(dir).map((m) => ({ version: m.version, name: m.name, checksum: m.checksum }))
      );

      // The second run is the one that used to matter (G-076). Now it does nothing.
      await expect(migrate(pool, options(dir))).resolves.toEqual({ applied: [], version: 3 });
    });

    it('refuses an applied file that has changed, and applies nothing', async () => {
      const { pool } = await emptyDatabase();
      const dir = dirWith({ '001_widgets.sql': V1, '002_colour.sql': V2 });
      await migrate(pool, options(dir));

      // The change G-077 is about: an edit to history instead of a new file.
      // A third file waits behind it, so "applies nothing" is tested, not assumed.
      fs.writeFileSync(path.join(dir, '001_widgets.sql'), V1.replace('name text', 'name text, size int'));
      fs.writeFileSync(path.join(dir, '003_events.sql'), V3);

      const attempt = migrate(pool, options(dir));
      await expect(attempt).rejects.toEqual(refusal('CHANGED'));
      await expect(attempt).rejects.toThrow(/001_widgets\.sql has changed since this database ran it/);
      expect(await exists(pool, 'widget_events')).toBe(false);
      expect((await stateOf(pool)).versions.map((v) => v.version)).toEqual([1, 2]);
    });

    it('refuses a renamed applied file', async () => {
      const { pool } = await emptyDatabase();
      const dir = dirWith({ '001_widgets.sql': V1 });
      await migrate(pool, options(dir));
      fs.renameSync(path.join(dir, '001_widgets.sql'), path.join(dir, '001_gadgets.sql'));
      await expect(migrate(pool, options(dir))).rejects.toEqual(refusal('CHANGED'));
    });

    it('refuses a missing file in the sequence, before touching the database', async () => {
      const { pool } = await emptyDatabase();
      const dir = dirWith({ '001_widgets.sql': V1, '003_events.sql': V3 });

      await expect(migrate(pool, options(dir))).rejects.toEqual(refusal('GAP'));
      // Refused from the directory alone: not even the version table exists.
      expect(await exists(pool, 'widget_schema_migrations')).toBe(false);
      expect(await exists(pool, 'widgets')).toBe(false);
    });

    it('refuses a database that has run a file which is no longer there', async () => {
      const { pool } = await emptyDatabase();
      const dir = dirWith(SEQUENCE);
      await migrate(pool, options(dir));

      // The last file deleted, or this code older than the database: the same
      // thing from the database's side, and neither is safe to start on.
      fs.rmSync(path.join(dir, '003_events.sql'));
      await expect(migrate(pool, options(dir))).rejects.toEqual(refusal('MISSING'));
    });

    it('brings a database at an older version to the schema a fresh one has', async () => {
      const dir = dirWith(SEQUENCE);
      const fresh = await emptyDatabase();
      await migrate(fresh.pool, options(dir));
      const target = await stateOf(fresh.pool);
      expect(target.versions).toHaveLength(3);

      // Every earlier version a release could have left a database at.
      for (const older of [1, 2]) {
        const { pool } = await emptyDatabase();
        await expect(migrate(pool, options(dir, older))).resolves.toEqual({
          applied: Array.from({ length: older }, (_, i) => i + 1),
          version: older,
        });
        expect((await stateOf(pool)).versions).toHaveLength(older);

        await expect(migrate(pool, options(dir))).resolves.toEqual({
          applied: Array.from({ length: 3 - older }, (_, i) => older + i + 1),
          version: 3,
        });
        expect(await stateOf(pool), `a database left at version ${older}`).toEqual(target);
      }
    });

    it('rolls back a file that fails, records nothing for it, and resumes from there', async () => {
      const { pool } = await emptyDatabase();
      const dir = dirWith({ '001_widgets.sql': V1, '002_colour.sql': `${V2}ALTER TABLE nowhere ADD COLUMN x int;\n` });

      await expect(migrate(pool, options(dir))).rejects.toEqual(refusal('FAILED'));
      // The half of 002 that ran is gone with the rest of it.
      const { columns, versions } = await stateOf(pool);
      expect(columns.some((c) => c.column_name === 'colour')).toBe(false);
      expect(versions.map((v) => v.version)).toEqual([1]);

      fs.writeFileSync(path.join(dir, '002_colour.sql'), V2);
      await expect(migrate(pool, options(dir))).resolves.toEqual({ applied: [2], version: 2 });
    });

    it('refuses a database built before versioning, rather than adopting it', async () => {
      // What every store's database looked like before G-077: its objects,
      // and no record of how they came to be there.
      const { pool } = await emptyDatabase();
      await pool.query(V1);

      const attempt = migrate(pool, options(dirWith(SEQUENCE)));
      await expect(attempt).rejects.toEqual(refusal('UNVERSIONED'));
      await expect(attempt).rejects.toThrow(/refused rather than adopted/);
      await expect(attempt).rejects.toThrow(/DROP DATABASE metis_migrate_check_/);
    });

    it('applies each file once when two instances start together', async () => {
      // The condition G-076 was a race in. The lock serialises the two, and the
      // second finds the record the first wrote.
      const { pool, url } = await emptyDatabase();
      const second = new Pool({ connectionString: url, max: 2 });
      const dir = dirWith(SEQUENCE);

      try {
        const results = await Promise.all([migrate(pool, options(dir)), migrate(second, options(dir))]);
        expect(results.map((r) => r.applied.length).sort()).toEqual([0, 3]);
        expect((await stateOf(pool)).versions).toHaveLength(3);
      } finally {
        await second.end();
      }
    });
  });
}
