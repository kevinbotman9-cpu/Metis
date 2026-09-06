import { it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresLedgerStore } from '../src/postgres-store';
import { runMigration } from '../src/create-store';
import { describeLedger } from './suite';

/**
 * The same behaviour suite, against a real PostgreSQL.
 *
 * Real, not a fake: the point of durable storage is the things a fake cannot
 * have — a serialisation boundary that can lose a nested field, foreign keys
 * that refuse an outcome for a decision nobody made, and triggers that reject
 * an UPDATE no matter what the application intended.
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
  await runMigration(pool);

  describeLedger('ledger over postgres', {
    async create() {
      // Truncate rather than delete: the triggers reject DELETE row by row,
      // and TRUNCATE is the statement-level operation that gets past them.
      // CASCADE because idempotency_keys and outcome_events reference
      // decision_records — which is itself worth knowing, since it means a
      // decision cannot be removed while anything still points at it.
      await pool.query(
        'TRUNCATE outcome_events, idempotency_keys, decision_records RESTART IDENTITY CASCADE'
      );
      return new PostgresLedgerStore(pool);
    },
    enforcesForeignKeys: true,
  });

  // The pool closes at file scope, not in the suite harness. The harness's
  // afterAll runs when its describe block finishes, which is before the
  // top-level assertions below — closing there left them talking to a dead
  // pool and reporting "cannot use a pool after end" instead of what they
  // actually check.
  afterAll(async () => {
    await pool.end();
  });

  // --- What only the schema can prove -------------------------------------
  //
  // The application already refuses these. Asserting them here is the point of
  // enforcing immutability twice: a convention that lives only in application
  // code survives exactly until somebody writes a migration script, an admin
  // query, or a second service.

  it('the database refuses to update a decision record', async () => {
    await pool.query(
      `INSERT INTO decision_records
         (tenant_id, decision_id, subject_hash, occurred_at, flow_id, flow_version, chain_hash, record)
       VALUES ('t', 'dec_trig', 'sub', now(), 'f', '1.0.0', 'h', '{}'::jsonb)
       ON CONFLICT DO NOTHING`
    );
    await expect(
      pool.query(`UPDATE decision_records SET chain_hash = 'tampered' WHERE decision_id = 'dec_trig'`)
    ).rejects.toThrow(/append-only/);
  });

  it('the database refuses to delete a decision record', async () => {
    await expect(
      pool.query(`DELETE FROM decision_records WHERE decision_id = 'dec_trig'`)
    ).rejects.toThrow(/append-only/);
  });

  it('the database refuses an outcome for a decision that does not exist', async () => {
    // The ledger checks this too. Here it is a foreign key, so it holds against
    // anything that writes to the table, not only against code that remembered.
    await expect(
      pool.query(
        `INSERT INTO outcome_events (tenant_id, decision_id, type, occurred_at)
         VALUES ('t', 'dec_nobody_made', 'click', now())`
      )
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('the database refuses an idempotency key pointing at no decision', async () => {
    // Without this the pointer can outlive its target, and a retry resolves to
    // a decision that is not there.
    await expect(
      pool.query(
        `INSERT INTO idempotency_keys (tenant_id, key, request_hash, decision_id, stored_at)
         VALUES ('t', 'k', 'h', 'dec_nobody_made', now())`
      )
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('refuses an outcome type outside the enumerated set', async () => {
    // The CHECK constraint, so a typo in a channel integration is a rejected
    // write rather than a row nothing will ever aggregate.
    await expect(
      pool.query(
        `INSERT INTO outcome_events (tenant_id, decision_id, type, occurred_at)
         VALUES ('t', 'dec_trig', 'clicked_maybe', now())`
      )
    ).rejects.toThrow(/check|violates/i);
  });
}
