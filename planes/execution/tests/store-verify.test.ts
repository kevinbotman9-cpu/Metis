import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createCatalogueStore } from '@metis/catalogue';
import { createGovernanceStore } from '@metis/governance';
import { createLedgerStore } from '@metis/ledger';
import { createRegistryStore } from '@metis/registry';
import type { Connectable } from '@metis/core/migrate';
import { runJob } from '../src/migrate-job';

/**
 * Every store factory, in verify mode, against a real database. ADR-016 §3.1.
 *
 * In the decision service's tests because this is the package that depends on
 * all four stores, and because a service is exactly the process that must never
 * migrate: against a database the migration job has not run, each factory
 * refuses to hand out a store, and after the job each one opens.
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

const name = `metis_store_verify_${process.pid}_${Date.now()}`;
const url = (() => {
  const u = new URL(DATABASE_URL);
  u.pathname = `/${name}`;
  return u.toString();
})();

const FACTORIES = [
  ['catalogue', (mode: 'verify' | undefined) => createCatalogueStore({ databaseUrl: url, migrations: mode })],
  ['governance', (mode: 'verify' | undefined) => createGovernanceStore({ databaseUrl: url, migrations: mode })],
  ['ledger', (mode: 'verify' | undefined) => createLedgerStore({ databaseUrl: url, migrations: mode, dataClass: 'synthetic' })],
  ['registry', (mode: 'verify' | undefined) => createRegistryStore({ databaseUrl: url, migrations: mode })],
] as const;

if (!reachable) {
  it.skip(`postgres at ${DATABASE_URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  describe('a store in verify mode', () => {
    afterAll(async () => {
      // Not WITH (FORCE), for the reason packages/core/tests/migrate.test.ts gives (G-081).
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }, 60_000);

    it('refuses to open against a database the migration job has not run, and opens after it', async () => {
      await admin.query(`CREATE DATABASE ${name}`);

      for (const [store, open] of FACTORIES) {
        await expect(open('verify'), `${store} opened against an unmigrated database`).rejects.toThrow(/has not run/);
      }

      // Nothing was created by the refusals: verify mode never writes a schema.
      const probe = new Pool({ connectionString: url, max: 1 });
      try {
        const { rows } = await probe.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`);
        expect(rows[0].n).toBe(0);

        expect((await runJob(probe as unknown as Connectable)).ok).toBe(true);
      } finally {
        await probe.end();
      }

      for (const [store, open] of FACTORIES) {
        const handle = await open('verify');
        expect(handle.kind, store).toBe('postgres');
        await handle.close();
      }
    });

    it('verifies by default in a production build', async () => {
      const previous = { node: process.env.NODE_ENV, mode: process.env.METIS_MIGRATIONS };
      const probe = new Pool({ connectionString: url, max: 1 });
      try {
        // A fresh schema, so only a store that migrated could open.
        await probe.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        process.env.NODE_ENV = 'production';
        delete process.env.METIS_MIGRATIONS;
        await expect(createRegistryStore({ databaseUrl: url })).rejects.toThrow(/has not run/);
      } finally {
        process.env.NODE_ENV = previous.node;
        if (previous.mode === undefined) delete process.env.METIS_MIGRATIONS;
        else process.env.METIS_MIGRATIONS = previous.mode;
        await probe.end();
      }
    });
  });
}
