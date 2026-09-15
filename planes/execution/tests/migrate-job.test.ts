import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import type { Connectable } from '@metis/core/migrate';
import { runJob, STORES } from '../src/migrate-job';

/**
 * The migration job against a real database. ADR-016 §3.2 and §3.5.
 *
 * The three things a deployment relies on: an empty database reaches every
 * store's schema, a second run changes nothing, and a refusal stops the job
 * without applying anything further — and without acting on its advice.
 */

const DATABASE_URL =
  process.env.METIS_TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/metis_registry_test';

const admin = new Pool({ connectionString: DATABASE_URL, max: 2 });
let reachable = false;
try {
  reachable = (await admin.query('select 1')).rowCount === 1;
} catch {
  reachable = false;
}

const name = `metis_migrate_job_${process.pid}_${Date.now()}`;
let pool: Pool | undefined;

async function freshDatabase(): Promise<Pool> {
  if (!pool) {
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(DATABASE_URL);
    url.pathname = `/${name}`;
    pool = new Pool({ connectionString: url.toString(), max: 2 });
  }
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  return pool;
}

if (!reachable) {
  it.skip(`postgres at ${DATABASE_URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  describe('the migration job', () => {
    afterAll(async () => {
      await pool?.end();
      // Not WITH (FORCE), for the reason packages/core/tests/migrate.test.ts gives (G-081).
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }, 60_000);

    it('brings an empty database to every store’s schema, and a second run changes nothing', async () => {
      const db = await freshDatabase();

      const first = await runJob(db as unknown as Connectable);
      expect(first.ok).toBe(true);
      expect(first.lines.map((l) => l.split(':')[0])).toEqual(STORES.map((s) => s.name));
      expect(first.lines.every((l) => /applied/.test(l))).toBe(true);

      const second = await runJob(db as unknown as Connectable);
      expect(second.ok).toBe(true);
      expect(second.lines.every((l) => /nothing to apply/.test(l))).toBe(true);
    });

    it('stops at a refusal, applies nothing after it, and does not act on its advice', async () => {
      const db = await freshDatabase();
      await runJob(db as unknown as Connectable);
      // A recorded checksum that no longer matches its file: what a hand-edited
      // migration looks like from the database's side.
      await db.query(`UPDATE governance_schema_migrations SET checksum = 'edited' WHERE version = 1`);
      await db.query('DROP TABLE registry_schema_migrations');

      const result = await runJob(db as unknown as Connectable);

      expect(result.ok).toBe(false);
      expect(result.lines.some((l) => /^governance: REFUSED \(CHANGED\)/.test(l))).toBe(true);
      // Stopped at governance: ledger and registry were not attempted, so the
      // registry's dropped record was not "repaired" by re-running its baseline.
      expect(result.lines.some((l) => l.startsWith('ledger:') || l.startsWith('registry:'))).toBe(false);
      expect((await db.query(`SELECT to_regclass('registry_schema_migrations') AS t`)).rows[0].t).toBeNull();
      // And the edited row is still edited: nothing rewrote it.
      expect((await db.query(`SELECT checksum FROM governance_schema_migrations WHERE version = 1`)).rows[0].checksum).toBe('edited');
    });
  });
}
