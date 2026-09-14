import { it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresGovernanceStore } from '../src/postgres-store';
import { runMigration } from '../src/create-store';
import { Governance } from '../src/governance';
import { describeGovernance, changeSet, event } from './suite';

/**
 * The same behaviour suite, against a real PostgreSQL, and the rules only the
 * schema can hold: a decided change set cannot be updated whatever the
 * application intended, and the audit log cannot be rewritten.
 *
 * Skipped rather than failed when no database is reachable. CI runs a postgres
 * service, so the skip does not become the normal case.
 */

const URL =
  process.env.METIS_TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/metis_registry_test';

const pool = new Pool({ connectionString: URL, max: 4 });

let reachable = false;
try {
  reachable = (await pool.query('select 1')).rowCount === 1;
} catch {
  reachable = false;
}

const T = 'telco-us';
const AT = '2026-09-14T09:00:00.000Z';

if (!reachable) {
  it.skip(`postgres at ${URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  await runMigration(pool);

  // TRUNCATE, because the triggers refuse DELETE row by row.
  const truncate = () =>
    pool.query('TRUNCATE governance_change_sets, governance_audit_events RESTART IDENTITY');

  describeGovernance('governance over postgres', {
    async create() {
      await truncate();
      return new PostgresGovernanceStore(pool);
    },
  });

  // At file scope: the harness's afterAll runs before the assertions below.
  afterAll(async () => {
    await pool.end();
  });

  it('the database refuses to change a change set once it is decided', async () => {
    await truncate();
    const governance = new Governance(new PostgresGovernanceStore(pool));
    await governance.open(T, changeSet());
    await governance.decide(T, 'cr_0001', { status: 'approved', decidedBy: 'priya', decidedAt: AT, reason: 'Fine.' });

    await expect(
      pool.query(`UPDATE governance_change_sets SET status = 'pending' WHERE id = 'cr_0001'`)
    ).rejects.toThrow(/a decision is final/);
    await expect(pool.query('DELETE FROM governance_change_sets')).rejects.toThrow(/DELETE is not permitted/);
  });

  it('the database refuses to rewrite the audit log', async () => {
    await truncate();
    await new Governance(new PostgresGovernanceStore(pool)).record(T, event());

    await expect(pool.query(`UPDATE governance_audit_events SET body = '{}'`)).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM governance_audit_events')).rejects.toThrow(/append-only/);
  });

  it('reads back what a second store over the same database wrote', async () => {
    // What a restarted process gets: nothing held in the store object itself.
    await truncate();
    const first = new Governance(new PostgresGovernanceStore(pool));
    await first.open(T, changeSet());
    await first.decide(T, 'cr_0001', { status: 'approved', decidedBy: 'priya', decidedAt: AT, reason: 'Fine.' });
    const recorded = await first.record(T, event());

    const second = new Governance(new PostgresGovernanceStore(pool));
    expect(await second.changeSet(T, 'cr_0001')).toMatchObject({ status: 'approved', decidedBy: 'priya' });
    expect(await second.events(T)).toEqual([recorded]);
    await expect(
      second.decide(T, 'cr_0001', { status: 'approved', decidedBy: 'marcus', decidedAt: AT, reason: 'Again.' })
    ).rejects.toMatchObject({ code: 'ALREADY_DECIDED' });
  });
}
