import { it, expect } from 'vitest';
import { Pool } from 'pg';
import { PostgresRegistryStore } from '../src/postgres-store';
import { runMigration } from '../src/create-store';
import { describeRegistry, context, source } from './suite';

/**
 * The same behaviour suite, against a real PostgreSQL.
 *
 * Real, not a fake: the point of durable storage is the things a fake cannot
 * have — a serialisation boundary that can lose a nested field, a sequence
 * assigned by the database, and triggers that refuse an UPDATE no matter what
 * the application intended.
 *
 * Skipped rather than failed when no database is reachable, so a developer
 * without one can still run the rest. CI runs a postgres service, so the skip
 * does not become the normal case.
 */

const URL =
  process.env.METIS_TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/metis_registry_test';

const pool = new Pool({ connectionString: URL, max: 4 });

let reachable = false;
try {
  const probe = await pool.query('select 1');
  reachable = probe.rowCount === 1;
} catch {
  reachable = false;
}

if (!reachable) {
  it.skip(`postgres at ${URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  // Through runMigration rather than raw SQL, so this file and create-store.ts
  // — which vitest runs in parallel worker processes — take the same advisory
  // lock. Applying the DDL directly here deadlocked against the other file's
  // startup migration: `40P01`, waiting on `pg_proc`. Intermittent, and I could
  // not make it reproduce on demand, so treat the lock as the fix for the race
  // rather than for a reliably failing test.
  await runMigration(pool);

  describeRegistry('registry over postgres', {
    async create() {
      // Truncate rather than drop: the triggers reject DELETE row by row, and
      // TRUNCATE is the statement-level operation that gets past them. Which is
      // itself worth knowing — the append-only guarantee is about rows, not
      // about a deliberate administrative reset.
      await pool.query(
        'TRUNCATE registry_environments, registry_versions, registry_events RESTART IDENTITY'
      );
      return new PostgresRegistryStore(pool);
    },
    async teardown() {
      await pool.end();
    },
    extra(getRegistry) {
      it('the database refuses to update a published version', async () => {
        // Immutability enforced in application code is a convention that lasts
        // until somebody writes an admin query. This is the other half.
        const registry = getRegistry();
        await registry.publish(
          {
            tenantId: 'telco-uk',
            strategyName: 'inbound-web-offers',
            version: '1.0.0',
            source: source(),
            actor: 'test',
            occurredAt: '2026-06-01T12:00:00.000Z',
          },
          context()
        );

        await expect(
          pool.query(`UPDATE registry_versions SET published_by = 'someone else'`)
        ).rejects.toThrow(/append-only/);

        await expect(pool.query(`DELETE FROM registry_versions`)).rejects.toThrow(/append-only/);
      });

      it('the database refuses to rewrite the event log', async () => {
        const registry = getRegistry();
        await registry.publish(
          {
            tenantId: 'telco-uk',
            strategyName: 'inbound-web-offers',
            version: '1.0.0',
            source: source(),
            actor: 'test',
            occurredAt: '2026-06-01T12:00:00.000Z',
          },
          context()
        );

        await expect(
          pool.query(`UPDATE registry_events SET summary = 'rewritten'`)
        ).rejects.toThrow(/append-only/);
      });

      it('refuses an environment pointing at a version that was never published', async () => {
        // The pointer must not outlive its target, or "production is running
        // 2.4.0" stops being a fact about anything.
        await expect(
          pool.query(
            `INSERT INTO registry_environments
               (tenant_id, strategy_name, environment, active_version)
             VALUES ('telco-uk', 'inbound-web-offers', 'production', '404.0.0')`
          )
        ).rejects.toThrow();
      });

      it('assigns sequence numbers from the database, not the process', async () => {
        const registry = getRegistry();
        for (const version of ['1.0.0', '2.0.0']) {
          await registry.publish(
            {
              tenantId: 'telco-uk',
              strategyName: 'inbound-web-offers',
              version,
              source: source({
                nodes: [
                  { id: 'n1_source', type: 'source', label: `Source ${version}`, estimatedMs: 2 },
                  { id: 'n2_arbitrate', type: 'arbitrate', label: 'Arbitrate', estimatedMs: 1 },
                ],
              }),
              actor: 'test',
              occurredAt: '2026-06-01T12:00:00.000Z',
            },
            context()
          );
        }

        const events = await registry.events({ tenantId: 'telco-uk' });
        expect(events).toHaveLength(2);
        expect(events[0].seq).toBeGreaterThan(events[1].seq);
      });
    },
  });
}
