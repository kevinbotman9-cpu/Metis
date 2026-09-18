#!/usr/bin/env node
/**
 * Seed a PostgreSQL ledger with the generated history — ADR-018 clauses 2 and 3.
 *
 * Run from `apps/console`, because the generator lives here:
 *
 *   METIS_DATABASE_URL=… METIS_DATA_CLASS=synthetic \
 *     npm run seed:ledger -- --tenant telco-us
 *
 * and to replace a history somebody has already written to:
 *
 *   npm run seed:ledger -- --reset --tenant telco-us --by marcus.webb
 *
 * A reset of a tenant holding decisions made by using the console — decided
 * after the seeded corpus ends — refuses and says how many, because nothing can
 * regenerate them. To go ahead, acknowledge the exact count:
 *
 *   npm run seed:ledger -- --reset --tenant telco-us --by marcus.webb --discard-made-by-hand 37
 *
 * It is never an API operation. `POST /api/_test/reset` refuses a PostgreSQL
 * store and keeps refusing it: clearing a database from a test endpoint is not
 * a thing the console should be able to do.
 *
 * Every rule about what it may do is in `mocks/seed-plan.ts`, tested there.
 * This file is the wiring: read the ledger, ask the planner, do what it says.
 */
import { Pool } from 'pg';
import { DecisionLedger, PostgresLedgerStore, dataClassOf, runMigration } from '@metis/ledger';
import { Governance, createGovernanceStore } from '@metis/governance';
import { planSeed } from '../mocks/seed-plan';
import { seedLedger } from '../mocks/seed-ledger';
import { SEEDED_BEFORE } from '../mocks/fixtures/engine';

function arg(name: string): string | undefined {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const inline = process.argv.find((a) => a.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<number> {
  const url = process.env.METIS_DATABASE_URL;
  if (!url) {
    console.error(
      'No METIS_DATABASE_URL. This command seeds a database; a console without one seeds its memory at start instead (METIS_SEED_LEDGER).'
    );
    return 1;
  }

  const tenant = arg('tenant');
  const reset = has('reset');
  const by = arg('by');
  const count = arg('count') ? Number(arg('count')) : undefined;
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
    console.error(`--count must be a whole number of decisions; got ${arg('count')}`);
    return 1;
  }
  const discard = arg('discard-made-by-hand');
  const discardMadeByHand = discard === undefined ? undefined : Number(discard);
  if (discardMadeByHand !== undefined && (!Number.isInteger(discardMadeByHand) || discardMadeByHand < 1)) {
    console.error(`--discard-made-by-hand must be the number of decisions to discard; got ${discard}`);
    return 1;
  }

  const pool = new Pool({ connectionString: url });
  try {
    // The schema this code expects, applied the same way every store applies
    // it. A ledger behind this release would otherwise fail mid-write.
    await runMigration(pool);

    const ledger = new DecisionLedger(new PostgresLedgerStore(pool));
    const { rows } = await pool.query<{ tenant_id: string }>(
      'SELECT DISTINCT tenant_id FROM decision_records ORDER BY tenant_id'
    );
    const tenantsInLedger = rows.map((r) => r.tenant_id);
    const existingForTenant = tenant ? await ledger.count({ tenantId: tenant }) : 0;
    // Decided after the seeded corpus ends: made by using the console.
    const madeByHand = tenant ? await ledger.count({ tenantId: tenant, from: SEEDED_BEFORE }) : 0;

    const plan = planSeed({
      tenant,
      reset,
      by,
      dataClass: dataClassOf(process.env.METIS_DATA_CLASS),
      tenantsInLedger,
      existingForTenant,
      madeByHand,
      discardMadeByHand,
    });

    if (plan.kind === 'refuse') {
      console.error(plan.reason);
      return 1;
    }
    if (plan.kind === 'leave') {
      console.log(plan.reason);
      return 0;
    }

    if (plan.kind === 'reset-and-seed') {
      // One statement, and the order the foreign keys need. TRUNCATE rather
      // than DELETE because the append-only triggers refuse a row delete and
      // this command does not bypass them (ADR-004 clause 2).
      await pool.query('TRUNCATE delivery_attempts, outcome_events, idempotency_keys, decision_records');
      console.log(`Reset: ${existingForTenant} decisions and everything joined to them removed for ${tenant}.`);

      const governance = await createGovernanceStore({ databaseUrl: url });
      try {
        await new Governance(governance.store).record(tenant!, {
          timestamp: new Date().toISOString(),
          actor: by!,
          actorType: 'human',
          eventType: 'LedgerReset',
          scope: 'tenant',
          summary: `Truncated the ledger for ${tenant} before reseeding: ${existingForTenant} decisions removed.`,
          changeSetId: null,
        });
      } finally {
        await governance.close?.();
      }
    }

    const report = await seedLedger(ledger, { count, tenantId: tenant });
    console.log(
      `Seeded ${tenant}: ${report.decisions} decisions, ${report.deliveries} deliveries, ` +
        `${report.outcomes} outcomes in ${(report.ms / 1000).toFixed(1)}s.`
    );
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => process.exit(code),
  (e: Error) => {
    console.error(e.message);
    process.exit(1);
  }
);
